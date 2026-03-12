import { AppSettings, TaskItem, WorktreeSlot } from '../types';
import { getBridgeAuthToken, getBridgeBaseUrl, getBridgeCandidates, getBridgeRequestHeaders } from './bridgeClient';

/** Thrown when a job is explicitly cancelled so callers can distinguish it from real failures. */
class CancelledError extends Error {
  constructor(msg = 'Job cancelled') {
    super(msg);
    this.name = 'CancelledError';
  }
}

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
  sessionId?: string;
}

export interface AgentImplementationResult {
  success: boolean;
  cancelled?: boolean;
  implementation: string;
  logs: string;
  command: string;
  jobId?: string;
  sessionId?: string;
}

export interface AgentSessionState {
  success?: boolean;
  done?: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  pid?: number | null;
  startedAt?: number;
  updatedAt?: number;
  jobId?: string;
  sessionId?: string;
  command?: string;
  status?: string;
  branch?: string;
  worktreePath?: string;
  title?: string;
}

interface AgentProgress {
  logs: string;
  done: boolean;
  success: boolean;
  jobId?: string;
  sessionId?: string;
}

interface PreparedAgentRunPayload {
  command: string;
  agentWorkspace: string;
  issueDescriptionFile: string;
  skillFile: string;
  issueDescriptionContent: string;
  fallbackSkillContent: string;
  sourceSkillFile: string;
}

interface AgentWorkspaceSetupPayload {
  agentWorkspace: string;
  issueDescriptionFile: string;
  skillFile: string;
  issueDescriptionContent: string;
  fallbackSkillContent: string;
  sourceSkillFile: string;
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
  launchIntellij?: boolean;
  ideaHome?: string;
}

const DEFAULT_AGENT_SUBDIR = '.agent-workspace';
const DEFAULT_SKILL_FILE = '.opencode/skills/specflow-worktree-automation/SKILL.md';
const AGENT_POLL_INTERVAL_MS = 800;
const AGENT_POLL_MAX_ATTEMPTS = 900;
const AGENT_STALE_OUTPUT_TIMEOUT_MS = 5 * 60 * 1000;

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

const buildPreparedAgentRunPayload = (
  task: TaskItem,
  slot: WorktreeSlot,
  settings?: AppSettings
): PreparedAgentRunPayload => {
  const subdir = settings?.agentSubdir?.trim() || DEFAULT_AGENT_SUBDIR;
  const agentWorkspace = joinPath(slot.path, subdir);
  const issueDescriptionFile = joinPath(joinPath(slot.path, subdir), 'issue-description.md');
  const configuredSkillFile = settings?.agentSkillFile?.trim() || DEFAULT_SKILL_FILE;
  const sourceSkillFile = resolvePathForWorktree(slot.path, configuredSkillFile);
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
    '## 4. Finish — load the smart-commit skill',
    'Read and follow ./skills/smart-commit.md when implementation is complete.'
  ].join('\n');

  const shellWorktreePath = toShellPath(slot.path);
  const shellAgentWorkspace = toShellPath(agentWorkspace);
  const shellIssueDescriptionFile = toShellPath(issueDescriptionFile);
  const shellSkillFile = toShellPath(skillFile);
  const commandTemplate = settings?.agentCommand?.trim() || '';
  const command = ensureWindowsDriveSwitch(ensurePrintLogsFlag(fillTemplate(commandTemplate, {
    issueNumber: String(task.issueNumber),
    branch: task.branchName || '',
    title: task.title,
    worktreePath: shellWorktreePath,
    agentWorkspace: shellAgentWorkspace,
    agentName: settings?.agentName?.trim() || '',
    agentFlag: settings?.agentName?.trim() ? `--agent "${settings?.agentName?.trim()}"` : '',
    issueDescriptionFile: shellIssueDescriptionFile,
    briefFile: shellIssueDescriptionFile,
    skillFile: shellSkillFile
  })), shellWorktreePath);

  return {
    command,
    agentWorkspace,
    issueDescriptionFile,
    skillFile,
    issueDescriptionContent,
    fallbackSkillContent,
    sourceSkillFile
  };
};

