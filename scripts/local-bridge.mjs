import { createServer } from 'http';
import { exec, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, watch } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Strip ANSI/VT100 escape sequences from terminal output
const ANSI_RE = /[][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
const stripAnsi = (str) => str.replace(ANSI_RE, '');

/**
 * Best-effort kill of an OS process by PID.
 * On Windows we use `taskkill /F /T /PID` to also terminate the child tree.
 * On POSIX we send SIGTERM to the process group so spawned children die too.
 */
const killByPid = (pid) => {
  if (!pid || typeof pid !== 'number') return;
  try {
    if (process.platform === 'win32') {
      exec(`taskkill /F /T /PID ${pid}`, () => {});
    } else {
      try {
        process.kill(-pid, 'SIGTERM'); // kill process group
      } catch {
        process.kill(pid, 'SIGTERM');  // fallback: kill just the pid
      }
    }
  } catch {
    // If the process is already gone, ignore the error.
  }
};

/**
 * On Windows: kill all processes in the subtree rooted at rootPid, plus any
 * process whose command line contains worktreePath (catches orphans that were
 * re-parented after cmd.exe exited).
 *
 * Uses PowerShell + CIM to get the full process tree in one query, then kills
 * each matching PID. Runs at cancel/timeout time — no pre-computation race.
 *
 * @param {number|null} rootPid      - The shell PID (cmd.exe) stored on the job.
 * @param {string}      worktreePath - The worktree directory path (may use / or \).
 */
const killProcessTree = (rootPid, worktreePath) => {
  if (process.platform !== 'win32') return;

  const ownPid = process.pid;

  // Normalize path to backslashes for command-line matching.
  const normalizedPath = (worktreePath || '').replace(/\//g, '\\');

  // Build a PowerShell script as a plain string, then Base64-encode it so we
  // don't have to worry about shell quoting at all.
  const psScript = [
    `$ProgressPreference = 'SilentlyContinue'`,  // suppress progress stream → stderr CLIXML noise
    `$ownPid = ${ownPid}`,
    `$rootPid = ${rootPid || 0}`,
    `$matchPath = '${normalizedPath.replace(/'/g, "''")}'`,
    `$all = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CommandLine`,
    `function Get-Subtree([int]$id) {`,
    `  $kids = $all | Where-Object { $_.ParentProcessId -eq $id -and $_.ProcessId -ne $id }`,
    `  foreach ($k in $kids) { $id; Get-Subtree $k.ProcessId }`,
    `}`,
    `$targets = [System.Collections.Generic.HashSet[int]]::new()`,
    `if ($rootPid -gt 0) { foreach ($p in (Get-Subtree $rootPid)) { [void]$targets.Add($p) }; [void]$targets.Add($rootPid) }`,
    `if ($matchPath -ne '') { foreach ($p in $all) { if ($p.CommandLine -like "*$matchPath*") { [void]$targets.Add($p.ProcessId) } } }`,
    `foreach ($pid in $targets) { if ($pid -ne $ownPid -and $pid -gt 0) { try { Stop-Process -Id $pid -Force -EA SilentlyContinue } catch {} } }`
  ].join('; ');

  // Encode as UTF-16LE Base64 for -EncodedCommand (avoids all shell-quoting issues).
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

  exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, (err, _stdout, stderr) => {
    // PowerShell writes its progress stream as CLIXML to stderr even with -NonInteractive.
    // Ignore stderr that is purely the CLIXML progress envelope; only warn on real errors.
    const stderrTrimmed = (stderr || '').trim();
    const isCLIXMLOnly = stderrTrimmed.startsWith('#< CLIXML');
    if (err && stderrTrimmed && !isCLIXMLOnly) {
      log.warn(`[kill-tree] powershell error: ${stderrTrimmed.slice(0, 300)}`);
    }
  });
};

const ENV_FILE = '.env.local';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
const LOG_LEVEL = (process.env.BRIDGE_LOG_LEVEL || 'info').toLowerCase();
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLogLevel = LOG_LEVELS[LOG_LEVEL] ?? LOG_LEVELS.info;

const ts = () => new Date().toISOString();

const log = {
  debug: (...args) => { if (currentLogLevel <= LOG_LEVELS.debug) console.debug(`[bridge] [DEBUG] ${ts()}`, ...args); },
  info: (...args) => { if (currentLogLevel <= LOG_LEVELS.info) console.log(`[bridge] [INFO]  ${ts()}`, ...args); },
  warn: (...args) => { if (currentLogLevel <= LOG_LEVELS.warn) console.warn(`[bridge] [WARN]  ${ts()}`, ...args); },
  error: (...args) => { if (currentLogLevel <= LOG_LEVELS.error) console.error(`[bridge] [ERROR] ${ts()}`, ...args); },
};

const loadLocalEnvFile = () => {
  if (!existsSync(ENV_FILE)) {
    log.debug(`${ENV_FILE} not found, skipping`);
    return;
  }

  try {
    const content = readFileSync(ENV_FILE, 'utf8');
    const lines = content.split(/\r?\n/);
    const loaded = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
      const separatorIndex = withoutExport.indexOf('=');
      if (separatorIndex <= 0) continue;

      const key = withoutExport.slice(0, separatorIndex).trim();
      if (!key) continue;

      let value = withoutExport.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (value && value !== `your_${key.toLowerCase()}`) {
        process.env[key] = value;
        loaded.push(key);
      }
    }

    if (loaded.length > 0) {
      log.debug(`.env.local loaded keys: ${loaded.join(', ')}`);
    }
  } catch (err) {
    log.warn('.env.local parse error:', err.message);
  }
};

loadLocalEnvFile();

const PORT = Number(process.env.BRIDGE_PORT || 4141);
const HOST = process.env.BRIDGE_HOST || '0.0.0.0';
let ALLOWED_ORIGIN = process.env.BRIDGE_ALLOWED_ORIGIN || '*';
let BRIDGE_AUTH_TOKEN = (process.env.BRIDGE_AUTH_TOKEN || '').trim();
const WORKDIR = process.env.BRIDGE_WORKDIR || process.cwd();
const BRIDGE_DATA_DIR = process.env.BRIDGE_DATA_DIR || path.join(WORKDIR, '.flowize-bridge');
const JOB_TTL_MS = Number(process.env.BRIDGE_JOB_TTL_MS || 30 * 60 * 1000);
const JOB_MAX_RUNTIME_MS = Number(process.env.BRIDGE_JOB_MAX_RUNTIME_MS || 10 * 60 * 1000);
const SYNC_MAX_RUNTIME_MS = Number(process.env.BRIDGE_SYNC_MAX_RUNTIME_MS || 5 * 60 * 1000);
let GITHUB_OAUTH_CLIENT_ID = (process.env.GITHUB_OAUTH_CLIENT_ID || '').trim();
let GITHUB_OAUTH_CLIENT_SECRET = (process.env.GITHUB_OAUTH_CLIENT_SECRET || '').trim();
let GITHUB_OAUTH_SCOPE = (process.env.GITHUB_OAUTH_SCOPE || 'read:user repo').trim();
let GITHUB_OAUTH_CALLBACK_HOST = (process.env.GITHUB_OAUTH_CALLBACK_HOST || '127.0.0.1').trim();
let GITHUB_OAUTH_REDIRECT_URI = (process.env.GITHUB_OAUTH_REDIRECT_URI || `http://${GITHUB_OAUTH_CALLBACK_HOST}:${PORT}/github/oauth/callback`).trim();
const OAUTH_STATE_TTL_MS = Number(process.env.GITHUB_OAUTH_STATE_TTL_MS || 10 * 60 * 1000);

const jobs = new Map();
const oauthStates = new Map();
const agentSessions = new Map();

let server;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const JOBS_STATE_FILE = path.join(BRIDGE_DATA_DIR, 'jobs.json');
const SESSIONS_STATE_FILE = path.join(BRIDGE_DATA_DIR, 'agent-sessions.json');

const ensureBridgeDataDir = () => {
  if (!existsSync(BRIDGE_DATA_DIR)) {
    mkdirSync(BRIDGE_DATA_DIR, { recursive: true });
  }
};

const safeWriteJsonFile = (filePath, value) => {
  ensureBridgeDataDir();
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
};

