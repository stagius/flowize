import { AppSettings, TaskItem, WorktreeSlot } from '../types';

/**
 * Executes git operations through the configured local bridge endpoint.
 */

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_AGENT_SUBDIR = '.antigravity';
const DEFAULT_SKILL_FILE = '.opencode/skills/specflow-worktree-automation/SKILL.md';

const normalizeWorktreePath = (value: string): string => {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
};

const parseWorktreeList = (porcelainOutput: string): Array<{ path: string; branch?: string }> => {
  const blocks = porcelainOutput
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return blocks.map((block) => {
    const lines = block.split('\n');
    const pathLine = lines.find((line) => line.startsWith('worktree '));
    const branchLine = lines.find((line) => line.startsWith('branch refs/heads/'));
    return {
      path: pathLine ? pathLine.replace('worktree ', '').trim() : '',
      branch: branchLine ? branchLine.replace('branch refs/heads/', '').trim() : undefined
    };
  }).filter((item) => item.path.length > 0);
};

const fillTemplate = (template: string, values: Record<string, string>): string => {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => values[key] ?? '');
};

const joinPath = (base: string, suffix: string): string => {
  if (base.endsWith('/')) {
    return `${base}${suffix}`;
  }
  return `${base}/${suffix}`;
};

const isAbsolutePath = (value: string): boolean => {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/');
};

const resolvePathForWorktree = (worktreePath: string, value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (isAbsolutePath(trimmed)) {
    return trimmed;
  }
  const normalized = trimmed.replace(/^[.\\/]+/, '');
  return joinPath(worktreePath, normalized);
};

const toShellPath = (value: string): string => {
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return value.replace(/\//g, '\\');
  }
  return value;
};

const ensureWindowsDriveSwitch = (command: string, worktreePath: string): string => {
  if (!/^[a-zA-Z]:\\/.test(worktreePath)) {
    return command;
  }
  return command.replace(/^\s*cd\s+"([a-zA-Z]:\\[^\"]*)"\s*&&/i, 'cd /d "$1" &&');
};

const ensurePrintLogsFlag = (command: string): string => {
  const hasOpenCodeRun = /\bopencode\s+run\b/i.test(command);
  const hasPrintLogs = /\s--print-logs\b/i.test(command);
  if (!hasOpenCodeRun || hasPrintLogs) {
    return command;
  }
  return `${command} --print-logs`;
};

const encodeBase64 = (value: string): string => {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return window.btoa(binary);
  }

  const maybeBuffer = (globalThis as { Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(value, 'utf-8').toString('base64');
  }

  throw new Error('Unable to encode startup issue description to base64 in this runtime.');
};

const buildIssueDescription = (task: TaskItem): string => {
  const lines = [
    `# Issue #${task.issueNumber ?? 'unknown'}: ${task.title}`,
    '',
    '## Description',
    task.description || task.rawText || 'No description provided.',
    '',
    '## Context',
    `- Branch: ${task.branchName || 'unknown'}`,
    `- Priority: ${task.priority}`,
    `- Group: ${task.group}`,
    ''
  ];
  return lines.join('\n');
};

const copyBaseContextToWorktree = async (settings: AppSettings, slotPath: string, branchName?: string): Promise<void> => {
  if (!settings.antiGravityAgentEndpoint) {
    return;
  }

  const sourcePath = settings.worktreeRoot;
  const copyEnvCommand =
    `node -e "const fs=require('fs');const path=require('path');` +
    `const src=process.argv[1];const dst=process.argv[2];` +
    `if(!fs.existsSync(src)||!fs.existsSync(dst)){process.exit(0);}` +
    `for(const name of fs.readdirSync(src)){` +
    `if(!name.startsWith('.env'))continue;` +
    `const from=path.join(src,name);` +
    `try{if(fs.statSync(from).isFile()){fs.copyFileSync(from,path.join(dst,name));}}catch{}` +
    `}" "${sourcePath}" "${slotPath}"`;

  console.log(`[GitService] Copying .env* files from ${sourcePath} to ${slotPath}`);
  await runBridgeCommand(settings, copyEnvCommand, {
    worktreePath: slotPath,
    branch: branchName
  });

  console.log('[GitService] Skipping full .opencode copy for clean worktrees');
};