const buildAgentWorkspaceSetupPayload = (
  task: TaskItem | undefined,
  slot: WorktreeSlot,
  settings?: AppSettings
): AgentWorkspaceSetupPayload => {
  const subdir = settings?.agentSubdir?.trim() || DEFAULT_AGENT_SUBDIR;
  const agentWorkspace = joinPath(slot.path, subdir);
  const issueDescriptionFile = joinPath(joinPath(slot.path, subdir), 'issue-description.md');
  const configuredSkillFile = settings?.agentSkillFile?.trim() || DEFAULT_SKILL_FILE;
  const sourceSkillFile = resolvePathForWorktree(slot.path, configuredSkillFile);
  const skillFile = joinPath(agentWorkspace, 'SKILL.md');
  const issueDescriptionContent = task ? buildIssueDescription(task) : '';
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
    '## 4. Finish — load the smart-commit skill',
    'Read and follow ./skills/smart-commit.md when implementation is complete.'
  ].join('\n');

  return {
    agentWorkspace,
    issueDescriptionFile,
    skillFile,
    issueDescriptionContent,
    fallbackSkillContent,
    sourceSkillFile
  };
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
  context: Record<string, unknown> = {},
  settings?: AppSettings
): Promise<AgentRunResponse> => {
  console.log(`[bridge:sync] POST ${endpoint} command="${command.slice(0, 120)}${command.length > 120 ? '…' : ''}"`);
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: getBridgeRequestHeaders(getBridgeAuthToken(settings), {
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        command,
        mode: 'shell',
        ...context
      })
    }, 20000);
  } catch (fetchErr) {
    console.warn(`[bridge:sync] fetch failed for ${endpoint}:`, fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
    throw fetchErr;
  }

  console.log(`[bridge:sync] response status=${response.status} from ${endpoint}`);
  const rawText = await response.text();
  let data: AgentRunResponse = {};

  try {
    data = rawText ? JSON.parse(rawText) as AgentRunResponse : {};
  } catch {
    data = { stdout: rawText };
  }

  if (!response.ok) {
    const err = data.error || `Agent bridge returned ${response.status} on ${endpoint}`;
    console.error(`[bridge:sync] error from ${endpoint}: ${err}`);
    throw new Error(err);
  }

  if (data.success === false || (typeof data.exitCode === 'number' && data.exitCode !== 0)) {
    const err = data.error || `Command failed on ${endpoint}`;
    console.error(`[bridge:sync] command failed on ${endpoint}: exitCode=${data.exitCode} error=${err}`);
    throw new Error(err);
  }

  console.log(`[bridge:sync] success from ${endpoint} exitCode=${data.exitCode ?? 0}`);
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
  onProgress?: (progress: AgentProgress) => void,
  signal?: AbortSignal
): Promise<AgentRunResponse> => {
  const base = getBridgeBaseUrl(endpoint);
  const logsUrl = `${base}/logs?jobId=${encodeURIComponent(jobId)}`;
  console.log(`[bridge:poll] starting poll for jobId=${jobId} url=${logsUrl} maxAttempts=${AGENT_POLL_MAX_ATTEMPTS}`);

  for (let i = 0; i < AGENT_POLL_MAX_ATTEMPTS; i += 1) {
    // Abort check at the top of every iteration — stops the loop immediately when the
    // user presses Cancel before the next /logs fetch even starts.
    if (signal?.aborted) {
      console.log(`[bridge:poll] jobId=${jobId} aborted by caller`);
      throw new CancelledError('Job cancelled by user');
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(logsUrl, {
        method: 'GET',
        headers: getBridgeRequestHeaders(getBridgeAuthToken(settings))
      }, 10000);
    } catch (fetchErr) {
      console.warn(`[bridge:poll] attempt=${i + 1} fetch error for jobId=${jobId}:`, fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
      throw new Error(`Unable to poll agent logs - fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
    }

    if (!response.ok) {
      console.error(`[bridge:poll] attempt=${i + 1} HTTP ${response.status} for jobId=${jobId} url=${logsUrl}`);
      throw new Error(`Unable to poll agent logs (${response.status}) from ${logsUrl}`);
    }

    const data = await response.json() as AgentRunResponse;
    const stdoutLength = data.stdout?.trim().length ?? 0;
    const stderrLength = data.stderr?.trim().length ?? 0;
    const hasSeenOutput = stdoutLength > 0 || stderrLength > 0;
    const idleSinceMs = typeof data.updatedAt === 'number'
      ? (Date.now() - data.updatedAt)
      : (typeof data.startedAt === 'number' ? Date.now() - data.startedAt : 0);

    if (i === 0 || i % 10 === 0 || data.done) {
      console.log(
        `[bridge:poll] attempt=${i + 1}/${AGENT_POLL_MAX_ATTEMPTS} jobId=${jobId}` +
        ` done=${data.done} exitCode=${data.exitCode ?? 'running'}` +
        ` pid=${data.pid ?? 'none'} stdout=${stdoutLength}B stderr=${stderrLength}B` +
        ` idleSince=${Math.round(idleSinceMs / 1000)}s`
      );
    }

    const logs = formatLogs(endpoint, command, data);
    onProgress?.({
      logs,
      done: data.done === true,
      success: data.done === true ? (data.success === true && (data.exitCode ?? 0) === 0) : false,
      jobId
    });

    if (data.done === true) {
      console.log(`[bridge:poll] jobId=${jobId} finished - success=${data.success} exitCode=${data.exitCode}`);
      // exitCode 130 = cancelled (SIGINT / user cancel) — surface as CancelledError so the
      // caller doesn't retry other candidates and doesn't spawn a new process.
      if (data.exitCode === 130) {
        throw new CancelledError('Job cancelled by user');
      }
      return data;
    }

    if (idleSinceMs >= AGENT_STALE_OUTPUT_TIMEOUT_MS) {
      console.warn(
        `[bridge:poll] jobId=${jobId} stale - no output for ${Math.round(idleSinceMs / 1000)}s` +
        ` (threshold=${AGENT_STALE_OUTPUT_TIMEOUT_MS / 1000}s) hasSeenOutput=${hasSeenOutput}`
      );
      let cancelNote = '';
      if (settings?.agentEndpoint) {
        try {
          await cancelAgentJob(settings, jobId);
          cancelNote = ' Cancellation requested automatically.';
          console.log(`[bridge:poll] jobId=${jobId} cancelled successfully`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          cancelNote = ` Automatic cancellation failed: ${message}`;
          console.warn(`[bridge:poll] jobId=${jobId} auto-cancel failed: ${message}`);
        }
      }

      throw new Error(
        `${hasSeenOutput ? 'No new output' : 'No stdout/stderr received'} for ${formatDuration(idleSinceMs)}. ` +
        `The command appears non-streaming or waiting for interactive input.${cancelNote}`
      );
    }

    await sleep(AGENT_POLL_INTERVAL_MS);
  }

  console.warn(`[bridge:poll] jobId=${jobId} exceeded max attempts (${AGENT_POLL_MAX_ATTEMPTS}) - timing out`);
  let cancelNote = '';
  if (settings?.agentEndpoint) {
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
  onProgress?: (progress: AgentProgress) => void,
  signal?: AbortSignal
): Promise<AgentImplementationResult> => {
  const commandTemplate = settings?.agentCommand?.trim();
  if (!task.issueNumber || !task.branchName) {
    return {
      success: false,
      command: '',
      logs: 'Missing issue number or branch name for sub-agent execution.',
      implementation: 'Sub-agent could not start because issue or branch is missing.'
    };
  }

  const prepared = buildPreparedAgentRunPayload(task, slot, settings);
  const command = prepared.command;

  if (!commandTemplate) {
    return {
      success: false,
      command,
      logs: 'Agent Command is not configured in settings.',
      implementation: 'Configure `Agent Command` to run the sub-agent for this issue.'
    };
  }

  const endpoint = settings?.agentEndpoint?.trim();
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
  console.log(`[bridge:agent] starting for issue #${task.issueNumber} candidates=[${candidates.join(', ')}]`);

  for (const candidate of candidates) {
    console.log(`[bridge:agent] trying candidate=${candidate}`);
    try {
      console.log(`[bridge:agent] posting typed agent run to ${candidate}`);
      let response: Response;
      try {
        response = await fetchWithTimeout(candidate, {
          method: 'POST',
          headers: getBridgeRequestHeaders(getBridgeAuthToken(settings), {
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            action: 'flowize-run-agent',
            sessionId: task.agentSessionId || `${task.id}-${Date.now()}`,
            issueNumber: task.issueNumber,
            branch: task.branchName,
            worktreePath: slot.path,
            title: task.title,
            command,
            agentWorkspace: prepared.agentWorkspace,
            issueDescriptionFile: prepared.issueDescriptionFile,
            skillFile: prepared.skillFile,
            issueDescriptionContent: prepared.issueDescriptionContent,
            fallbackSkillContent: prepared.fallbackSkillContent,
            sourceSkillFile: prepared.sourceSkillFile
          })
        }, 20000);
      } catch (fetchErr) {
        console.warn(`[bridge:agent] fetch failed for async job on ${candidate}:`, fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
        throw fetchErr;
      }
      console.log(`[bridge:agent] async POST status=${response.status} from ${candidate}`);

      const rawText = await response.text();
      let data: AgentRunResponse = {};

      try {
        data = rawText ? JSON.parse(rawText) as AgentRunResponse : {};
      } catch {
        data = { stdout: rawText };
      }

      if (!response.ok) {
        const maybeError = data.error || `Agent bridge returned ${response.status} on ${candidate}`;
        console.error(`[bridge:agent] async POST failed on ${candidate}: ${maybeError}`);
        throw new Error(maybeError);
      }

      if (data.jobId) {
        const isResumed = (data as AgentRunResponse & { resumed?: boolean }).resumed === true;
        console.log(`[bridge:agent] ${isResumed ? 'resuming' : 'started'} jobId=${data.jobId} on ${candidate}`);
        onProgress?.({
          logs: isResumed ? `Resuming session. jobId=${data.jobId}` : `Agent job started. jobId=${data.jobId}`,
          done: false,
          success: false,
          jobId: data.jobId,
          sessionId: data.sessionId
        });
        data = await pollAsyncJob(candidate, command, data.jobId, settings, onProgress, signal);
      } else {
        console.warn(`[bridge:agent] no jobId returned from ${candidate} - treating as sync response`);
      }

      const logs = formatLogs(candidate, command, data);
      lastLogs = logs;
      onProgress?.({
        logs,
        done: true,
        success: data.success === true && (data.exitCode ?? 0) === 0,
        jobId: data.jobId,
        sessionId: data.sessionId
      });

      if (data.success === false || (typeof data.exitCode === 'number' && data.exitCode !== 0)) {
        const errorMessage = data.error || `Agent bridge returned ${response.status} on ${candidate}`;
        console.error(`[bridge:agent] job failed on ${candidate}: exitCode=${data.exitCode} error=${errorMessage}`);
        throw new Error(errorMessage);
      }

      if ((typeof data.implementation !== 'string' || data.implementation.trim().length === 0)
        && (!data.stdout || data.stdout.trim().length === 0)) {
        console.warn(`[bridge:agent] job on ${candidate} completed with no output`);
        throw new Error('Sub-agent completed with no output. Verify command syntax for your Anti-Gravity CLI.');
      }

      const implementation =
        (typeof data.implementation === 'string' && data.implementation.trim().length > 0)
          ? data.implementation
          : (data.stdout?.trim().length ? data.stdout : 'Sub-agent completed successfully with no implementation output.');

      console.log(`[bridge:agent] success on ${candidate} - implementation length=${implementation.length}`);
      return {
        success: true,
        implementation,
        logs,
        command,
        jobId: data.jobId,
        sessionId: data.sessionId
      };
    } catch (error) {
      // CancelledError must not be retried on another candidate — it means the user
      // explicitly stopped this job.  Rethrow immediately to exit the candidate loop.
      if (error instanceof CancelledError) {
        console.log(`[bridge:agent] jobId cancelled — skipping remaining candidates`);
        throw error;
      }
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`[bridge:agent] candidate=${candidate} failed: ${lastError}`);
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
  const endpoint = settings?.agentEndpoint?.trim();
  if (!endpoint) {
    throw new Error('No local bridge endpoint configured.');
  }

  const subdir = options?.subdir?.trim();
  const targetPath = subdir
    ? joinPath(slot.path, subdir.replace(/^[\\/]+/, ''))
    : slot.path;
  const title = options?.title || `Flowize WT-${slot.id}`;
  const task = options?.task;
  const commandTemplate = settings?.agentCommand?.trim();
  const canBuildTemplatedAgentCommand =
    !!task &&
    !!commandTemplate &&
    !!task.issueNumber &&
    !!task.branchName;

  const worktreeForCommand = toShellPath(slot.path);
  const setupPayload = buildAgentWorkspaceSetupPayload(task, slot, settings);
  const agentWorkspace = setupPayload.agentWorkspace;
  const issueDescriptionFile = setupPayload.issueDescriptionFile;
  const skillFile = setupPayload.skillFile;

  const templatedAgentCommand = canBuildTemplatedAgentCommand
    ? stripPrintLogsFlag(ensureWindowsDriveSwitch(fillTemplate(commandTemplate || '', {
      issueNumber: String(task?.issueNumber),
      branch: task?.branchName || '',
      title: task?.title || '',
      worktreePath: worktreeForCommand,
      agentWorkspace: toShellPath(agentWorkspace),
      agentName: settings?.agentName?.trim() || '',
      agentFlag: settings?.agentName?.trim() ? `--agent "${settings?.agentName?.trim()}"` : '',
      issueDescriptionFile: toShellPath(issueDescriptionFile),
      briefFile: toShellPath(issueDescriptionFile),
      skillFile: toShellPath(skillFile)
    }), worktreeForCommand))
    : '';

  const startHereContent = templatedAgentCommand
    ? [
      '# Flowize Start Here',
      '',
      'This command was run automatically when the terminal opened:',
      '',
      templatedAgentCommand,
      ''
    ].join('\n')
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
      // First, check if the base worktree path exists (not the subdirectory)
      if (options?.ensureDirectory === true && targetPath !== slot.path) {
        const ensureDirectoryResponse = await fetchWithTimeout(candidate, {
          method: 'POST',
          headers: getBridgeRequestHeaders(getBridgeAuthToken(settings), {
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            action: 'flowize-ensure-directory',
            targetPath,
            basePath: slot.path
          })
        }, 10000);

        const ensureDirectoryRaw = await ensureDirectoryResponse.text();
        const ensureDirectoryData = ensureDirectoryRaw ? JSON.parse(ensureDirectoryRaw) as AgentRunResponse : {};
        if (!ensureDirectoryResponse.ok || ensureDirectoryData.success === false) {
          throw new Error(ensureDirectoryData.error || `Worktree base path does not exist: ${slot.path}`);
        }
      }

      if (canBuildTemplatedAgentCommand) {
        const ensureWorkspaceResponse = await fetchWithTimeout(candidate, {
          method: 'POST',
          headers: getBridgeRequestHeaders(getBridgeAuthToken(settings), {
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            action: 'flowize-ensure-agent-workspace',
            ...setupPayload,
            gitignorePath: '',
            gitignoreEntry: '',
            startHereContent,
            startHerePath: startHereContent ? joinPath(targetPath, 'START-HERE.md') : ''
          })
        }, 10000);

        const ensureWorkspaceRaw = await ensureWorkspaceResponse.text();
        const ensureWorkspaceData = ensureWorkspaceRaw ? JSON.parse(ensureWorkspaceRaw) as AgentRunResponse : {};
        if (!ensureWorkspaceResponse.ok || ensureWorkspaceData.success === false) {
          throw new Error(ensureWorkspaceData.error || `Bridge returned ${ensureWorkspaceResponse.status} while preparing local agent workspace`);
        }
      }

      const response = await fetchWithTimeout(candidate, {
        method: 'POST',
        headers: getBridgeRequestHeaders(getBridgeAuthToken(settings), {
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          action: 'open-windows-cmd',
          worktreePath: targetPath,
          title,
          startupCommand,
          closeAfterStartup: options?.closeAfterStartup === true,
          launchAntigravity: options?.launchAntigravity === true,
          launchIntellij: options?.launchIntellij === true,
          ideaHome: options?.ideaHome || settings?.ideaHome || ''
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
  const endpoint = settings?.agentEndpoint?.trim();
  if (!endpoint || !jobId) {
    return;
  }

  const candidates = getBridgeCandidates(endpoint);
  let lastError = '';

  for (const candidate of candidates) {
      const base = getBridgeBaseUrl(candidate);
      const cancelUrl = `${base}/cancel`;
      try {
        const response = await fetchWithTimeout(cancelUrl, {
          method: 'POST',
          headers: getBridgeRequestHeaders(getBridgeAuthToken(settings), {
            'Content-Type': 'application/json'
          }),
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

export const fetchAgentSession = async (
  settings: AppSettings | undefined,
  sessionId: string
): Promise<AgentSessionState> => {
  const endpoint = settings?.agentEndpoint?.trim();
  if (!endpoint || !sessionId) {
    throw new Error('Missing bridge endpoint or sessionId.');
  }

  const candidates = getBridgeCandidates(endpoint);
  let lastError = '';

  for (const candidate of candidates) {
    const base = getBridgeBaseUrl(candidate);
    const sessionUrl = `${base}/agent-session?sessionId=${encodeURIComponent(sessionId)}`;

    try {
      const response = await fetchWithTimeout(sessionUrl, {
        method: 'GET',
        headers: getBridgeRequestHeaders(getBridgeAuthToken(settings))
      }, 10000);

      const raw = await response.text();
      const data = raw ? JSON.parse(raw) as AgentSessionState & { success?: boolean; error?: string } : {};

      if (!response.ok || data.success === false) {
        throw new Error(data.error || `Bridge returned ${response.status} while fetching session ${sessionId}`);
      }

      return data;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError || `Unable to fetch session ${sessionId}`);
};
