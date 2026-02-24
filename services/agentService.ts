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

const DEFAULT_AGENT_SUBDIR = '.agent-workspace';
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
  console.log(`[bridge:sync] POST ${endpoint} command="${command.slice(0, 120)}${command.length > 120 ? '…' : ''}"`);
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
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
  onProgress?: (progress: AgentProgress) => void
): Promise<AgentRunResponse> => {
  const base = endpoint.endsWith('/run') ? endpoint.slice(0, -4) : endpoint;
  const logsUrl = `${base}/logs?jobId=${encodeURIComponent(jobId)}`;
  console.log(`[bridge:poll] starting poll for jobId=${jobId} url=${logsUrl} maxAttempts=${AGENT_POLL_MAX_ATTEMPTS}`);

  for (let i = 0; i < AGENT_POLL_MAX_ATTEMPTS; i += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(logsUrl, { method: 'GET' }, 10000);
    } catch (fetchErr) {
      console.warn(`[bridge:poll] attempt=${i + 1} fetch error for jobId=${jobId}:`, fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
      throw new Error(`Unable to poll agent logs — fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
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
      console.log(`[bridge:poll] jobId=${jobId} finished — success=${data.success} exitCode=${data.exitCode}`);
      return data;
    }

    if (idleSinceMs >= AGENT_STALE_OUTPUT_TIMEOUT_MS) {
      console.warn(
        `[bridge:poll] jobId=${jobId} stale — no output for ${Math.round(idleSinceMs / 1000)}s` +
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

  console.warn(`[bridge:poll] jobId=${jobId} exceeded max attempts (${AGENT_POLL_MAX_ATTEMPTS}) — timing out`);
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
  onProgress?: (progress: AgentProgress) => void
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

  const subdir = settings?.agentSubdir?.trim() || DEFAULT_AGENT_SUBDIR;
  const agentWorkspace = joinPath(slot.path, subdir);
  const issueDescriptionFile = joinPath(joinPath(slot.path, subdir), 'issue-description.md');
  const configuredSkillFile = settings?.agentSkillFile?.trim() || DEFAULT_SKILL_FILE;
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
    agentName: settings?.agentName?.trim() || '',
    agentFlag: settings?.agentName?.trim() ? `--agent "${settings?.agentName?.trim()}"` : '',
    issueDescriptionFile: shellIssueDescriptionFile,
    briefFile: shellIssueDescriptionFile,
    skillFile: shellSkillFile
  })), shellWorktreePath);

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
      console.log(`[bridge:agent] running ensureWorkspace on ${candidate}`);
      await runBridgeSyncCommand(candidate, ensureWorkspaceCommand, {
        worktreePath: slot.path,
        branch: task.branchName,
        issueNumber: task.issueNumber,
        issueDescriptionFile
      });

      console.log(`[bridge:agent] ensureWorkspace done, posting async agent command to ${candidate}`);
      let response: Response;
      try {
        response = await fetchWithTimeout(candidate, {
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
        console.log(`[bridge:agent] async job started jobId=${data.jobId} on ${candidate}`);
        onProgress?.({
          logs: `Agent job started. jobId=${data.jobId}`,
          done: false,
          success: false,
          jobId: data.jobId
        });
        data = await pollAsyncJob(candidate, command, data.jobId, settings, onProgress);
      } else {
        console.warn(`[bridge:agent] no jobId returned from ${candidate} — treating as sync response`);
      }

      const logs = formatLogs(candidate, command, data);
      lastLogs = logs;
      onProgress?.({ logs, done: true, success: data.success === true && (data.exitCode ?? 0) === 0 });

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

      console.log(`[bridge:agent] success on ${candidate} — implementation length=${implementation.length}`);
      return {
        success: true,
        implementation,
        logs,
        command
      };
    } catch (error) {
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
  const agentSubdir = settings?.agentSubdir?.trim() || DEFAULT_AGENT_SUBDIR;
  const agentWorkspace = joinPath(slot.path, agentSubdir);
  const issueDescriptionFile = joinPath(agentWorkspace, 'issue-description.md');
  const configuredSkillFile = settings?.agentSkillFile?.trim() || DEFAULT_SKILL_FILE;
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
      // First, check if the base worktree path exists (not the subdirectory)
      if (options?.ensureDirectory === true && targetPath !== slot.path) {
        // Verify base worktree exists before trying to create subdirectory
        const checkBaseExists = await runBridgeSyncCommand(
          candidate,
          `node -e "const fs=require('fs');process.stdout.write(fs.existsSync(process.argv[1])?'yes':'no')" "${slot.path}"`,
          { worktreePath: slot.path }
        );
        
        const baseExists = String(checkBaseExists?.stdout ?? '').trim().toLowerCase() === 'yes';
        if (!baseExists) {
          throw new Error(
            `Worktree base path does not exist: ${slot.path}\n\n` +
            `The worktree directory has not been created or was deleted.\n` +
            `Please cleanup this slot and re-assign the task to create a fresh worktree.`
          );
        }
        
        // Now create the subdirectory
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
  const endpoint = settings?.agentEndpoint?.trim();
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
