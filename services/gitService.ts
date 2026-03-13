import { AppSettings, TaskItem, WorktreeSlot } from '../types';
import { getProcessesUsingPath, formatProcessList } from './processDetection';
import { openWorktreeCmdWindow } from './agentService';
import { getBridgeAuthToken, getBridgeCandidates, getBridgeRequestHeaders } from './bridgeClient';

/**
 * Executes git operations through the configured local bridge endpoint.
 */

const DEFAULT_AGENT_SUBDIR = '.agent-workspace';
const DEFAULT_SKILL_FILE = '.opencode/skills/specflow-worktree-automation/SKILL.md';

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

const postBridgeAction = async <T>(settings: AppSettings, action: string, payload: Record<string, unknown>): Promise<T> => {
  const endpoint = settings.agentEndpoint?.trim();
  if (!endpoint) {
    throw new Error('Agent Bridge Endpoint is not configured.');
  }

  const candidates = getBridgeCandidates(endpoint);
  const headers = getBridgeRequestHeaders(getBridgeAuthToken(settings), {
    'Content-Type': 'application/json'
  });
  let lastError = '';

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, ...payload })
      });

      const raw = await response.text();
      const data = raw ? JSON.parse(raw) as T & { success?: boolean; error?: string } : {} as T & { success?: boolean; error?: string };

      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || `Bridge returned ${response.status} for ${action}`);
      }

      return data as T;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError || `Unable to execute bridge action ${action}`);
};

const copyBaseContextToWorktree = async (settings: AppSettings, slotPath: string, branchName?: string): Promise<void> => {
  if (!settings.agentEndpoint) {
    return;
  }

  const sourcePath = settings.worktreeRoot;
  console.log(`[GitService] Copying .env* files from ${sourcePath} to ${slotPath}`);
  await postBridgeAction(settings, 'flowize-copy-worktree-context', {
    sourcePath,
    targetPath: slotPath,
    branchName
  });

  console.log('[GitService] Skipping full .opencode copy for clean worktrees');
};

const setupAgentWorkspace = async (settings: AppSettings, slotPath: string, task: TaskItem): Promise<void> => {
  if (!settings.agentEndpoint) {
    return;
  }

  const subdir = settings.agentSubdir?.trim() || DEFAULT_AGENT_SUBDIR;
  const agentWorkspace = joinPath(slotPath, subdir);
  const issueDescriptionFile = joinPath(agentWorkspace, 'issue-description.md');
  const configuredSkillFile = settings.agentSkillFile?.trim() || DEFAULT_SKILL_FILE;
  const sourceSkillFile = resolvePathForWorktree(slotPath, configuredSkillFile);
  const skillFile = joinPath(agentWorkspace, 'SKILL.md');
  const issueDescriptionContent = buildIssueDescription(task);
  const fallbackSkillContent = [
    '# Flowize Agent Workflow',
    '',
    '## 1. Start — load the prompt-contracts skill',
    'Read and follow ./skills/prompt-contracts.md before doing anything else.',
    '',
    '## 2. Plan — for non-trivial tasks, load pro-workflow-core and subagent-verification-loops',
    'Read ./skills/pro-workflow-core.md',
    'Read ./skills/subagent-verification-loops.md',
    '',
    '## 3. Implement',
    '- Read issue-description.md and implement only the requested scope.',
    '- Keep changes minimal and consistent with the existing code style.',
    '',
    '## 4. Finish — load the smart-commit skill, then push',
    'Read and follow ./skills/smart-commit.md when implementation is complete.',
    'After the commit is done, run `git push` to push the branch to the remote.',
    '',
    '## 5. Close — close this terminal when the work is finished',
    'Once the commit is done and the task is complete, close this terminal window.'
  ].join('\n');
  const gitignorePath = joinPath(slotPath, '.gitignore');
  const gitignoreEntry = `${subdir}/`;

  console.log(`[GitService] Setting up agent workspace at ${agentWorkspace}`);
  await postBridgeAction(settings, 'flowize-ensure-agent-workspace', {
    agentWorkspace,
    issueDescriptionFile,
    issueDescriptionContent,
    sourceSkillFile,
    skillFile,
    fallbackSkillContent,
    gitignorePath,
    gitignoreEntry
  });

  console.log(`[GitService] Agent workspace ready at ${agentWorkspace}`);
};

