import { AppSettings, TaskItem, WorktreeSlot } from '../types';

interface AgentRunResponse {
  implementation?: string;
  success?: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  done?: boolean;
  jobId?: string;
  pid?: number | null;
  startedAt?: number;
  updatedAt?: number;
}

export interface AgentImplementationResult {
  success: boolean;
  implementation: string;
  logs: string;
  command: string;
}

interface AgentProgress {
  logs: string;
  done: boolean;
  success: boolean;
  jobId?: string;
}

export interface OpenWorktreeCmdOptions {
  subdir?: string;
  title?: string;
  startupCommand?: string;
  ensureDirectory?: boolean;
  task?: TaskItem;
  copyTemplatedCommandToClipboard?: boolean;
  closeAfterStartup?: boolean;
  launchAntigravity?: boolean;
}

const DEFAULT_AGENT_SUBDIR = '.antigravity';
const DEFAULT_SKILL_FILE = '.opencode/skills/specflow-worktree-automation/SKILL.md';
const AGENT_POLL_INTERVAL_MS = 800;
const AGENT_POLL_MAX_ATTEMPTS = 900;
const AGENT_STALE_OUTPUT_TIMEOUT_MS = 5 * 60 * 1000;

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

const ensurePrintLogsFlag = (command: string): string => {
  const hasOpenCodeRun = /\bopencode\s+run\b/i.test(command);
  const hasPrintLogs = /\s--print-logs\b/i.test(command);
  if (!hasOpenCodeRun || hasPrintLogs) {
    return command;
  }
  return `${command} --print-logs`;
};

const stripPrintLogsFlag = (command: string): string => {
  return command.replace(/\s--print-logs\b/ig, '');
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  throw new Error('Unable to encode issue description to base64 in this runtime.');
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

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
};

const runBridgeSyncCommand = async (
  endpoint: string,
  command: string,
  context: Record<string, unknown> = {}
): Promise<AgentRunResponse> => {
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      command,
      mode: 'shell',
      ...context
    })
  }, 20000);

  const rawText = await response.text();
  let data: AgentRunResponse = {};

  try {
    data = rawText ? JSON.parse(rawText) as AgentRunResponse : {};
  } catch {
    data = { stdout: rawText };
  }

  if (!response.ok) {
    throw new Error(data.error || `Agent bridge returned ${response.status} on ${endpoint}`);
  }

  if (data.success === false || (typeof data.exitCode === 'number' && data.exitCode !== 0)) {
    throw new Error(data.error || `Command failed on ${endpoint}`);
  }

  return data;
};