const setupAgentWorkspace = async (settings: AppSettings, slotPath: string, task: TaskItem): Promise<void> => {
  if (!settings.antiGravityAgentEndpoint) {
    return;
  }

  const subdir = settings.antiGravityAgentSubdir?.trim() || DEFAULT_AGENT_SUBDIR;
  const agentWorkspace = joinPath(slotPath, subdir);
  const issueDescriptionFile = joinPath(agentWorkspace, 'issue-description.md');
  const configuredSkillFile = settings.antiGravitySkillFile?.trim() || DEFAULT_SKILL_FILE;
  const sourceSkillFile = resolvePathForWorktree(slotPath, configuredSkillFile);
  const skillFile = joinPath(agentWorkspace, 'SKILL.md');
  const issueDescriptionContent = buildIssueDescription(task);
  const issueDescriptionB64 = encodeBase64(issueDescriptionContent);
  const fallbackSkillB64 = encodeBase64([
    '# Flowize Agent Skill Fallback',
    '',
    '- Read issue-description.md and implement only requested scope.',
    '- Keep changes minimal and consistent with existing code style.',
    '- Return clear implementation output and verification notes.'
  ].join('\n'));

  const ensureWorkspaceCommand =
    `node -e "const fs=require('fs');const path=require('path');` +
    `const dir=process.argv[1];const issueFile=process.argv[2];const issueB64=process.argv[3]||'';` +
    `const srcSkill=process.argv[4]||'';const dstSkill=process.argv[5]||'';const fallbackB64=process.argv[6]||'';` +
    `const issueContent=Buffer.from(issueB64,'base64').toString('utf8');` +
    `const fallbackSkill=Buffer.from(fallbackB64,'base64').toString('utf8');` +
    `if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});` +
    `fs.writeFileSync(issueFile,issueContent,'utf8');` +
    `let skillContent='';` +
    `try{if(srcSkill&&fs.existsSync(srcSkill)&&fs.statSync(srcSkill).isFile()){skillContent=fs.readFileSync(srcSkill,'utf8');}}catch{}` +
    `if(!skillContent.trim())skillContent=fallbackSkill;` +
    `if(dstSkill){fs.writeFileSync(dstSkill,skillContent,'utf8');}` +
    `" "${agentWorkspace}" "${issueDescriptionFile}" "${issueDescriptionB64}" "${sourceSkillFile}" "${skillFile}" "${fallbackSkillB64}"`;

  console.log(`[GitService] Setting up agent workspace at ${agentWorkspace}`);
  await runBridgeCommand(settings, ensureWorkspaceCommand, {
    worktreePath: slotPath,
    branch: task.branchName,
    issueNumber: task.issueNumber,
    issueDescriptionFile
  });
  console.log(`[GitService] Agent workspace ready at ${agentWorkspace}`);
};

const getBridgeCandidates = (endpoint: string): string[] => {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  const withRun = trimmed.endsWith('/run') ? trimmed : `${trimmed}/run`;
  const withoutRun = trimmed.endsWith('/run') ? trimmed.slice(0, -4) : trimmed;
  const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';

  const alternates = [withRun, withoutRun]
    .flatMap((value) => {
      const hostAlternates = [value];
      if (value.includes('127.0.0.1')) {
        hostAlternates.push(value.replace('127.0.0.1', 'localhost'));
      }
      if (value.includes('localhost')) {
        hostAlternates.push(value.replace('localhost', '127.0.0.1'));
      }
      if (browserHost && !value.includes(browserHost)) {
        hostAlternates.push(value.replace('127.0.0.1', browserHost));
        hostAlternates.push(value.replace('localhost', browserHost));
      }
      return hostAlternates;
    })
    .filter((value) => value.length > 0);

  return Array.from(new Set(alternates));
};