export const runBridgeCommand = async (settings: AppSettings, command: string, context: Record<string, unknown> = {}) => {
  const endpoint = settings.agentEndpoint?.trim();
  if (!endpoint) {
    return null;
  }

  const candidates = getBridgeCandidates(endpoint);
  const headers = getBridgeRequestHeaders(getBridgeAuthToken(settings), {
    'Content-Type': 'application/json'
  });
  let lastError = '';
  let hadHttpResponse = false;
  console.log(`[bridge:git] command="${command.slice(0, 120)}${command.length > 120 ? '…' : ''}" candidates=[${candidates.join(', ')}]`);

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          command,
          mode: 'shell',
          ...context
        })
      });

      hadHttpResponse = true;
      console.log(`[bridge:git] response status=${response.status} from ${candidate}`);

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
          console.warn(`[bridge:git] ${response.status} on ${candidate} - skipping to next candidate`);
          lastError = message;
          continue;
        }
        console.error(`[bridge:git] error on ${candidate}: ${message}`);
        throw new Error(message);
      }

      if (payload && typeof payload === 'object') {
        if (payload.success === false) {
          const err = `Command failed on ${candidate}: ${payload.error || 'unknown bridge error'}`;
          console.error(`[bridge:git] ${err}`);
          throw new Error(err);
        }
        if (typeof payload.exitCode === 'number' && payload.exitCode !== 0) {
          const err = `Command failed on ${candidate}: exitCode=${payload.exitCode}`;
          console.error(`[bridge:git] ${err}`);
          throw new Error(err);
        }
      }

      console.log(`[bridge:git] success on ${candidate}`);
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
      console.warn(`[bridge:git] candidate=${candidate} failed: ${lastError}`);
    }
  }

  if (hadHttpResponse) {
    console.error(`[bridge:git] all candidates failed after receiving HTTP responses. lastError: ${lastError}`);
    throw new Error(lastError || 'Bridge request failed after receiving response');
  }

  console.error(`[bridge:git] cannot reach bridge. Tried: ${candidates.join(', ')}. lastError: ${lastError}`);
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



export const createWorktree = async (settings: AppSettings, task: TaskItem, slot: WorktreeSlot): Promise<void> => {
  console.log(`[GitService] Initializing worktree for ${task.branchName}`);

  // 1. Fetch latest refs
  // Note: Use worktreeRoot (main repo) as working directory since slot.path doesn't exist yet
  console.log(`> git fetch origin`);
  if (settings.agentEndpoint) {
    const result = await postBridgeAction<{ reused?: boolean; worktreePath?: string; branchName?: string }>(
      settings,
      'flowize-create-worktree',
      {
        repoPath: settings.worktreeRoot,
        targetPath: slot.path,
        branchName: task.branchName,
        defaultBranch: settings.defaultBranch
      }
    );

    if (result.reused) {
      console.log(`[GitService] Reusing existing worktree ${slot.path} on ${task.branchName}`);
    }

    await copyBaseContextToWorktree(settings, slot.path, task.branchName);
    await setupAgentWorkspace(settings, slot.path, task);
    await openWorktreeCmdWindow(settings, slot, {
      subdir: settings.agentSubdir?.trim() || DEFAULT_AGENT_SUBDIR,
      title: `Flowize AG-${slot.id}`,
      task,
      ensureDirectory: true
    });
  } else {
    throw new Error('No local bridge endpoint configured. Real git worktree operations require Agent Bridge Endpoint.');
  }

  console.log(`[GitService] Worktree ready at ${slot.path}`);
};

export const pruneWorktree = async (slot: WorktreeSlot, branchName?: string, settings?: AppSettings): Promise<void> => {
  console.log(`[GitService] Cleaning up worktree at ${slot.path}`);

  if (branchName) {
    console.log(`> git push origin ${branchName}`);
    if (settings?.agentEndpoint) {
      try {
        await postBridgeAction(settings, 'flowize-push-worktree-branch', {
          worktreePath: slot.path,
          branchName,
          forceWithLease: false
        });
      } catch (error) {
        console.warn(`[GitService] push skipped during cleanup: ${getErrorMessage(error)}`);
      }
    } else {
      throw new Error('No local bridge endpoint configured. Real git push during cleanup requires Agent Bridge Endpoint.');
    }
  }

  console.log(`> git worktree remove --force ${slot.path}`);
  if (settings?.agentEndpoint) {
    try {
      await postBridgeAction(settings, 'flowize-cleanup-worktree', {
        repoPath: settings.worktreeRoot,
        targetPath: slot.path
      });
    } catch (error) {
      const message = getErrorMessage(error);
      if (isDirectoryBusyError(message)) {
        const processes = await getProcessesUsingPath(slot.path, settings);
        const processInfo = formatProcessList(processes);
        console.warn(`[GitService] Worktree still busy during typed cleanup for ${slot.path}: ${message}${processInfo}`);
        throw error;
      }
      throw error;
    }
  } else {
    throw new Error('No local bridge endpoint configured. Real worktree cleanup requires Agent Bridge Endpoint.');
  }
};

export const pushWorktreeBranch = async (slot: WorktreeSlot, branchName: string, settings?: AppSettings): Promise<void> => {
  if (!branchName) {
    throw new Error('Branch name is required to push worktree changes.');
  }

  if (!settings?.agentEndpoint) {
    throw new Error('No local bridge endpoint configured. Worktree branch push requires Agent Bridge Endpoint.');
  }

  await postBridgeAction(settings, 'flowize-push-worktree-branch', {
    worktreePath: slot.path,
    branchName,
    forceWithLease: false
  });
};

export const forcePushWorktreeBranchWithLease = async (slot: WorktreeSlot, branchName: string, settings?: AppSettings): Promise<void> => {
  if (!branchName) {
    throw new Error('Branch name is required to push worktree changes.');
  }

  if (!settings?.agentEndpoint) {
    throw new Error('No local bridge endpoint configured. Worktree branch push requires Agent Bridge Endpoint.');
  }

  await postBridgeAction(settings, 'flowize-push-worktree-branch', {
    worktreePath: slot.path,
    branchName,
    forceWithLease: true
  });
};