const loadJsonFile = (filePath, fallback) => {
  try {
    if (!existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    log.warn(`Failed to load persisted file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
};

const serializeJob = (job) => ({
  id: job.id,
  command: job.command,
  startedAt: job.startedAt,
  updatedAt: job.updatedAt,
  done: job.done,
  success: job.success,
  exitCode: job.exitCode,
  stdout: job.stdout,
  stderr: job.stderr,
  error: job.error,
  worktreePath: job.worktreePath || '',
  pid: typeof job.child?.pid === 'number' ? job.child.pid : (job.pid ?? null),
  innerPid: typeof job.innerPid === 'number' ? job.innerPid : null
});

const persistJobs = () => {
  safeWriteJsonFile(JOBS_STATE_FILE, Array.from(jobs.values()).map(serializeJob));
};

const persistAgentSessions = () => {
  safeWriteJsonFile(SESSIONS_STATE_FILE, Array.from(agentSessions.values()));
};

const updateAgentSessionsForJob = (jobId) => {
  let changed = false;
  for (const session of agentSessions.values()) {
    if (session.jobId !== jobId) continue;
    const job = jobs.get(jobId);
    if (!job) continue;
    session.updatedAt = job.updatedAt || Date.now();
    session.status = job.done
      ? (job.success ? 'completed' : (job.exitCode === 130 ? 'cancelled' : 'failed'))
      : 'running';
    changed = true;
  }
  if (changed) {
    persistAgentSessions();
  }
};

const persistJobState = (job) => {
  jobs.set(job.id, job);
  persistJobs();
  updateAgentSessionsForJob(job.id);
};

const getBridgeMetrics = () => {
  const sessions = Array.from(agentSessions.values());
  const runningSessions = sessions.filter((session) => session.status === 'running').length;
  const completedSessions = sessions.filter((session) => session.status === 'completed').length;
  const interruptedSessions = sessions.filter((session) => session.status === 'interrupted').length;
  const failedSessions = sessions.filter((session) => session.status === 'failed').length;
  const cancelledSessions = sessions.filter((session) => session.status === 'cancelled').length;
  const activeJobs = Array.from(jobs.values()).filter((job) => !job.done).length;

  return {
    activeJobs,
    totalJobs: jobs.size,
    runningSessions,
    completedSessions,
    interruptedSessions,
    failedSessions,
    cancelledSessions,
    totalSessions: sessions.length
  };
};

const BRIDGE_STARTED_AT = Date.now();

const getBridgeDiagnostics = () => ({
  startedAt: BRIDGE_STARTED_AT,
  uptimeMs: Date.now() - BRIDGE_STARTED_AT,
  host: HOST,
  port: PORT,
  workdir: WORKDIR,
  allowedOrigin: ALLOWED_ORIGIN,
  dataDir: BRIDGE_DATA_DIR,
  logLevel: LOG_LEVEL,
  authRequired: isAuthRequired(),
  oauthEnabled: Boolean(GITHUB_OAUTH_CLIENT_ID && GITHUB_OAUTH_CLIENT_SECRET)
});

const markRestoredStateInterrupted = () => {
  let jobsChanged = false;
  let sessionsChanged = false;

  for (const job of jobs.values()) {
    if (!job.done) {
      const pid = typeof job.child?.pid === 'number' ? job.child.pid : job.pid;
      log.info(`[restart] killing process tree pid=${pid ?? 'none'} worktree="${job.worktreePath}" jobId=${job.id}`);
      killByPid(pid);
      killProcessTree(pid, job.worktreePath);
      job.done = true;
      job.success = false;
      job.exitCode = 1;
      job.error = job.error || 'Bridge restarted while job was running';
      job.updatedAt = Date.now();
      job.child = null;
      jobsChanged = true;
    }
  }

  for (const session of agentSessions.values()) {
    if (session.status === 'running') {
      session.status = 'interrupted';
      session.updatedAt = Date.now();
      sessionsChanged = true;
    }
  }

  if (jobsChanged) {
    persistJobs();
  }
  if (sessionsChanged) {
    persistAgentSessions();
  }
};

const restorePersistedState = () => {
  const storedJobs = loadJsonFile(JOBS_STATE_FILE, []);
  const storedSessions = loadJsonFile(SESSIONS_STATE_FILE, []);

  if (Array.isArray(storedJobs)) {
    for (const item of storedJobs) {
      if (!item || typeof item.id !== 'string') continue;
      jobs.set(item.id, {
        id: item.id,
        command: typeof item.command === 'string' ? item.command : '',
        startedAt: Number(item.startedAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Date.now(),
        done: item.done === true,
        success: item.success === true,
        exitCode: typeof item.exitCode === 'number' ? item.exitCode : null,
        stdout: typeof item.stdout === 'string' ? item.stdout : '',
        stderr: typeof item.stderr === 'string' ? item.stderr : '',
        error: typeof item.error === 'string' ? item.error : '',
        worktreePath: typeof item.worktreePath === 'string' ? item.worktreePath : '',
        pid: typeof item.pid === 'number' ? item.pid : null,
        innerPid: typeof item.innerPid === 'number' ? item.innerPid : null,
        child: null
      });
    }
  }

  if (Array.isArray(storedSessions)) {
    log.info(`restorePersistedState - loading ${storedSessions.length} sessions from ${SESSIONS_STATE_FILE}`);
    for (const item of storedSessions) {
      if (!item || typeof item.sessionId !== 'string') {
        log.warn(`restorePersistedState - skipping invalid session entry: ${JSON.stringify(item)}`);
        continue;
      }
      agentSessions.set(item.sessionId, {
        ...item,
        updatedAt: Number(item.updatedAt) || Date.now(),
        createdAt: Number(item.createdAt) || Date.now()
      });
      log.info(`restorePersistedState - loaded session id=${item.sessionId} status=${item.status} jobId=${item.jobId}`);
    }
  }

  markRestoredStateInterrupted();
  log.info(`restored persisted state jobs=${jobs.size} sessions=${agentSessions.size} dataDir=${BRIDGE_DATA_DIR}`);
};

let restartTimeout;
const restartServer = () => {
  if (restartTimeout) return;
  restartTimeout = setTimeout(() => {
    restartTimeout = null;
    log.info('.env.local changed, restarting bridge...');
    if (server) {
      server.close(() => {
        log.info('Server closed, reloading env and starting fresh...');
        loadLocalEnvFile();
        updateOAuthConstants();
        startServer();
      });
    }
  }, 500);
};

const updateOAuthConstants = () => {
  ALLOWED_ORIGIN = process.env.BRIDGE_ALLOWED_ORIGIN || '*';
  BRIDGE_AUTH_TOKEN = (process.env.BRIDGE_AUTH_TOKEN || '').trim();
  GITHUB_OAUTH_CLIENT_ID = (process.env.GITHUB_OAUTH_CLIENT_ID || '').trim();
  GITHUB_OAUTH_CLIENT_SECRET = (process.env.GITHUB_OAUTH_CLIENT_SECRET || '').trim();
  GITHUB_OAUTH_SCOPE = (process.env.GITHUB_OAUTH_SCOPE || 'read:user repo').trim();
  GITHUB_OAUTH_CALLBACK_HOST = (process.env.GITHUB_OAUTH_CALLBACK_HOST || '127.0.0.1').trim();
  GITHUB_OAUTH_REDIRECT_URI = (process.env.GITHUB_OAUTH_REDIRECT_URI || `http://${GITHUB_OAUTH_CALLBACK_HOST}:${PORT}/github/oauth/callback`).trim();

  if (GITHUB_OAUTH_CLIENT_ID && GITHUB_OAUTH_CLIENT_SECRET) {
    log.info(`OAuth updated: client_id=${GITHUB_OAUTH_CLIENT_ID} redirect=${GITHUB_OAUTH_REDIRECT_URI}`);
  } else {
    log.warn('OAuth disabled - missing client_id or client_secret');
  }
};

const watchEnvFile = () => {
  try {
    watch(ENV_FILE, (eventType) => {
      if (eventType === 'change') {
        restartServer();
      }
    });
    log.info(`Watching ${ENV_FILE} for changes`);
  } catch (err) {
    log.warn(`Failed to watch ${ENV_FILE}: ${err.message}`);
  }
};

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (ALLOWED_ORIGIN === '*') return true;
  const allowed = ALLOWED_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin);
};

const writeJson = (res, status, body, origin = '') => {
  const allowOrigin = ALLOWED_ORIGIN === '*'
    ? '*'
    : (isOriginAllowed(origin) ? origin : ALLOWED_ORIGIN.split(',')[0].trim());
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,Access-Control-Request-Private-Network',
    'Access-Control-Allow-Private-Network': 'true',
    'Vary': 'Origin'
  });
  res.end(JSON.stringify(body));
  log.debug(`  -> ${status} JSON origin=${allowOrigin || '(none)'}`);
};