const runBridgeCommand = async (settings: AppSettings, command: string, context: Record<string, unknown> = {}) => {
  const endpoint = settings.antiGravityAgentEndpoint?.trim();
  if (!endpoint) {
    return null;
  }

  const candidates = getBridgeCandidates(endpoint);
  let lastError = '';
  let hadHttpResponse = false;

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command,
          mode: 'shell',
          ...context
        })
      });

      hadHttpResponse = true;

      const raw = await response.text();
      let payload: any = null;

      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const details = payload?.error || raw || 'no response body';
        const message = `Local bridge error (${response.status}) on ${candidate}: ${details}`;
        if (response.status === 404 || response.status === 405) {
          lastError = message;
          continue;
        }
        throw new Error(message);
      }

      if (payload && typeof payload === 'object') {
        if (payload.success === false) {
          throw new Error(`Command failed on ${candidate}: ${payload.error || 'unknown bridge error'}`);
        }
        if (typeof payload.exitCode === 'number' && payload.exitCode !== 0) {
          throw new Error(`Command failed on ${candidate}: exitCode=${payload.exitCode}`);
        }
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      const normalized = lastError.toLowerCase();
      const isCommandFailure =
        normalized.includes('local bridge error (500)') ||
        normalized.includes('command failed on') ||
        normalized.includes('exitcode=');

      if (isCommandFailure) {
        throw new Error(lastError);
      }
    }
  }

  if (hadHttpResponse) {
    throw new Error(lastError || 'Bridge request failed after receiving response');
  }

  throw new Error(
    `Cannot reach local agent bridge. Tried: ${candidates.join(', ')}. Last error: ${lastError}. ` +
    `Start your local bridge and allow requests from app origin (${typeof window !== 'undefined' ? window.location.origin : 'unknown'}).`
  );
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const isDirectoryBusyError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('ebusy') ||
    normalized.includes('resource busy') ||
    normalized.includes('operation not permitted') ||
    normalized.includes('permission denied') ||
    normalized.includes('access is denied')
  );
};

const isNotWorktreeError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes('is not a working tree') || normalized.includes('not a working tree');
};

const tryRemoveDirectory = async (settings: AppSettings, targetPath: string, branchName?: string): Promise<boolean> => {
  const removeCommand = `node -e "const fs=require('fs');fs.rmSync(process.argv[1], { recursive: true, force: true });" "${targetPath}"`;
  const retryDelays = [0, 500, 1200, 2500, 5000];
  let lastErrorMessage = '';

  for (const waitMs of retryDelays) {
    if (waitMs > 0) {
      await delay(waitMs);
    }

    try {
      await runBridgeCommand(settings, removeCommand, {
        worktreePath: targetPath,
        branch: branchName
      });
      return true;
    } catch (error) {
      lastErrorMessage = getErrorMessage(error);
      if (!isDirectoryBusyError(lastErrorMessage)) {
        throw error;
      }
    }
  }

  console.warn(`[GitService] Directory still busy, skipped physical delete for ${targetPath}: ${lastErrorMessage}`);
  return false;
};

const openWorktreeCmdWindow = async (
  settings: AppSettings,
  slot: WorktreeSlot,
  branchName?: string,
  startupCommand?: string
): Promise<void> => {
  if (!settings.antiGravityAgentEndpoint) {
    return;
  }

  try {
    await runBridgeCommand(settings, 'flowize-open-windows-cmd', {
      action: 'open-windows-cmd',
      worktreePath: slot.path,
      title: `Flowize WT-${slot.id}`,
      startupCommand: startupCommand || (branchName ? 'git status && git branch --show-current' : 'git status'),
      branch: branchName
    });
  } catch (error) {
    console.warn(`[GitService] Unable to open CMD for ${slot.path}: ${getErrorMessage(error)}`);
  }
};

