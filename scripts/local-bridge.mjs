import { createServer } from 'http';
import { exec, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync, watch } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const ALLOWED_ORIGIN = process.env.BRIDGE_ALLOWED_ORIGIN || '*';
const WORKDIR = process.env.BRIDGE_WORKDIR || process.cwd();
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

let server;

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
    'Access-Control-Allow-Headers': 'Content-Type,Access-Control-Request-Private-Network',
    'Access-Control-Allow-Private-Network': 'true',
    'Vary': 'Origin'
  });
  res.end(JSON.stringify(body));
  log.debug(`  -> ${status} JSON origin=${allowOrigin || '(none)'}`);
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
  for (const [jobId, job] of jobs.entries()) {
    if (!job.done) continue;
    if (now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(jobId);
    }
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
  launchIntellij = false
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
    return openWindowsTerminal(worktreePath, title, bootCommand, closeAfterStartup, launchAntigravity, launchIntellij);
  }

  if (process.platform === 'darwin') {
    return openMacOSTerminal(worktreePath, title, bootCommand, closeAfterStartup, launchAntigravity);
  }

  return openLinuxTerminal(worktreePath, title, bootCommand, closeAfterStartup, launchAntigravity);
};

const openWindowsTerminal = async (worktreePath, title, bootCommand, closeAfterStartup, launchAntigravity, launchIntellij) => {
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
    const ideaPath = 'Z:\\idea-git\\bin\\idea64.exe';
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
    child: null
  };

  jobs.set(jobId, job);
  log.info(`[job:${jobId}] start - command="${command}" cwd="${cwd}"`);

  const finalizeFromExitCode = (code) => {
    if (job.done && (job.exitCode === 124 || job.exitCode === 130)) {
      job.child = null;
      job.updatedAt = Date.now();
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
    log.info(`[job:${jobId}] done - exitCode=${exitCode} success=${job.success}${job.error ? ` error="${job.error}"` : ''}`);
  };

  const child = spawn(command, {
    cwd,
    shell: true,
    windowsHide: true,
    env: process.env
  });
  job.child = child;
  log.debug(`[job:${jobId}] spawned pid=${child.pid}`);

  child.stdout?.on('data', (chunk) => {
    job.stdout += String(chunk);
    job.updatedAt = Date.now();
  });

  child.stderr?.on('data', (chunk) => {
    job.stderr += String(chunk);
    job.updatedAt = Date.now();
  });

  child.on('error', (error) => {
    log.error(`[job:${jobId}] spawn error:`, error.message);
    job.done = true;
    job.success = false;
    job.exitCode = 1;
    job.error = error.message;
    job.updatedAt = Date.now();
  });

  child.on('close', (code) => {
    finalizeFromExitCode(code);
  });

  setTimeout(() => {
    if (job.done) {
      return;
    }
    log.warn(`[job:${jobId}] timed out after ${JOB_MAX_RUNTIME_MS}ms - killing`);
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

  if (req.method === 'GET' && req.url === '/health') {
    log.debug(`[${reqId}] health check`);
    writeJson(res, 200, {
      ok: true,
      asyncJobs: true,
      maxRuntimeMs: JOB_MAX_RUNTIME_MS
    }, origin);
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

      log.info(`[${reqId}] /cancel - killing job ${jobId} pid=${job.child?.pid}`);
      try {
        job.child?.kill('SIGTERM');
      } catch {
        // ignored
      }

      job.done = true;
      job.success = false;
      job.exitCode = 130;
      job.error = 'Job cancelled by user';
      job.updatedAt = Date.now();
      job.child = null;

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

    if (action === 'open-terminal' || action === 'open-windows-cmd' || action === 'flowize-open-windows-cmd') {
      const worktreePath = typeof body.worktreePath === 'string' ? body.worktreePath.trim() : '';
      const title = typeof body.title === 'string' ? body.title.trim() : 'Flowize Worktree';
      const startupCommand = typeof body.startupCommand === 'string' ? body.startupCommand.trim() : 'git status';
      const closeAfterStartup = body.closeAfterStartup === true;
      const launchAntigravity = body.launchAntigravity === true;
      const launchIntellij = body.launchIntellij === true;

      log.info(`[${reqId}] open-terminal - path="${worktreePath}" title="${title}" startup="${startupCommand}" close=${closeAfterStartup} antigravity=${launchAntigravity} intellij=${launchIntellij}`);

      try {
        const result = await openTerminal(worktreePath, title, startupCommand, closeAfterStartup, launchAntigravity, launchIntellij);
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

watchEnvFile();
startServer();