const writeCorsError = (res, status, body, origin = '') => {
  writeJson(res, status, {
    ...body,
    diagnostics: {
      requestOrigin: origin || '(none)',
      allowedOrigins: ALLOWED_ORIGIN,
      authRequired: isAuthRequired()
    }
  }, origin);
};

const writeHtml = (res, status, html) => {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(html);
  log.debug(`  -> ${status} HTML`);
};

const cleanupExpiredJobs = () => {
  const now = Date.now();
  let changed = false;
  for (const [jobId, job] of jobs.entries()) {
    if (!job.done) continue;
    if (now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(jobId);
      changed = true;
    }
  }
  if (changed) {
    persistJobs();
  }
};

const cleanupExpiredOAuthStates = () => {
  const now = Date.now();
  for (const [state, entry] of oauthStates.entries()) {
    if (now - entry.createdAt > OAUTH_STATE_TTL_MS) {
      oauthStates.delete(state);
    }
  }
};

const oauthMessagePage = ({ success, origin, token, scope, error }) => {
  const safeOrigin = origin || '*';
  const payload = {
    source: 'flowize-github-oauth',
    success,
    token,
    scope,
    error
  };
  const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const originJson = JSON.stringify(safeOrigin);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Flowize GitHub Login</title>
</head>
<body style="font-family: sans-serif; padding: 24px; background: #0f172a; color: #e2e8f0;">
  <h2 style="margin: 0 0 8px;">${success ? 'GitHub login complete' : 'GitHub login failed'}</h2>
  <p style="margin: 0 0 16px; color: #94a3b8;">${success ? 'You can close this window.' : (error || 'Authentication failed.')}</p>
  <script>
    (function () {
      var payload = ${payloadJson};
      var targetOrigin = ${originJson};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, targetOrigin);
        }
      } catch (e) {
        // ignore
      }
      setTimeout(function () { window.close(); }, 100);
    })();
  </script>