const formatDuration = (valueMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatLogs = (endpoint: string, command: string, data: AgentRunResponse): string => {
  const now = Date.now();
  const elapsed = typeof data.startedAt === 'number' ? formatDuration(now - data.startedAt) : 'unknown';
  const idle = typeof data.updatedAt === 'number' ? formatDuration(now - data.updatedAt) : 'unknown';
  const runState = data.done === true
    ? (data.success === true ? 'completed' : 'failed')
    : 'running';

  return [
    `Endpoint: ${endpoint}`,
    `Command: ${command}`,
    `State: ${runState}${typeof data.pid === 'number' ? ` | PID ${data.pid}` : ''} | Elapsed: ${elapsed}${data.done === true ? '' : ` | Last output: ${idle} ago`}`,
    '',
    data.stdout ? `STDOUT:\n${data.stdout}` : 'STDOUT: <empty>',
    '',
    data.stderr ? `STDERR:\n${data.stderr}` : 'STDERR: <empty>',
    '',
    `Exit Code: ${typeof data.exitCode === 'number' ? data.exitCode : 'running'}`
  ].join('\n');
};

const pollAsyncJob = async (
  endpoint: string,
  command: string,
  jobId: string,
  settings?: AppSettings,
  onProgress?: (progress: AgentProgress) => void
): Promise<AgentRunResponse> => {
  const base = endpoint.endsWith('/run') ? endpoint.slice(0, -4) : endpoint;
  const logsUrl = `${base}/logs?jobId=${encodeURIComponent(jobId)}`;

  for (let i = 0; i < AGENT_POLL_MAX_ATTEMPTS; i += 1) {
    const response = await fetchWithTimeout(logsUrl, { method: 'GET' }, 10000);
    if (!response.ok) {
      throw new Error(`Unable to poll agent logs (${response.status}) from ${logsUrl}`);
    }

    const data = await response.json() as AgentRunResponse;
    const stdoutLength = data.stdout?.trim().length ?? 0;
    const stderrLength = data.stderr?.trim().length ?? 0;
    const hasSeenOutput = stdoutLength > 0 || stderrLength > 0;
    const idleSinceMs = typeof data.updatedAt === 'number'
      ? (Date.now() - data.updatedAt)
      : (typeof data.startedAt === 'number' ? Date.now() - data.startedAt : 0);

    const logs = formatLogs(endpoint, command, data);
    onProgress?.({
      logs,
      done: data.done === true,
      success: data.done === true ? (data.success === true && (data.exitCode ?? 0) === 0) : false,
      jobId
    });

    if (data.done === true) {
      return data;
    }

    if (idleSinceMs >= AGENT_STALE_OUTPUT_TIMEOUT_MS) {
      let cancelNote = '';
      if (settings?.antiGravityAgentEndpoint) {
        try {
          await cancelAgentJob(settings, jobId);
          cancelNote = ' Cancellation requested automatically.';
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          cancelNote = ` Automatic cancellation failed: ${message}`;
        }
      }

      throw new Error(
        `${hasSeenOutput ? 'No new output' : 'No stdout/stderr received'} for ${formatDuration(idleSinceMs)}. ` +
        `The command appears non-streaming or waiting for interactive input.${cancelNote}`
      );
    }

    await sleep(AGENT_POLL_INTERVAL_MS);
  }

  let cancelNote = '';
  if (settings?.antiGravityAgentEndpoint) {
    try {
      await cancelAgentJob(settings, jobId);
      cancelNote = ' Cancellation requested automatically.';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      cancelNote = ` Automatic cancellation failed: ${message}`;
    }
  }

  throw new Error(`Timed out waiting for sub-agent job completion.${cancelNote}`.trim());
};

export const generateImplementationFromAgent = async (
  task: TaskItem,
  slot: WorktreeSlot,
  settings?: AppSettings,
  onProgress?: (progress: AgentProgress) => void
): Promise<AgentImplementationResult> => {
  const commandTemplate = settings?.antiGravityAgentCommand?.trim();
  if (!task.issueNumber || !task.branchName) {
    return {
      success: false,
      command: '',
      logs: 'Missing issue number or branch name for sub-agent execution.',
      implementation: 'Sub-agent could not start because issue or branch is missing.'
    };
  }

  const subdir = settings?.antiGravityAgentSubdir?.trim() || DEFAULT_AGENT_SUBDIR;
  const agentWorkspace = joinPath(slot.path, subdir);
  const issueDescriptionFile = joinPath(joinPath(slot.path, subdir), 'issue-description.md');
  const configuredSkillFile = settings?.antiGravitySkillFile?.trim() || DEFAULT_SKILL_FILE;
  const sourceSkillFile = resolvePathForWorktree(slot.path, configuredSkillFile);
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

  const shellWorktreePath = toShellPath(slot.path);
  const shellAgentWorkspace = toShellPath(agentWorkspace);
  const shellIssueDescriptionFile = toShellPath(issueDescriptionFile);
  const shellSkillFile = toShellPath(skillFile);

  const command = ensureWindowsDriveSwitch(ensurePrintLogsFlag(fillTemplate(commandTemplate || '', {
    issueNumber: String(task.issueNumber),
    branch: task.branchName,
    title: task.title,
    worktreePath: shellWorktreePath,
    agentWorkspace: shellAgentWorkspace,
    agentName: settings?.antiGravityAgentName?.trim() || '',
    agentFlag: settings?.antiGravityAgentName?.trim() ? `--agent "${settings?.antiGravityAgentName?.trim()}"` : '',
    issueDescriptionFile: shellIssueDescriptionFile,
    briefFile: shellIssueDescriptionFile,
    skillFile: shellSkillFile
  })), shellWorktreePath);

  if (!commandTemplate) {
    return {
      success: false,
      command,
      logs: 'Anti-Gravity agent command is not configured in settings.',
      implementation: 'Configure `Anti-Gravity Agent Command` to run the sub-agent for this issue.'
    };
  }

  const endpoint = settings?.antiGravityAgentEndpoint?.trim();
  if (!endpoint) {
    return {
      success: false,
      command,
      logs: 'No local bridge endpoint configured.',
      implementation: 'Set `Agent Bridge Endpoint` in settings so the UI can run the local sub-agent command.'
    };
  }

  const candidates = getBridgeCandidates(endpoint);
  let lastError = '';
  let lastLogs = '';

  for (const candidate of candidates) {
    try {
      await runBridgeSyncCommand(candidate, ensureWorkspaceCommand, {
        worktreePath: slot.path,
        branch: task.branchName,
        issueNumber: task.issueNumber,
        issueDescriptionFile
      });

      const response = await fetchWithTimeout(candidate, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command,
          mode: 'shell',
          async: true,
          issueNumber: task.issueNumber,
          branch: task.branchName,
          worktreePath: slot.path,
          issueDescriptionFile,
          skillFile,
          title: task.title
        })
      }, 20000);

      const rawText = await response.text();
      let data: AgentRunResponse = {};

      try {
        data = rawText ? JSON.parse(rawText) as AgentRunResponse : {};
      } catch {
        data = { stdout: rawText };
      }

      if (!response.ok) {
        const maybeError = data.error || `Agent bridge returned ${response.status} on ${candidate}`;
        throw new Error(maybeError);
      }

      if (data.jobId) {
        onProgress?.({
          logs: `Agent job started. jobId=${data.jobId}`,
          done: false,
          success: false,
          jobId: data.jobId
        });
        data = await pollAsyncJob(candidate, command, data.jobId, settings, onProgress);
      }

      const logs = formatLogs(candidate, command, data);
      lastLogs = logs;
      onProgress?.({ logs, done: true, success: data.success === true && (data.exitCode ?? 0) === 0 });

      if (data.success === false || (typeof data.exitCode === 'number' && data.exitCode !== 0)) {
        const errorMessage = data.error || `Agent bridge returned ${response.status} on ${candidate}`;
        throw new Error(errorMessage);
      }

      if ((typeof data.implementation !== 'string' || data.implementation.trim().length === 0)
        && (!data.stdout || data.stdout.trim().length === 0)) {
        throw new Error('Sub-agent completed with no output. Verify command syntax for your Anti-Gravity CLI.');
      }

      const implementation =
        (typeof data.implementation === 'string' && data.implementation.trim().length > 0)
          ? data.implementation
          : (data.stdout?.trim().length ? data.stdout : 'Sub-agent completed successfully with no implementation output.');

      return {
        success: true,
        implementation,
        logs,
        command
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  const failureLogs = lastLogs || [
    `Command: ${command}`,
    `Issue: #${task.issueNumber}`,
    `Worktree: ${slot.path}`,
    '',
    `Error: ${lastError || 'Unable to reach local agent bridge'}`
  ].join('\n');

  return {
    success: false,
    command,
    logs: failureLogs,
    implementation: `Sub-agent failed for issue #${task.issueNumber}: ${lastError || 'Unknown error'}`
  };
};

export const openWorktreeCmdWindow = async (
  settings: AppSettings | undefined,
  slot: WorktreeSlot,
  options?: OpenWorktreeCmdOptions
): Promise<void> => {
  const endpoint = settings?.antiGravityAgentEndpoint?.trim();
  if (!endpoint) {
    throw new Error('No local bridge endpoint configured.');
  }

  const subdir = options?.subdir?.trim();
  const targetPath = subdir
    ? joinPath(slot.path, subdir.replace(/^[\\/]+/, ''))
    : slot.path;
  const title = options?.title || `Flowize WT-${slot.id}`;
  const task = options?.task;
  const commandTemplate = settings?.antiGravityAgentCommand?.trim();
  const canBuildTemplatedAgentCommand =
    !!task &&
    !!commandTemplate &&
    !!task.issueNumber &&
    !!task.branchName;

  const worktreeForCommand = toShellPath(slot.path);
  const agentSubdir = settings?.antiGravityAgentSubdir?.trim() || DEFAULT_AGENT_SUBDIR;
  const agentWorkspace = joinPath(slot.path, agentSubdir);
  const issueDescriptionFile = joinPath(agentWorkspace, 'issue-description.md');
  const configuredSkillFile = settings?.antiGravitySkillFile?.trim() || DEFAULT_SKILL_FILE;
  const sourceSkillFile = resolvePathForWorktree(slot.path, configuredSkillFile);
  const skillFile = joinPath(agentWorkspace, 'SKILL.md');
  const issueDescriptionContent = task ? buildIssueDescription(task) : '';
  const issueDescriptionB64 = issueDescriptionContent ? encodeBase64(issueDescriptionContent) : '';
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
    `if(issueFile)fs.writeFileSync(issueFile,issueContent,'utf8');` +
    `let skillContent='';` +
    `try{if(srcSkill&&fs.existsSync(srcSkill)&&fs.statSync(srcSkill).isFile()){skillContent=fs.readFileSync(srcSkill,'utf8');}}catch{}` +
    `if(!skillContent.trim())skillContent=fallbackSkill;` +
    `if(dstSkill){fs.writeFileSync(dstSkill,skillContent,'utf8');}` +
    `" "${agentWorkspace}" "${issueDescriptionFile}" "${issueDescriptionB64}" "${sourceSkillFile}" "${skillFile}" "${fallbackSkillB64}"`;

  const templatedAgentCommand = canBuildTemplatedAgentCommand
    ? stripPrintLogsFlag(ensureWindowsDriveSwitch(fillTemplate(commandTemplate || '', {
      issueNumber: String(task?.issueNumber),
      branch: task?.branchName || '',
      title: task?.title || '',
      worktreePath: worktreeForCommand,
      agentWorkspace: toShellPath(agentWorkspace),
      agentName: settings?.antiGravityAgentName?.trim() || '',
      agentFlag: settings?.antiGravityAgentName?.trim() ? `--agent "${settings?.antiGravityAgentName?.trim()}"` : '',
      issueDescriptionFile: toShellPath(issueDescriptionFile),
      briefFile: toShellPath(issueDescriptionFile),
      skillFile: toShellPath(skillFile)
    }), worktreeForCommand))
    : '';

  const startHereContent = templatedAgentCommand
    ? [
      '# Flowize Start Here',
      '',
      'Paste and run this command in the OpenCode prompt:',
      '',
      templatedAgentCommand,
      ''
    ].join('\n')
    : '';
  const startHereContentB64 = startHereContent ? encodeBase64(startHereContent) : '';
  const writeStartHereCommand = startHereContent
    ? `node -e "const fs=require('fs');const path=require('path');const dir=process.argv[1];const body=Buffer.from(process.argv[2],'base64').toString('utf8');fs.writeFileSync(path.join(dir,'START-HERE.md'),body,'utf8');" "${targetPath}" "${startHereContentB64}"`
    : '';

  let startupCommand = options?.startupCommand || templatedAgentCommand || 'git status';

  if (options?.copyTemplatedCommandToClipboard === true && templatedAgentCommand) {
    const templateCommandB64 = encodeBase64(templatedAgentCommand);
    const clipboardCommand =
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "$text=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${templateCommandB64}')); Set-Clipboard -Value $text"`;
    startupCommand = [
      clipboardCommand,
      'echo [Flowize] Suggested issue command copied to clipboard.',
      'echo [Flowize] Paste into OpenCode prompt with Ctrl+V.',
      startupCommand
    ].join(' && ');
  }

  const candidates = getBridgeCandidates(endpoint);
  let lastError = '';

  for (const candidate of candidates) {
    try {
      if (options?.ensureDirectory === true && targetPath !== slot.path) {
        const escapedTarget = targetPath.replace(/"/g, '');
        await runBridgeSyncCommand(candidate, `node -e "const fs=require('fs');fs.mkdirSync(process.argv[1],{recursive:true})" "${escapedTarget}"`, {
          worktreePath: slot.path
        });
      }

      if (canBuildTemplatedAgentCommand) {
        await runBridgeSyncCommand(candidate, ensureWorkspaceCommand, {
          worktreePath: slot.path,
          branch: task?.branchName,
          issueNumber: task?.issueNumber,
          issueDescriptionFile
        });
      }

      if (writeStartHereCommand) {
        await runBridgeSyncCommand(candidate, writeStartHereCommand, {
          worktreePath: slot.path,
          branch: task?.branchName,
          issueNumber: task?.issueNumber
        });
      }

      const response = await fetchWithTimeout(candidate, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'open-windows-cmd',
          worktreePath: targetPath,
          title,
          startupCommand,
          closeAfterStartup: options?.closeAfterStartup === true,
          launchAntigravity: options?.launchAntigravity === true
        })
      }, 10000);

      const rawText = await response.text();
      let data: AgentRunResponse = {};

      try {
        data = rawText ? JSON.parse(rawText) as AgentRunResponse : {};
      } catch {
        data = { stdout: rawText };
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || `Bridge returned ${response.status} on ${candidate}`);
      }

      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError || 'Unable to open Windows CMD window from local bridge.');
};

export const cancelAgentJob = async (settings: AppSettings | undefined, jobId: string): Promise<void> => {
  const endpoint = settings?.antiGravityAgentEndpoint?.trim();
  if (!endpoint || !jobId) {
    return;
  }

  const candidates = getBridgeCandidates(endpoint);
  let lastError = '';

  for (const candidate of candidates) {
    const base = candidate.endsWith('/run') ? candidate.slice(0, -4) : candidate;
    const cancelUrl = `${base}/cancel`;
    try {
      const response = await fetchWithTimeout(cancelUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jobId })
      }, 10000);

      if (!response.ok) {
        throw new Error(`cancel failed with status ${response.status}`);
      }
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Unable to cancel agent job ${jobId}. ${lastError}`);
};
