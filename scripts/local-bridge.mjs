import { createServer } from 'http';
import { exec, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';

const loadLocalEnvFile = () => {
  const envPath = '.env.local';
  if (!existsSync(envPath)) {
    return;
  }

  try {
    const content = readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
      const separatorIndex = withoutExport.indexOf('=');
      if (separatorIndex <= 0) continue;

      const key = withoutExport.slice(0, separatorIndex).trim();
      if (!key) continue;
      if (typeof process.env[key] === 'string' && process.env[key].length > 0) continue;

      let value = withoutExport.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch {
    // ignore malformed .env.local; explicit shell env vars still work
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
const GITHUB_OAUTH_CLIENT_ID = (process.env.GITHUB_OAUTH_CLIENT_ID || '').trim();
const GITHUB_OAUTH_CLIENT_SECRET = (process.env.GITHUB_OAUTH_CLIENT_SECRET || '').trim();
const GITHUB_OAUTH_SCOPE = (process.env.GITHUB_OAUTH_SCOPE || 'read:user repo').trim();
const GITHUB_OAUTH_CALLBACK_HOST = (process.env.GITHUB_OAUTH_CALLBACK_HOST || '127.0.0.1').trim();
const GITHUB_OAUTH_REDIRECT_URI = (process.env.GITHUB_OAUTH_REDIRECT_URI || `http://${GITHUB_OAUTH_CALLBACK_HOST}:${PORT}/github/oauth/callback`).trim();
const OAUTH_STATE_TTL_MS = Number(process.env.GITHUB_OAUTH_STATE_TTL_MS || 10 * 60 * 1000);

const jobs = new Map();
const oauthStates = new Map();

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
};

const writeHtml = (res, status, html) => {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(html);
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

const openWindowsCmd = async (
  worktreePath,
  title = 'Flowize Worktree',
  startupCommand = 'git status',
  closeAfterStartup = false,
  launchAntigravity = false
) => {
  if (process.platform !== 'win32') {
    return { success: false, error: 'open-windows-cmd is only supported on Windows' };
  }

  if (!worktreePath) {
    return { success: false, error: 'Missing worktreePath' };
  }
  const normalizedPath = /^[a-zA-Z]:\//.test(worktreePath)
    ? worktreePath.replace(/\//g, '\\')
    : worktreePath;

  if (!existsSync(normalizedPath) && !existsSync(worktreePath)) {
    return { success: false, error: `Worktree path does not exist: ${worktreePath}` };
  }

  const shell = process.env.ComSpec || 'cmd.exe';
  const escapedPath = normalizedPath.replace(/"/g, '');
  const escapedTitle = title
    .replace(/[\r\n]/g, ' ')
    .replace(/["&|<>^]/g, '')
    .trim() || 'Flowize Worktree';
  const bootCommand = typeof startupCommand === 'string' && startupCommand.trim().length > 0
    ? startupCommand.replace(/[\r\n]+/g, ' ').trim()
    : 'git status';

  if (launchAntigravity) {
    // Launch via cmd/start so Windows PATH command shims resolve reliably.
    const ideChild = spawn(shell, [
      '/d',
      '/c',
      'start',
      '""',
      '/B',
      '/D',
      escapedPath,
      'antigravity',
      '--new-window',
      '.'
    ], {
      cwd: escapedPath,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
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
        finish({ success: false, error: `Failed to launch Antigravity: ${error.message}` });
      });

      ideChild.once('close', (code) => {
        if (typeof code === 'number' && code !== 0) {
          finish({ success: false, error: `Failed to launch Antigravity (exit code ${code})` });
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

  // Use `start` so Windows launches a brand-new console window instead of
  // attaching to the bridge process session. Pass args as an array so cmd
  // parsing stays predictable across paths with spaces.
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

const startAsyncJob = async (command) => {
  const jobId = randomUUID();
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
  };

  const child = spawn(command, {
    cwd: WORKDIR,
    shell: true,
    windowsHide: true,
    env: process.env
  });
  job.child = child;

  child.stdout?.on('data', (chunk) => {
    job.stdout += String(chunk);
    job.updatedAt = Date.now();
  });

  child.stderr?.on('data', (chunk) => {
    job.stderr += String(chunk);
    job.updatedAt = Date.now();
  });

  child.on('error', (error) => {
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

const runShellCommand = (command) => {
  return new Promise((resolve) => {
    exec(command, {
      cwd: WORKDIR,
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

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  cleanupExpiredJobs();
  cleanupExpiredOAuthStates();

  if (req.method === 'OPTIONS') {
    writeJson(res, 200, { ok: true }, origin);
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    writeJson(res, 200, {
      ok: true,
      asyncJobs: true,
      maxRuntimeMs: JOB_MAX_RUNTIME_MS
    }, origin);
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/github/oauth/start')) {
    if (!GITHUB_OAUTH_CLIENT_ID || !GITHUB_OAUTH_CLIENT_SECRET) {
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

    if (!code || !state) {
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
      writeHtml(res, 400, oauthMessagePage({
        success: false,
        origin: '*',
        error: 'Invalid or expired OAuth state. Please retry login.'
      }));
      return;
    }

    try {
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
      if (!tokenResponse.ok || tokenPayload.error || !tokenPayload.access_token) {
        throw new Error(tokenPayload.error_description || tokenPayload.error || 'Could not exchange OAuth code for access token.');
      }

      writeHtml(res, 200, oauthMessagePage({
        success: true,
        origin: stateEntry.origin,
        token: tokenPayload.access_token,
        scope: tokenPayload.scope || ''
      }));
    } catch (error) {
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
      writeJson(res, 400, { success: false, error: 'Missing jobId' }, origin);
      return;
    }

    const job = jobs.get(jobId);
    if (!job) {
      writeJson(res, 404, { success: false, error: 'Job not found' }, origin);
      return;
    }

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
        writeJson(res, 400, { success: false, error: 'Missing jobId' }, origin);
        return;
      }

      const job = jobs.get(jobId);
      if (!job) {
        writeJson(res, 404, { success: false, error: 'Job not found' }, origin);
        return;
      }

      if (job.done) {
        writeJson(res, 200, { success: true, done: true, alreadyDone: true }, origin);
        return;
      }

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
      writeJson(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }, origin);
      return;
    }
  }

  if (req.method !== 'POST' || (req.url !== '/run' && req.url !== '/')) {
    writeJson(res, 404, { success: false, error: 'Not found' }, origin);
    return;
  }

  try {
    const body = await parseJson(req);
    const action = typeof body.action === 'string' ? body.action.trim() : '';

    if (action === 'open-windows-cmd') {
      const worktreePath = typeof body.worktreePath === 'string' ? body.worktreePath.trim() : '';
      const title = typeof body.title === 'string' ? body.title.trim() : 'Flowize Worktree';
      const startupCommand = typeof body.startupCommand === 'string' ? body.startupCommand.trim() : 'git status';
      const closeAfterStartup = body.closeAfterStartup === true;
      const launchAntigravity = body.launchAntigravity === true;

      try {
        const result = await openWindowsCmd(worktreePath, title, startupCommand, closeAfterStartup, launchAntigravity);
        writeJson(res, result.success ? 200 : 400, result, origin);
      } catch (error) {
        writeJson(res, 500, {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }, origin);
      }
      return;
    }

    const command = typeof body.command === 'string' ? body.command.trim() : '';

    if (!command) {
      writeJson(res, 400, { success: false, error: 'Missing command' }, origin);
      return;
    }

    if (body.async === true) {
      const created = await startAsyncJob(command);
      writeJson(res, 202, { success: true, jobId: created.jobId, done: false }, origin);
      return;
    }

    const result = await runShellCommand(command);
    writeJson(res, result.success ? 200 : 500, result, origin);
  } catch (error) {
    writeJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[flowize-bridge] listening on http://${HOST}:${PORT}/run`);
  console.log(`[flowize-bridge] workdir=${WORKDIR}`);
  console.log(`[flowize-bridge] allowed-origin=${ALLOWED_ORIGIN}`);
  console.log('[flowize-bridge] async-mode=spawn-only');
  if (GITHUB_OAUTH_CLIENT_ID && GITHUB_OAUTH_CLIENT_SECRET) {
    console.log(`[flowize-bridge] github-oauth=enabled redirect=${GITHUB_OAUTH_REDIRECT_URI}`);
  } else {
    console.log('[flowize-bridge] github-oauth=disabled (set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET)');
  }
});