</body>
</html>`;
};

const openTerminal = async (
  worktreePath,
  title = 'Flowize Worktree',
  startupCommand = 'git status',
  closeAfterStartup = false,
  launchAntigravity = false,
  launchIntellij = false,
  ideaHome = ''
) => {
  if (!worktreePath) {
    return { success: false, error: 'Missing worktreePath' };
  }

  if (!existsSync(worktreePath)) {
    return { success: false, error: `Worktree path does not exist: ${worktreePath}` };
  }

  const bootCommand = typeof startupCommand === 'string' && startupCommand.trim().length > 0
    ? startupCommand.replace(/[\r\n]+/g, ' ').trim()
    : 'git status';

  if (process.platform === 'win32') {
    return openWindowsTerminal(worktreePath, title, bootCommand, closeAfterStartup, launchAntigravity, launchIntellij, ideaHome);
  }

  if (process.platform === 'darwin') {
    return openMacOSTerminal(worktreePath, title, bootCommand, closeAfterStartup, launchAntigravity);
  }

  return openLinuxTerminal(worktreePath, title, bootCommand, closeAfterStartup, launchAntigravity);
};

const getBearerToken = (req) => {
  const value = req.headers.authorization || '';
  if (!value.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return value.slice(7).trim();
};

const isAuthRequired = () => BRIDGE_AUTH_TOKEN.length > 0;

const isAuthExemptRoute = (req) => {
  if (req.method === 'OPTIONS') return true;
  if (req.method === 'GET' && req.url?.startsWith('/github/oauth/callback')) return true;
  return false;
};

const isAuthorized = (req) => {
  if (!isAuthRequired()) return true;
  return getBearerToken(req) === BRIDGE_AUTH_TOKEN;
};

const openWindowsTerminal = async (worktreePath, title, bootCommand, closeAfterStartup, launchAntigravity, launchIntellij, ideaHome = '') => {
  const normalizedPath = /^[a-zA-Z]:\//.test(worktreePath)
    ? worktreePath.replace(/\//g, '\\')
    : worktreePath;

  const shell = process.env.ComSpec || 'cmd.exe';
  const escapedPath = normalizedPath.replace(/"/g, '');
  const escapedTitle = title
    .replace(/[\r\n]/g, ' ')
    .replace(/["&|<>^]/g, '')
    .trim() || 'Flowize Worktree';

  if (launchAntigravity) {
    log.info(`[openIDE] Launching Antigravity for ${escapedPath}`);
    const shell = process.env.ComSpec || 'cmd.exe';
    const antigravityChild = spawn(shell, ['/c', 'start', 'antigravity', '--new-window', '.'], {
      cwd: escapedPath,
      detached: true,
      windowsHide: false,
      stdio: 'inherit',
      env: process.env
    });
    antigravityChild.unref();

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        resolve(payload);
      };

      antigravityChild.once('error', (error) => {
        finish({ success: false, error: `Failed to launch Antigravity: ${error.message}` });
      });

      antigravityChild.once('close', (code) => {
        if (typeof code === 'number' && code !== 0) {
          finish({ success: false, error: `Failed to launch Antigravity (exit code ${code})` });
          return;
        }
        finish({ success: true });
      });

      setTimeout(() => finish({ success: true }), 250);
    });
  }

  if (launchIntellij) {
    if (!ideaHome) {
      return { success: false, error: 'IntelliJ IDEA path not configured. Set IDEA_HOME in Settings.' };
    }
    const ideaPath = path.join(ideaHome, 'bin', 'idea64.exe');
    const ideaConfig = process.env.USERPROFILE + '\\.idea-git-only';
    log.info(`[openIDE] Launching IntelliJ: ${ideaPath} with ${escapedPath}`);
    const ideChild = spawn(ideaPath, [
      '-Didea.config.path=' + ideaConfig + '\\config',
      '-Didea.system.path=' + ideaConfig + '\\system',
      '-Didea.plugins.path=' + ideaConfig + '\\plugins',
      escapedPath
    ], {
      cwd: escapedPath,
      detached: true,
      windowsHide: false,
      stdio: 'inherit',
      env: process.env
    });
    ideChild.unref();

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        resolve(payload);
      };

      ideChild.once('error', (error) => {
        finish({ success: false, error: `Failed to launch IDE: ${error.message}` });
      });

      ideChild.once('close', (code) => {
        if (typeof code === 'number' && code !== 0) {
          finish({ success: false, error: `Failed to launch IDE (exit code ${code})` });
          return;
        }
        finish({ success: true });
      });

      setTimeout(() => finish({ success: true }), 250);
    });
  }

  const startupScriptPath = `${escapedPath.replace(/[\\/]+$/, '')}\\.flowize-startup.cmd`;
  const startupScriptName = '.flowize-startup.cmd';
  const startupScript = [
    '@echo off',
    `title ${escapedTitle}`,
    bootCommand
  ].join('\r\n');
  writeFileSync(startupScriptPath, startupScript, 'utf8');

  const child = spawn(shell, [
    '/d',
    '/c',
    'start',
    '""',
    '/D',
    escapedPath,
    'cmd.exe',
    '/d',
    closeAfterStartup ? '/c' : '/k',
    `call ${startupScriptName}`
  ], {
    cwd: escapedPath,
    detached: true,
    windowsHide: false,
    stdio: 'ignore',
    env: process.env
  });
  child.unref();

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    child.once('error', (error) => {
      finish({ success: false, error: error.message });
    });

    child.once('close', (code) => {
      if (typeof code === 'number' && code !== 0) {
        finish({ success: false, error: `Failed to launch cmd.exe (exit code ${code})` });
        return;
      }
      finish({ success: true });
    });

    setTimeout(() => finish({ success: true }), 250);
  });
};

const openMacOSTerminal = async (worktreePath, title, bootCommand, closeAfterStartup, launchAntigravity) => {
  const escapedPath = worktreePath.replace(/"/g, '\\"');
  const escapedTitle = title.replace(/"/g, '\\"').replace(/[\r\n]/g, ' ').trim() || 'Flowize Worktree';

  if (launchAntigravity) {
    const child = spawn('open', ['-a', 'Terminal', worktreePath], {
      cwd: worktreePath,
      detached: true,
      stdio: 'ignore',
      env: process.env
    });
    child.unref();

    await new Promise((resolve) => setTimeout(resolve, 500));

    const antigravityChild = spawn('osascript', ['-e', `
      tell application "Terminal"
        do script "cd '${escapedPath}' && antigravity --new-window ." in front window
      end tell
    `], {
      cwd: worktreePath,
      detached: true,
      stdio: 'ignore',
      env: process.env
    });
    antigravityChild.unref();

    return { success: true };
  }

  const script = `cd "${escapedPath}" && clear && echo "=== ${escapedTitle} ===" && echo "" && ${bootCommand}${closeAfterStartup ? '' : ' && exec $SHELL'}`;

  const child = spawn('osascript', ['-e', `
    tell application "Terminal"
      activate
      do script "${script.replace(/"/g, '\\"')}"
    end tell
  `], {
    cwd: worktreePath,
    detached: true,
    stdio: 'ignore',
    env: process.env
  });
  child.unref();

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    child.once('error', (error) => {
      finish({ success: false, error: error.message });
    });

    setTimeout(() => finish({ success: true }), 250);
  });
};

const openLinuxTerminal = async (worktreePath, title, bootCommand, closeAfterStartup, launchAntigravity) => {
  const escapedPath = worktreePath.replace(/"/g, '\\"');
  const escapedTitle = title.replace(/"/g, '\\"').replace(/[\r\n]/g, ' ').trim() || 'Flowize Worktree';

  const terminals = [
    { cmd: 'gnome-terminal', args: (script) => ['--title', escapedTitle, '--', 'bash', '-c', script] },
    { cmd: 'konsole', args: (script) => ['--title', escapedTitle, '-e', 'bash', '-c', script] },
    { cmd: 'xfce4-terminal', args: (script) => ['--title', escapedTitle, '-e', `bash -c "${script}"`] },
    { cmd: 'mate-terminal', args: (script) => ['--title', escapedTitle, '-e', `bash -c "${script}"`] },
    { cmd: 'xterm', args: (script) => ['-T', escapedTitle, '-e', 'bash', '-c', script] },
  ];

  if (launchAntigravity) {
    bootCommand = `launch-idea-git.bat "${escapedPath}"`;
  }

  const script = `cd "${escapedPath}" && echo "=== ${escapedTitle} ===" && echo "" && ${bootCommand}${closeAfterStartup ? '' : ' && exec bash'}`;

  for (const terminal of terminals) {
    try {
      const child = spawn(terminal.cmd, terminal.args(script), {
        cwd: worktreePath,
        detached: true,
        stdio: 'ignore',
        env: process.env
      });
      child.unref();

      return await new Promise((resolve) => {
        let settled = false;
        const finish = (payload) => {
          if (settled) return;
          settled = true;
          resolve(payload);
        };

        child.once('error', () => {
          finish(null);
        });

        setTimeout(() => finish({ success: true }), 250);
      });
    } catch {
      continue;
    }
  }

  return { success: false, error: 'No supported terminal emulator found. Install gnome-terminal, konsole, xfce4-terminal, or xterm.' };
};

const openWindowsCmd = openWindowsTerminal;

const normalizeWorktreePath = (value) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const parseWorktreeList = (porcelainOutput) => {
  return porcelainOutput
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const pathLine = lines.find((line) => line.startsWith('worktree '));
      const branchLine = lines.find((line) => line.startsWith('branch refs/heads/'));
      return {
        path: pathLine ? pathLine.replace('worktree ', '').trim() : '',
        branch: branchLine ? branchLine.replace('branch refs/heads/', '').trim() : undefined
      };
    })
    .filter((item) => item.path);
};

const isDirectoryBusyError = (message) => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('ebusy')
    || normalized.includes('resource busy')
    || normalized.includes('operation not permitted')
    || normalized.includes('permission denied')
    || normalized.includes('access is denied');
};

const isNotWorktreeError = (message) => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('is not a working tree') || normalized.includes('not a working tree');
};

const createWorktreeAction = async ({ repoPath, targetPath, branchName, defaultBranch }) => {
  if (!repoPath || !targetPath || !branchName || !defaultBranch) {
    return { success: false, error: 'Missing repoPath, targetPath, branchName, or defaultBranch' };
  }

  const fetchResult = await runShellCommand('git fetch origin', repoPath);
  if (!fetchResult.success) {
    return fetchResult;
  }

  const pruneResult = await runShellCommand('git worktree prune', repoPath);
  if (!pruneResult.success) {
    return pruneResult;
  }

  const listResult = await runShellCommand('git worktree list --porcelain', repoPath);
  if (!listResult.success) {
    return listResult;
  }

  const worktrees = parseWorktreeList(String(listResult.stdout || ''));
  const normalizedTargetPath = normalizeWorktreePath(targetPath);
  const existingAtPath = worktrees.find((item) => normalizeWorktreePath(item.path) === normalizedTargetPath);
  if (existingAtPath) {
    if (existingAtPath.branch === branchName) {
      return { success: true, reused: true, worktreePath: targetPath, branchName };
    }
    return {
      success: false,
      error: `Target path already mapped to branch '${existingAtPath.branch || 'unknown'}'. Cleanup slot path '${targetPath}' before reassigning.`
    };
  }

  const branchInUse = worktrees.find((item) => item.branch === branchName);
  if (branchInUse) {
    return {
      success: false,
      error: `Branch '${branchName}' is already checked out at '${branchInUse.path}'. Use that worktree, or cleanup it before reassigning.`
    };
  }

  if (existsSync(targetPath)) {
    return {
      success: false,
      error: `Target directory '${targetPath}' already exists but is not a managed git worktree. Remove or rename it, then retry.`
    };
  }

  const branchExistsResult = await runShellCommand(`git show-ref --verify --quiet "refs/heads/${branchName}" && echo yes || echo no`, repoPath);
  if (!branchExistsResult.success) {
    return branchExistsResult;
  }

  const branchExists = String(branchExistsResult.stdout || '').trim().toLowerCase() === 'yes';
  const addCommand = branchExists
    ? `git worktree add "${targetPath}" "${branchName}"`
    : `git worktree add -b "${branchName}" "${targetPath}" "origin/${defaultBranch}"`;

  const createResult = await runShellCommand(addCommand, repoPath);
  if (!createResult.success) {
    return createResult;
  }

  return { success: true, reused: false, worktreePath: targetPath, branchName };
};

const cleanupWorktreeAction = async ({ repoPath, targetPath }) => {
  if (!repoPath || !targetPath) {
    return { success: false, error: 'Missing repoPath or targetPath' };
  }

  const removeCommand = `git worktree remove --force "${targetPath}"`;
  const retryDelays = [0, 800, 1800, 3500];
  let removed = false;
  let lastError = '';

  for (const waitMs of retryDelays) {
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const result = await runShellCommand(removeCommand, repoPath);
    if (result.success) {
      removed = true;
      break;
    }

    lastError = result.error || `Command failed with exit code ${result.exitCode}`;
    if (isNotWorktreeError(lastError)) {
      try {
        rmSync(targetPath, { recursive: true, force: true });
        removed = true;
        break;
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    if (isDirectoryBusyError(lastError)) {
      continue;
    }

    return result;
  }

  if (!removed) {
    try {
      rmSync(targetPath, { recursive: true, force: true });
      removed = true;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const pruneResult = await runShellCommand('git worktree prune', repoPath);
  if (!pruneResult.success && !isDirectoryBusyError(pruneResult.error)) {
    return pruneResult;
  }

  return {
    success: true,
    removed,
    warning: !pruneResult.success ? pruneResult.error || '' : ''
  };
};

const pushWorktreeBranchAction = async ({ worktreePath, branchName, forceWithLease = false }) => {
  if (!worktreePath || !branchName) {
    return { success: false, error: 'Missing worktreePath or branchName' };
  }

  const commitMessage = `chore: sync worktree updates for ${branchName}`;
  const commitCommand = `git add -A && git diff --cached --quiet || git commit -m "${commitMessage.replace(/"/g, '')}"`;
  const commitResult = await runShellCommand(commitCommand, worktreePath);
  if (!commitResult.success) {
    return commitResult;
  }

  const remoteExistsResult = await runShellCommand(
    `git show-ref --verify --quiet "refs/remotes/origin/${branchName}" && echo yes || echo no`,
    worktreePath
  );
  if (!remoteExistsResult.success) {
    return remoteExistsResult;
  }

  const remoteExists = String(remoteExistsResult.stdout || '').trim().toLowerCase() === 'yes';

  const syncWithRemoteBranch = async () => {
    if (!remoteExists) {
      return { success: true };
    }

    const fetchResult = await runShellCommand(`git fetch origin "${branchName}"`, worktreePath);
    if (!fetchResult.success) {
      return fetchResult;
    }

    const rebaseResult = await runShellCommand(`git rebase "origin/${branchName}"`, worktreePath);
    if (rebaseResult.success) {
      return rebaseResult;
    }

    await runShellCommand('git rebase --abort', worktreePath);
    return {
      success: false,
      error: `Remote branch '${branchName}' has newer commits and auto-rebase failed. Resolve conflicts in the worktree and retry push. Details: ${rebaseResult.error || rebaseResult.stderr || 'unknown rebase error'}`
    };
  };

  if (!forceWithLease) {
    const syncResult = await syncWithRemoteBranch();
    if (!syncResult.success) {
      return syncResult;
    }
  }

  const pushCommand = forceWithLease
    ? `git push --force-with-lease -u origin "${branchName}"`
    : `git push -u origin "${branchName}"`;

  let pushResult = await runShellCommand(pushCommand, worktreePath);
  if (!pushResult.success && !forceWithLease) {
    const message = `${pushResult.error || ''}\n${pushResult.stderr || ''}`;
    const remoteRefMissing = /couldn't find remote ref|unknown revision|invalid refspec/i.test(message);
    const needsSyncRetry = /fetch first|non-fast-forward|failed to push some refs/i.test(message);

    if (remoteRefMissing) {
      pushResult = await runShellCommand(pushCommand, worktreePath);
      return pushResult;
    }

    if (needsSyncRetry) {
      const syncResult = await syncWithRemoteBranch();
      if (!syncResult.success) {
        return syncResult;
      }
      pushResult = await runShellCommand(pushCommand, worktreePath);
    }
  }

  return pushResult;
};