const buildWorktreeStartupCommand = async (
  settings: AppSettings,
  task: TaskItem,
  slot: WorktreeSlot
): Promise<string | undefined> => {
  void task;
  void slot;
  const agentName = settings.antiGravityAgentName?.trim().replace(/"/g, '');
  return agentName ? `opencode --agent "${agentName}"` : 'opencode';
};

export const createWorktree = async (settings: AppSettings, task: TaskItem, slot: WorktreeSlot): Promise<void> => {
  console.log(`[GitService] Initializing worktree for ${task.branchName}`);

  // 1. Fetch latest refs
  console.log(`> git fetch origin`);
  if (settings.antiGravityAgentEndpoint) {
    await runBridgeCommand(settings, 'git fetch origin', {
      worktreePath: slot.path,
      branch: task.branchName
    });

    await runBridgeCommand(settings, 'git worktree prune', {
      worktreePath: slot.path,
      branch: task.branchName
    });

    const listPayload = await runBridgeCommand(settings, 'git worktree list --porcelain', {
      worktreePath: slot.path,
      branch: task.branchName
    }) as { stdout?: string } | null;

    const worktrees = parseWorktreeList(String(listPayload?.stdout ?? ''));
    const targetPath = normalizeWorktreePath(slot.path);
    const existingAtPath = worktrees.find((item) => normalizeWorktreePath(item.path) === targetPath);

    if (existingAtPath) {
      if (existingAtPath.branch === task.branchName) {
        console.log(`[GitService] Reusing existing worktree ${slot.path} on ${task.branchName}`);
        await copyBaseContextToWorktree(settings, slot.path, task.branchName);
        await setupAgentWorkspace(settings, slot.path, task);
        const startupCommand = await buildWorktreeStartupCommand(settings, task, slot);
        await openWorktreeCmdWindow(settings, slot, task.branchName, startupCommand);
        return;
      }
      throw new Error(
        `Target path already mapped to branch '${existingAtPath.branch ?? 'unknown'}'. ` +
        `Cleanup slot path '${slot.path}' before reassigning.`
      );
    }

    const branchInUse = worktrees.find((item) => item.branch === task.branchName);
    if (branchInUse) {
      throw new Error(
        `Branch '${task.branchName}' is already checked out at '${branchInUse.path}'. ` +
        'Use that worktree, or cleanup it before reassigning.'
      );
    }

    const pathExistsPayload = await runBridgeCommand(
      settings,
      `node -e "const fs=require('fs');process.stdout.write(fs.existsSync(process.argv[1])?'yes':'no')" "${slot.path}"`,
      { worktreePath: slot.path, branch: task.branchName }
    ) as { stdout?: string } | null;

    const pathExists = String(pathExistsPayload?.stdout ?? '').trim().toLowerCase() === 'yes';
    if (pathExists) {
      throw new Error(
        `Target directory '${slot.path}' already exists but is not a managed git worktree. ` +
        'Remove or rename it, then retry.'
      );
    }

    const branchExistsPayload = await runBridgeCommand(
      settings,
      `git show-ref --verify --quiet "refs/heads/${task.branchName}" && echo yes || echo no`,
      { worktreePath: slot.path, branch: task.branchName }
    ) as { stdout?: string } | null;

    const branchExists = String(branchExistsPayload?.stdout ?? '').trim().toLowerCase() === 'yes';

    const cmd = branchExists
      ? `git worktree add "${slot.path}" "${task.branchName}"`
      : `git worktree add -b "${task.branchName}" "${slot.path}" "origin/${settings.defaultBranch}"`;
    console.log(`> ${cmd}`);
    await runBridgeCommand(settings, cmd, {
      worktreePath: slot.path,
      branch: task.branchName
    });

    await copyBaseContextToWorktree(settings, slot.path, task.branchName);
    await setupAgentWorkspace(settings, slot.path, task);
    const startupCommand = await buildWorktreeStartupCommand(settings, task, slot);
    await openWorktreeCmdWindow(settings, slot, task.branchName, startupCommand);
  } else {
    throw new Error('No local bridge endpoint configured. Real git worktree operations require Agent Bridge Endpoint.');
  }

  console.log(`[GitService] Worktree ready at ${slot.path}`);
};

export const pruneWorktree = async (slot: WorktreeSlot, branchName?: string, settings?: AppSettings): Promise<void> => {
  console.log(`[GitService] Cleaning up worktree at ${slot.path}`);

  if (branchName) {
      console.log(`> git push origin ${branchName}`);
      if (settings?.antiGravityAgentEndpoint) {
        try {
          await runBridgeCommand(settings, `git push origin "${branchName}"`, {
            worktreePath: slot.path,
            branch: branchName
          });
        } catch (error) {
          console.warn(`[GitService] push skipped during cleanup: ${getErrorMessage(error)}`);
        }
      } else {
        throw new Error('No local bridge endpoint configured. Real git push during cleanup requires Agent Bridge Endpoint.');
      }
  }

  console.log(`> git worktree remove --force ${slot.path}`);
  if (settings?.antiGravityAgentEndpoint) {
    const removeCommand = `git worktree remove --force "${slot.path}"`;
    const retryDelays = [0, 800, 1800, 3500];
    let removed = false;

    for (const waitMs of retryDelays) {
      if (waitMs > 0) {
        await delay(waitMs);
      }

      try {
        await runBridgeCommand(settings, removeCommand, {
          worktreePath: slot.path,
          branch: branchName
        });
        removed = true;
        break;
      } catch (error) {
        const message = getErrorMessage(error);
        if (isNotWorktreeError(message)) {
          console.warn(`[GitService] path not a git worktree, removing directory: ${slot.path}`);
          await tryRemoveDirectory(settings, slot.path, branchName);
          removed = true;
          break;
        }

        if (isDirectoryBusyError(message)) {
          console.warn(`[GitService] Worktree still busy, retrying remove for ${slot.path}: ${message}`);
          continue;
        }

        throw error;
      }
    }

    if (!removed) {
      await tryRemoveDirectory(settings, slot.path, branchName);
    }
  } else {
    throw new Error('No local bridge endpoint configured. Real worktree cleanup requires Agent Bridge Endpoint.');
  }

  console.log(`> git worktree prune`);
  if (settings?.antiGravityAgentEndpoint) {
    try {
      await runBridgeCommand(settings, 'git worktree prune', {
        worktreePath: slot.path,
        branch: branchName
      });
    } catch (error) {
      const message = getErrorMessage(error);
      if (isDirectoryBusyError(message)) {
        console.warn(`[GitService] git worktree prune skipped while path is busy: ${message}`);
      } else {
        throw error;
      }
    }
  } else {
    throw new Error('No local bridge endpoint configured. Real worktree prune requires Agent Bridge Endpoint.');
  }
};

export const pushWorktreeBranch = async (slot: WorktreeSlot, branchName: string, settings?: AppSettings): Promise<void> => {
  if (!branchName) {
    throw new Error('Branch name is required to push worktree changes.');
  }

  if (!settings?.antiGravityAgentEndpoint) {
    throw new Error('No local bridge endpoint configured. Worktree branch push requires Agent Bridge Endpoint.');
  }

  const commitMessage = `chore: sync worktree updates for ${branchName}`;
  const commitCommand = `git add -A && git diff --cached --quiet || git commit -m "${commitMessage.replace(/"/g, '')}"`;

  await runBridgeCommand(settings, commitCommand, {
    worktreePath: slot.path,
    branch: branchName
  });

  const syncWithRemoteBranch = async (): Promise<void> => {
    await runBridgeCommand(settings, `git fetch origin "${branchName}"`, {
      worktreePath: slot.path,
      branch: branchName
    });

    const remoteExistsPayload = await runBridgeCommand(
      settings,
      `git show-ref --verify --quiet "refs/remotes/origin/${branchName}" && echo yes || echo no`,
      {
        worktreePath: slot.path,
        branch: branchName
      }
    ) as { stdout?: string } | null;

    const remoteExists = String(remoteExistsPayload?.stdout ?? '').trim().toLowerCase() === 'yes';
    if (!remoteExists) {
      return;
    }

    try {
      await runBridgeCommand(settings, `git rebase "origin/${branchName}"`, {
        worktreePath: slot.path,
        branch: branchName
      });
    } catch (error) {
      try {
        await runBridgeCommand(settings, 'git rebase --abort', {
          worktreePath: slot.path,
          branch: branchName
        });
      } catch {
        // Ignore abort failure; keep original rebase error context.
      }

      const message = getErrorMessage(error);
      throw new Error(
        `Remote branch '${branchName}' has newer commits and auto-rebase failed. ` +
        `Resolve conflicts in the worktree and retry push. Details: ${message}`
      );
    }
  };

  await syncWithRemoteBranch();

  try {
    await runBridgeCommand(settings, `git push -u origin "${branchName}"`, {
      worktreePath: slot.path,
      branch: branchName
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const needsSyncRetry = /fetch first|non-fast-forward|failed to push some refs/i.test(message);
    if (!needsSyncRetry) {
      throw error;
    }

    await syncWithRemoteBranch();
    await runBridgeCommand(settings, `git push -u origin "${branchName}"`, {
      worktreePath: slot.path,
      branch: branchName
    });
  }
};

export const forcePushWorktreeBranchWithLease = async (slot: WorktreeSlot, branchName: string, settings?: AppSettings): Promise<void> => {
  if (!branchName) {
    throw new Error('Branch name is required to push worktree changes.');
  }

  if (!settings?.antiGravityAgentEndpoint) {
    throw new Error('No local bridge endpoint configured. Worktree branch push requires Agent Bridge Endpoint.');
  }

  await runBridgeCommand(settings, `git push --force-with-lease -u origin "${branchName}"`, {
    worktreePath: slot.path,
    branch: branchName
  });
};