const FLOWIZE_SKILL_NAMES = [
  'prompt-contracts',
  'pro-workflow-core',
  'subagent-verification-loops',
  'smart-commit'
];

const OPENCODE_SKILLS_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config', 'opencode', 'skills'
);

const prepareAgentWorkspace = ({
  agentWorkspace,
  issueDescriptionFile,
  issueDescriptionContent,
  sourceSkillFile,
  skillFile,
  fallbackSkillContent
}) => {
  if (!agentWorkspace || !issueDescriptionFile || !skillFile) {
    return { success: false, error: 'Missing agent workspace paths' };
  }

  try {
    if (!existsSync(agentWorkspace)) {
      mkdirSync(agentWorkspace, { recursive: true });
    }

    writeFileSync(issueDescriptionFile, issueDescriptionContent || '', 'utf8');

    let skillContent = '';
    try {
      if (sourceSkillFile && existsSync(sourceSkillFile) && statSync(sourceSkillFile).isFile()) {
        skillContent = readFileSync(sourceSkillFile, 'utf8');
      }
    } catch {
      // ignored, fallback below
    }

    if (!skillContent.trim()) {
      skillContent = fallbackSkillContent || '';
    }

    writeFileSync(skillFile, skillContent, 'utf8');

    // Copy workflow skills into the agent workspace so the agent can read them locally
    const skillsDestDir = path.join(agentWorkspace, 'skills');
    if (!existsSync(skillsDestDir)) {
      mkdirSync(skillsDestDir, { recursive: true });
    }
    for (const skillName of FLOWIZE_SKILL_NAMES) {
      const src = path.join(OPENCODE_SKILLS_DIR, skillName, 'SKILL.md');
      const dest = path.join(skillsDestDir, `${skillName}.md`);
      try {
        if (existsSync(src)) {
          writeFileSync(dest, readFileSync(src, 'utf8'), 'utf8');
        }
      } catch {
        // non-fatal — skill copy failure should not block workspace setup
      }
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const copyWorktreeContextAction = ({ sourcePath, targetPath }) => {
  if (!sourcePath || !targetPath) {
    return { success: false, error: 'Missing sourcePath or targetPath' };
  }

  try {
    if (!existsSync(sourcePath) || !existsSync(targetPath)) {
      return { success: true, copied: [] };
    }

    const copied = [];
    for (const name of readdirSync(sourcePath)) {
      if (!name.startsWith('.env')) continue;
      const from = path.join(sourcePath, name);
      try {
        if (statSync(from).isFile()) {
          copyFileSync(from, path.join(targetPath, name));
          copied.push(name);
        }
      } catch {
        // ignore individual copy failures
      }
    }

    return { success: true, copied };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const ensureAgentWorkspaceAction = ({
  agentWorkspace,
  issueDescriptionFile,
  issueDescriptionContent,
  sourceSkillFile,
  skillFile,
  fallbackSkillContent,
  gitignorePath,
  gitignoreEntry,
  startHereContent,
  startHerePath
}) => {
  const prepared = prepareAgentWorkspace({
    agentWorkspace,
    issueDescriptionFile,
    issueDescriptionContent,
    sourceSkillFile,
    skillFile,
    fallbackSkillContent
  });

  if (!prepared.success) {
    return prepared;
  }

  try {
    if (gitignorePath && gitignoreEntry) {
      let content = '';
      try {
        content = readFileSync(gitignorePath, 'utf8');
      } catch {
        content = '';
      }
      const lines = content.split('\n');
      if (!lines.some((line) => line.trim() === gitignoreEntry)) {
        if (content && !content.endsWith('\n')) content += '\n';
        content += `${gitignoreEntry}\n`;
        writeFileSync(gitignorePath, content, 'utf8');
      }
    }

    if (startHereContent && startHerePath) {
      writeFileSync(startHerePath, startHereContent, 'utf8');
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const ensureDirectoryAction = ({ targetPath, basePath }) => {
  if (!targetPath) {
    return { success: false, error: 'Missing targetPath' };
  }

  if (basePath && !existsSync(basePath)) {
    return {
      success: false,
      error: `Worktree base path does not exist: ${basePath}`
    };
  }

  try {
    mkdirSync(targetPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const createAgentSessionRecord = ({ sessionId, jobId, command, worktreePath, issueNumber, branch, title }) => {
  const now = Date.now();
  const record = {
    sessionId,
    jobId,
    command,
    worktreePath,
    issueNumber,
    branch,
    title,
    status: 'running',
    createdAt: now,
    updatedAt: now
  };
  agentSessions.set(sessionId, record);
  persistAgentSessions();
  return record;
};

const syncAgentSessionFromJob = (sessionId, jobId) => {
  const session = agentSessions.get(sessionId);
  const job = jobs.get(jobId);
  if (!session || !job) {
    return null;
  }

  session.updatedAt = job.updatedAt || Date.now();
  session.status = job.done
    ? (job.success ? 'completed' : (job.exitCode === 130 ? 'cancelled' : 'failed'))
    : 'running';
  persistAgentSessions();

  return {
    ...session,
    done: job.done,
    success: job.success,
    exitCode: job.exitCode,
    stdout: job.stdout,
    stderr: job.stderr,
    error: job.error,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    pid: typeof job.child?.pid === 'number' ? job.child.pid : null
  };
};

const startAsyncJob = async (command, worktreePath) => {
  const jobId = randomUUID();
  const cwd = worktreePath || WORKDIR;
  const job = {
    id: jobId,
    command,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    done: false,
    success: false,
    exitCode: null,
    stdout: '',
    stderr: '',
    error: '',
    child: null,
    worktreePath: cwd
  };

  persistJobState(job);
  log.info(`[job:${jobId}] start - command="${command}" cwd="${cwd}"`);

  const finalizeFromExitCode = (code) => {
    if (job.done && (job.exitCode === 124 || job.exitCode === 130)) {
      job.child = null;
      job.updatedAt = Date.now();
      persistJobState(job);
      return;
    }
    const exitCode = typeof code === 'number' ? code : 1;
    job.done = true;
    job.exitCode = exitCode;
    job.success = exitCode === 0;
    if (!job.success && !job.error) {
      job.error = `Command failed with exit code ${exitCode}`;
    }
    job.updatedAt = Date.now();
    job.child = null;
    persistJobState(job);
    log.info(`[job:${jobId}] done - exitCode=${exitCode} success=${job.success}${job.error ? ` error="${job.error}"` : ''}`);
  };

  const child = spawn(command, {
    cwd,
    shell: true,
    windowsHide: true,
    env: process.env
  });
  job.child = child;
  job.pid = typeof child.pid === 'number' ? child.pid : null;
  persistJobState(job);
  log.debug(`[job:${jobId}] spawned shell pid=${child.pid}`);

  // On Windows, shell:true spawns cmd.exe first; the real agent process is a
  // grandchild.  Capture its PID shortly after spawn so /cancel can target it
  // directly instead of only relying on the tree-walk.
  if (process.platform === 'win32' && typeof child.pid === 'number') {
    const shellPid = child.pid;
    setTimeout(() => {
      if (job.done || job.innerPid) return; // already resolved or job finished
      const psScript = [
        `$ProgressPreference = 'SilentlyContinue'`,
        `$p = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId`,
        `$kids = $p | Where-Object { $_.ParentProcessId -eq ${shellPid} }`,
        `$kids | Select-Object -ExpandProperty ProcessId`
      ].join('; ');
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, (err, stdout) => {
        if (err || !stdout) return;
        const pids = stdout.trim().split(/\r?\n/).map(Number).filter(n => Number.isFinite(n) && n > 0);
        log.debug(`[job:${jobId}] inner pid candidates under shell ${shellPid}: [${pids.join(', ')}]`);
        if (pids.length > 0) {
          job.innerPid = pids[0]; // first direct child of the shell is the real process
          persistJobState(job);
          log.debug(`[job:${jobId}] inner pid resolved: ${job.innerPid}`);
        }
      });
    }, 1500); // give the shell 1.5 s to launch the real child
  }


  child.stdout?.on('data', (chunk) => {
    job.stdout += stripAnsi(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    job.updatedAt = Date.now();
    persistJobState(job);
  });

  child.stderr?.on('data', (chunk) => {
    job.stderr += stripAnsi(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    job.updatedAt = Date.now();
    persistJobState(job);
  });

  child.on('error', (error) => {
    log.error(`[job:${jobId}] spawn error:`, error.message);
    job.done = true;
    job.success = false;
    job.exitCode = 1;
    job.error = error.message;
    job.updatedAt = Date.now();
    persistJobState(job);
  });

  child.on('close', (code) => {
    finalizeFromExitCode(code);
  });

  setTimeout(() => {
    if (job.done) {
      return;
    }
    log.warn(`[job:${jobId}] timed out after ${JOB_MAX_RUNTIME_MS}ms - killing shellPid=${job.pid ?? 'none'} innerPid=${job.innerPid ?? 'none'}`);
    if (typeof job.innerPid === 'number' && job.innerPid !== job.pid) {
      killByPid(job.innerPid);
    }
    killByPid(job.pid);
    killProcessTree(job.pid, cwd);
    try {
      job.child?.kill('SIGTERM');
    } catch {
      // ignored
    }
    job.done = true;
    job.success = false;
    job.exitCode = 124;
    job.error = `Command timed out after ${JOB_MAX_RUNTIME_MS}ms`;
    job.updatedAt = Date.now();
    job.child = null;
    persistJobState(job);
  }, JOB_MAX_RUNTIME_MS);

  return { jobId };
};

const getQueryParam = (urlValue, key) => {
  try {
    const parsed = new URL(urlValue, 'http://localhost');
    return parsed.searchParams.get(key) || '';
  } catch {
    return '';
  }
};

const parseJson = (req) => {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
};

const runShellCommand = (command, worktreePath) => {
  return new Promise((resolve) => {
    exec(command, {
      cwd: worktreePath || WORKDIR,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      timeout: SYNC_MAX_RUNTIME_MS
    }, (error, stdout, stderr) => {
      const exitCode = typeof error?.code === 'number' ? error.code : 0;
      resolve({
        success: exitCode === 0,
        exitCode,
        stdout: stdout || '',
        stderr: stderr || '',
        error: exitCode === 0 ? '' : (error?.message || 'Command failed')
      });
    });
  });
};

server = createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const reqId = randomUUID().slice(0, 8);
  log.info(`${req.method} ${req.url} origin=${origin || '(none)'} id=${reqId}`);

  cleanupExpiredJobs();
  cleanupExpiredOAuthStates();

  if (req.method === 'OPTIONS') {
    log.debug(`[${reqId}] CORS preflight`);
    writeJson(res, 200, { ok: true }, origin);
    return;
  }

  if (!isAuthExemptRoute(req) && !isAuthorized(req)) {
    log.warn(`[${reqId}] 401 - unauthorized request to ${req.url}`);
    writeCorsError(res, 401, { success: false, error: 'Unauthorized bridge request' }, origin);
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    log.debug(`[${reqId}] health check`);
    writeJson(res, 200, {
      ok: true,
      authRequired: isAuthRequired(),
      asyncJobs: true,
      persistence: true,
      dataDir: BRIDGE_DATA_DIR,
      metrics: getBridgeMetrics(),
      diagnostics: getBridgeDiagnostics(),
      typedActions: ['flowize-run-agent', 'flowize-agent-session', 'flowize-create-worktree', 'flowize-copy-worktree-context', 'flowize-ensure-agent-workspace', 'flowize-ensure-directory', 'flowize-cleanup-worktree', 'flowize-push-worktree-branch', 'open-windows-cmd'],
      maxRuntimeMs: JOB_MAX_RUNTIME_MS
    }, origin);
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/agent-session')) {
    const sessionId = getQueryParam(req.url, 'sessionId');
    if (!sessionId) {
      // No sessionId → return all sessions as a list
      log.info(`[${reqId}] agent-session list - total=${agentSessions.size} sessionsFile=${SESSIONS_STATE_FILE}`);
      for (const [id, s] of agentSessions.entries()) {
        log.info(`[${reqId}]   session id=${id} status=${s.status} jobId=${s.jobId} branch=${s.branch || '(none)'}`);
      }
      const sessions = Array.from(agentSessions.entries()).map(([id, session]) => {
        const synced = syncAgentSessionFromJob(id, session.jobId) || session;
        log.info(`[${reqId}]   synced id=${id} status=${synced.status} done=${synced.done}`);
        return synced;
      });
      writeJson(res, 200, { success: true, sessions }, origin);
      return;
    }

    const session = agentSessions.get(sessionId);
    if (!session) {
      log.warn(`[${reqId}] agent-session get - sessionId=${sessionId} not found, total=${agentSessions.size}`);
      writeJson(res, 404, { success: false, error: 'Session not found' }, origin);
      return;
    }

    const payload = syncAgentSessionFromJob(sessionId, session.jobId) || session;
    writeJson(res, 200, { success: true, ...payload }, origin);
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/github/oauth/start')) {
    log.info(`[${reqId}] oauth/start - client_id=${GITHUB_OAUTH_CLIENT_ID || '(missing)'}`);

    if (!GITHUB_OAUTH_CLIENT_ID || !GITHUB_OAUTH_CLIENT_SECRET) {
      log.error(`[${reqId}] oauth/start - GITHUB_OAUTH_CLIENT_ID or GITHUB_OAUTH_CLIENT_SECRET not set`);
      writeJson(res, 503, {
        success: false,
        error: 'GitHub OAuth is not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET.'
      }, origin);
      return;
    }

    const requestedOrigin = getQueryParam(req.url, 'origin') || origin || '*';
    const state = randomUUID().replace(/-/g, '');
    oauthStates.set(state, {
      origin: requestedOrigin,
      createdAt: Date.now()
    });

    const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
    authorizeUrl.searchParams.set('client_id', GITHUB_OAUTH_CLIENT_ID);
    authorizeUrl.searchParams.set('redirect_uri', GITHUB_OAUTH_REDIRECT_URI);
    authorizeUrl.searchParams.set('scope', GITHUB_OAUTH_SCOPE);
    authorizeUrl.searchParams.set('state', state);

    log.info(`[${reqId}] oauth/start - state=${state} requestedOrigin=${requestedOrigin} redirect_uri=${GITHUB_OAUTH_REDIRECT_URI}`);

    writeJson(res, 200, {
      success: true,
      authorizeUrl: authorizeUrl.toString(),
      redirectUri: GITHUB_OAUTH_REDIRECT_URI
    }, origin);
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/github/oauth/callback')) {
    const code = getQueryParam(req.url, 'code');
    const state = getQueryParam(req.url, 'state');

    log.info(`[${reqId}] oauth/callback - code=${code ? '(present)' : '(missing)'} state=${state || '(missing)'}`);

    if (!code || !state) {
      log.warn(`[${reqId}] oauth/callback - missing code or state`);
      writeHtml(res, 400, oauthMessagePage({
        success: false,
        origin: '*',
        error: 'Missing GitHub OAuth code or state.'
      }));
      return;
    }

    const stateEntry = oauthStates.get(state);
    oauthStates.delete(state);

    if (!stateEntry) {
      log.warn(`[${reqId}] oauth/callback - unknown or expired state=${state} (active states: ${oauthStates.size})`);
      writeHtml(res, 400, oauthMessagePage({
        success: false,
        origin: '*',
        error: 'Invalid or expired OAuth state. Please retry login.'
      }));
      return;
    }

    log.info(`[${reqId}] oauth/callback - valid state, postMessage target origin=${stateEntry.origin}`);

    try {
      log.debug(`[${reqId}] oauth/callback - exchanging code for token with GitHub`);
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: GITHUB_OAUTH_CLIENT_ID,
          client_secret: GITHUB_OAUTH_CLIENT_SECRET,
          code,
          redirect_uri: GITHUB_OAUTH_REDIRECT_URI
        })
      });

      const tokenPayload = await tokenResponse.json();
      log.debug(`[${reqId}] oauth/callback - GitHub token response status=${tokenResponse.status} has_access_token=${Boolean(tokenPayload.access_token)} error=${tokenPayload.error || '(none)'}`);

      if (!tokenResponse.ok || tokenPayload.error || !tokenPayload.access_token) {
        throw new Error(tokenPayload.error_description || tokenPayload.error || 'Could not exchange OAuth code for access token.');
      }

      log.info(`[${reqId}] oauth/callback - success, scope=${tokenPayload.scope || '(empty)'} posting token to origin=${stateEntry.origin}`);
      writeHtml(res, 200, oauthMessagePage({
        success: true,
        origin: stateEntry.origin,
        token: tokenPayload.access_token,
        scope: tokenPayload.scope || ''
      }));
    } catch (error) {
      log.error(`[${reqId}] oauth/callback - token exchange failed:`, error.message);
      writeHtml(res, 500, oauthMessagePage({
        success: false,
        origin: stateEntry.origin,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/logs')) {
    const jobId = getQueryParam(req.url, 'jobId');
    if (!jobId) {
      log.warn(`[${reqId}] /logs - missing jobId`);
      writeJson(res, 400, { success: false, error: 'Missing jobId' }, origin);
      return;
    }

    const job = jobs.get(jobId);
    if (!job) {
      log.warn(`[${reqId}] /logs - job not found: ${jobId}`);
      writeJson(res, 404, { success: false, error: 'Job not found' }, origin);
      return;
    }

    log.debug(`[${reqId}] /logs - jobId=${jobId} done=${job.done} exitCode=${job.exitCode}`);
    writeJson(res, 200, {
      success: job.success,
      done: job.done,
      exitCode: job.exitCode,
      stdout: job.stdout,
      stderr: job.stderr,
      error: job.error,
      pid: typeof job.child?.pid === 'number' ? job.child.pid : null,
      command: job.command,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt
    }, origin);
    return;
  }

  if (req.method === 'POST' && req.url === '/cancel') {
    try {
      const body = await parseJson(req);
      const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
      if (!jobId) {
        log.warn(`[${reqId}] /cancel - missing jobId`);
        writeJson(res, 400, { success: false, error: 'Missing jobId' }, origin);
        return;
      }

      const job = jobs.get(jobId);
      if (!job) {
        log.warn(`[${reqId}] /cancel - job not found: ${jobId}`);
        writeJson(res, 404, { success: false, error: 'Job not found' }, origin);
        return;
      }

      if (job.done) {
        log.debug(`[${reqId}] /cancel - job ${jobId} already done`);
        writeJson(res, 200, { success: true, done: true, alreadyDone: true }, origin);
        return;
      }

      const shellPid = typeof job.child?.pid === 'number' ? job.child.pid : job.pid;
      const innerPid = typeof job.innerPid === 'number' ? job.innerPid : null;
      log.debug(`[${reqId}] /cancel - pid candidates: shell=${shellPid ?? 'none'} inner=${innerPid ?? 'none'} child.pid=${job.child?.pid ?? 'none'} job.pid=${job.pid ?? 'none'} worktree="${job.worktreePath}"`);
      const pid = innerPid ?? shellPid;
      log.info(`[${reqId}] /cancel - killing job ${jobId} pid=${pid ?? 'none'} shellPid=${shellPid ?? 'none'} innerPid=${innerPid ?? 'none'} worktree="${job.worktreePath}"`);
      try {
        job.child?.kill('SIGTERM');
      } catch {
        // ignored
      }
      // Kill the inner (real agent) pid first if known, then the shell pid,
      // then walk the full process tree to catch any surviving children.
      if (innerPid && innerPid !== shellPid) {
        killByPid(innerPid);
      }
      killByPid(shellPid);
      killProcessTree(shellPid, job.worktreePath);

      job.done = true;
      job.success = false;
      job.exitCode = 130;
      job.error = 'Job cancelled by user';
      job.updatedAt = Date.now();
      job.child = null;
      persistJobState(job);

      writeJson(res, 200, { success: true, done: true, cancelled: true }, origin);
      return;
    } catch (error) {
      log.error(`[${reqId}] /cancel - unexpected error:`, error.message);
      writeJson(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }, origin);
      return;
    }
  }

  if (req.method !== 'POST' || (req.url !== '/run' && req.url !== '/')) {
    log.warn(`[${reqId}] 404 - unrecognised route ${req.method} ${req.url}`);
    writeJson(res, 404, { success: false, error: 'Not found' }, origin);
    return;
  }

  try {
    const body = await parseJson(req);
    const action = typeof body.action === 'string' ? body.action.trim() : '';

    if (action === 'flowize-run-agent') {
      const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim()
        ? body.sessionId.trim()
        : randomUUID();
      const command = typeof body.command === 'string' ? body.command.trim() : '';
      const worktreePath = typeof body.worktreePath === 'string' ? body.worktreePath.trim() : '';
      const agentWorkspace = typeof body.agentWorkspace === 'string' ? body.agentWorkspace.trim() : '';
      const issueDescriptionFile = typeof body.issueDescriptionFile === 'string' ? body.issueDescriptionFile.trim() : '';
      const issueDescriptionContent = typeof body.issueDescriptionContent === 'string' ? body.issueDescriptionContent : '';
      const sourceSkillFile = typeof body.sourceSkillFile === 'string' ? body.sourceSkillFile.trim() : '';
      const skillFile = typeof body.skillFile === 'string' ? body.skillFile.trim() : '';
      const fallbackSkillContent = typeof body.fallbackSkillContent === 'string' ? body.fallbackSkillContent : '';
      const issueNumber = Number.isFinite(Number(body.issueNumber)) ? Number(body.issueNumber) : null;
      const branch = typeof body.branch === 'string' ? body.branch.trim() : '';
      const title = typeof body.title === 'string' ? body.title.trim() : '';

      if (!command || !worktreePath) {
        writeJson(res, 400, { success: false, error: 'Missing command or worktreePath' }, origin);
        return;
      }

      // Resume guard: if a session with this sessionId already exists and its job is
      // still running (or finished), return the existing job instead of spawning a new one.
      const existingSession = agentSessions.get(sessionId);
      if (existingSession) {
        const existingJob = jobs.get(existingSession.jobId);
        if (existingJob) {
          log.info(`[${reqId}] flowize-run-agent resuming existing session=${sessionId} jobId=${existingSession.jobId} done=${existingJob.done}`);
          const synced = syncAgentSessionFromJob(sessionId, existingSession.jobId) || existingSession;
          writeJson(res, 200, {
            success: true,
            sessionId,
            jobId: existingSession.jobId,
            done: existingJob.done,
            resumed: true,
            status: synced.status
          }, origin);
          return;
        }
        // Session exists but job was lost (e.g. bridge restart) — fall through to spawn a new job
        // and reassign it to the same sessionId.
        log.warn(`[${reqId}] flowize-run-agent session=${sessionId} exists but job=${existingSession.jobId} not found — respawning`);
      }

      const prepared = prepareAgentWorkspace({
        agentWorkspace,
        issueDescriptionFile,
        issueDescriptionContent,
        sourceSkillFile,
        skillFile,
        fallbackSkillContent
      });

      if (!prepared.success) {
        writeJson(res, 400, { success: false, error: prepared.error || 'Failed to prepare agent workspace' }, origin);
        return;
      }

      const created = await startAsyncJob(command, worktreePath);
      createAgentSessionRecord({
        sessionId,
        jobId: created.jobId,
        command,
        worktreePath,
        issueNumber,
        branch,
        title
      });

      writeJson(res, 202, {
        success: true,
        sessionId,
        jobId: created.jobId,
        done: false
      }, origin);
      return;
    }

    if (action === 'flowize-create-worktree') {
      const repoPath = typeof body.repoPath === 'string' ? body.repoPath.trim() : '';
      const targetPath = typeof body.targetPath === 'string' ? body.targetPath.trim() : '';
      const branchName = typeof body.branchName === 'string' ? body.branchName.trim() : '';
      const defaultBranch = typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : '';
      const result = await createWorktreeAction({ repoPath, targetPath, branchName, defaultBranch });
      writeJson(res, result.success ? 200 : 400, result, origin);
      return;
    }

    if (action === 'flowize-copy-worktree-context') {
      const sourcePath = typeof body.sourcePath === 'string' ? body.sourcePath.trim() : '';
      const targetPath = typeof body.targetPath === 'string' ? body.targetPath.trim() : '';
      const result = copyWorktreeContextAction({ sourcePath, targetPath });
      writeJson(res, result.success ? 200 : 400, result, origin);
      return;
    }

    if (action === 'flowize-ensure-agent-workspace') {
      const result = ensureAgentWorkspaceAction({
        agentWorkspace: typeof body.agentWorkspace === 'string' ? body.agentWorkspace.trim() : '',
        issueDescriptionFile: typeof body.issueDescriptionFile === 'string' ? body.issueDescriptionFile.trim() : '',
        issueDescriptionContent: typeof body.issueDescriptionContent === 'string' ? body.issueDescriptionContent : '',
        sourceSkillFile: typeof body.sourceSkillFile === 'string' ? body.sourceSkillFile.trim() : '',
        skillFile: typeof body.skillFile === 'string' ? body.skillFile.trim() : '',
        fallbackSkillContent: typeof body.fallbackSkillContent === 'string' ? body.fallbackSkillContent : '',
        gitignorePath: typeof body.gitignorePath === 'string' ? body.gitignorePath.trim() : '',
        gitignoreEntry: typeof body.gitignoreEntry === 'string' ? body.gitignoreEntry.trim() : '',
        startHereContent: typeof body.startHereContent === 'string' ? body.startHereContent : '',
        startHerePath: typeof body.startHerePath === 'string' ? body.startHerePath.trim() : ''
      });
      writeJson(res, result.success ? 200 : 400, result, origin);
      return;
    }

    if (action === 'flowize-ensure-directory') {
      const targetPath = typeof body.targetPath === 'string' ? body.targetPath.trim() : '';
      const basePath = typeof body.basePath === 'string' ? body.basePath.trim() : '';
      const result = ensureDirectoryAction({ targetPath, basePath });
      writeJson(res, result.success ? 200 : 400, result, origin);
      return;
    }

    if (action === 'flowize-cleanup-worktree') {
      const repoPath = typeof body.repoPath === 'string' ? body.repoPath.trim() : '';
      const targetPath = typeof body.targetPath === 'string' ? body.targetPath.trim() : '';
      const result = await cleanupWorktreeAction({ repoPath, targetPath });
      writeJson(res, result.success ? 200 : 400, result, origin);
      return;
    }

    if (action === 'flowize-push-worktree-branch') {
      const worktreePath = typeof body.worktreePath === 'string' ? body.worktreePath.trim() : '';
      const branchName = typeof body.branchName === 'string' ? body.branchName.trim() : '';
      const forceWithLease = body.forceWithLease === true;
      const result = await pushWorktreeBranchAction({ worktreePath, branchName, forceWithLease });
      writeJson(res, result.success ? 200 : 400, result, origin);
      return;
    }

    if (action === 'open-terminal' || action === 'open-windows-cmd' || action === 'flowize-open-windows-cmd') {
      const worktreePath = typeof body.worktreePath === 'string' ? body.worktreePath.trim() : '';
      const title = typeof body.title === 'string' ? body.title.trim() : 'Flowize Worktree';
      const startupCommand = typeof body.startupCommand === 'string' ? body.startupCommand.trim() : 'git status';
      const closeAfterStartup = body.closeAfterStartup === true;
      const launchAntigravity = body.launchAntigravity === true;
      const launchIntellij = body.launchIntellij === true;
      const ideaHome = typeof body.ideaHome === 'string' ? body.ideaHome.trim() : '';

      log.info(`[${reqId}] open-terminal - path="${worktreePath}" title="${title}" startup="${startupCommand}" close=${closeAfterStartup} antigravity=${launchAntigravity} intellij=${launchIntellij} ideaHome="${ideaHome}"`);

      try {
        const result = await openTerminal(worktreePath, title, startupCommand, closeAfterStartup, launchAntigravity, launchIntellij, ideaHome);
        log.info(`[${reqId}] open-terminal - result: success=${result.success}${result.error ? ` error="${result.error}"` : ''}`);
        writeJson(res, result.success ? 200 : 400, result, origin);
      } catch (error) {
        log.error(`[${reqId}] open-terminal - threw:`, error.message);
        writeJson(res, 500, {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }, origin);
      }
      return;
    }

    const command = typeof body.command === 'string' ? body.command.trim() : '';
    const worktreePath = typeof body.worktreePath === 'string' ? body.worktreePath.trim() : '';

    if (!command) {
      log.warn(`[${reqId}] /run - missing command`);
      writeJson(res, 400, { success: false, error: 'Missing command' }, origin);
      return;
    }

    if (body.async === true) {
      log.info(`[${reqId}] /run async - command="${command}" cwd="${worktreePath || WORKDIR}"`);
      const created = await startAsyncJob(command, worktreePath);
      log.info(`[${reqId}] /run async - jobId=${created.jobId}`);
      writeJson(res, 202, { success: true, jobId: created.jobId, done: false }, origin);
      return;
    }

    log.info(`[${reqId}] /run sync - command="${command}" cwd="${worktreePath || WORKDIR}"`);
    const result = await runShellCommand(command, worktreePath);
    log.info(`[${reqId}] /run sync - exitCode=${result.exitCode} success=${result.success}${result.error ? ` error="${result.error}"` : ''}`);
    if (result.stderr) log.debug(`[${reqId}] /run sync - stderr: ${result.stderr.slice(0, 500)}`);
    writeJson(res, result.success ? 200 : 500, result, origin);
  } catch (error) {
    log.error(`[${reqId}] /run - unexpected error:`, error.message);
    writeJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, origin);
  }
});

const startServer = () => {
  server.listen(PORT, HOST, () => {
    log.info(`listening on http://${HOST}:${PORT}/run`);
    log.info(`workdir=${WORKDIR}`);
    log.info(`data-dir=${BRIDGE_DATA_DIR}`);
    log.info(`allowed-origin=${ALLOWED_ORIGIN}`);
    log.info(`log-level=${LOG_LEVEL} (set BRIDGE_LOG_LEVEL=debug for verbose output)`);
    log.info(`job-ttl=${JOB_TTL_MS}ms  job-max-runtime=${JOB_MAX_RUNTIME_MS}ms  sync-max-runtime=${SYNC_MAX_RUNTIME_MS}ms`);
    if (GITHUB_OAUTH_CLIENT_ID && GITHUB_OAUTH_CLIENT_SECRET) {
      log.info(`github-oauth=enabled  client_id=${GITHUB_OAUTH_CLIENT_ID}  redirect=${GITHUB_OAUTH_REDIRECT_URI}  scope="${GITHUB_OAUTH_SCOPE}"`);
    } else {
      log.warn('github-oauth=disabled - set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET in .env.local');
    }
  });
};

ensureBridgeDataDir();
restorePersistedState();
watchEnvFile();
startServer();
