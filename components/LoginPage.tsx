import React, { useState, useEffect } from 'react';
import { Github, AlertCircle, Loader2, Key, AlertTriangle, CheckCircle, GitGraph } from 'lucide-react';
import { TYPOGRAPHY, TONE_STYLES, SPACING } from '../designSystem';
import { validateGithubToken } from '../services/githubService';
import { useAuth } from '../contexts/AuthContext';

interface LoginPageProps {
  onLoginSuccess: (token: string) => void | Promise<void>;
  bridgeEndpoint: string;
}

type AuthState = {
  status: 'idle' | 'connecting' | 'error';
  message: string;
};

type LoginMode = 'oauth' | 'manual';

const getBridgeBaseUrl = (endpoint: string): string => {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/run') ? trimmed.slice(0, -4) : trimmed;
};

const getBridgeCandidates = (endpoint: string): string[] => {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  const base = trimmed.endsWith('/run') ? trimmed.slice(0, -4) : trimmed;
  return [base + '/run', base];
};

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, bridgeEndpoint }) => {
  const { loginMode: savedLoginMode, setLoginMode } = useAuth();
  const [authState, setAuthState] = useState<AuthState>({ status: 'idle', message: '' });
  const [loginMode, setLoginModeState] = useState<LoginMode>(savedLoginMode || 'oauth');
  const [manualToken, setManualToken] = useState('');
  const [scopeWarning, setScopeWarning] = useState<string>('');

  // Update saved preference when mode changes
  useEffect(() => {
    setLoginMode(loginMode);
  }, [loginMode, setLoginMode]);

  const handleManualLogin = async () => {
    const token = manualToken.trim();
    if (!token) {
      setAuthState({
        status: 'error',
        message: 'Please enter a valid GitHub token.'
      });
      return;
    }

    setAuthState({ status: 'connecting', message: 'Validating token...' });
    setScopeWarning('');

    try {
      // Validate token and check scopes
      const validation = await validateGithubToken(token);

      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid token. Please check your GitHub Personal Access Token.');
      }

      // Check for scope issues
      if (!validation.hasRequiredScopes && validation.scopes.length > 0) {
        // Classic token without required scopes
        const missingScopesText = validation.missingScopes.join(', ');
        setScopeWarning(
          `Warning: Token is missing required scopes: ${missingScopesText}. Some features may not work correctly.`
        );
      }

      // Token is valid - log in
      await onLoginSuccess(token);
      setAuthState({ status: 'idle', message: '' });
    } catch (error) {
      setAuthState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to validate token'
      });
    }
  };

  const handleGithubLogin = async () => {
    const endpoint = bridgeEndpoint?.trim();
    if (!endpoint) {
      setAuthState({
        status: 'error',
        message: 'Bridge endpoint is not configured. Please check your settings.'
      });
      return;
    }

    const bridgeBase = getBridgeBaseUrl(endpoint);
    const endpointCandidates = getBridgeCandidates(endpoint)
      .map((candidate) => candidate.replace(/\/+$/, ''))
      .filter((value, index, arr) => arr.indexOf(value) === index);

    const oauthStartUrls = endpointCandidates
      .map((candidate) => (candidate.endsWith('/run') ? candidate.slice(0, -4) : candidate))
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .map((base) => `${base}/github/oauth/start?origin=${encodeURIComponent(window.location.origin)}`);

    const allowedBridgeOrigins = endpointCandidates
      .map((candidate) => (candidate.endsWith('/run') ? candidate.slice(0, -4) : candidate))
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .flatMap((base) => {
        try {
          const parsed = new URL(base);
          const origin = parsed.origin;
          if (origin.includes('127.0.0.1')) {
            return [origin, origin.replace('127.0.0.1', 'localhost')];
          }
          if (origin.includes('localhost')) {
            return [origin, origin.replace('localhost', '127.0.0.1')];
          }
          return [origin];
        } catch {
          return [];
        }
      })
      .filter((value, index, arr) => arr.indexOf(value) === index);

    let primaryBridgeOrigin = '';

    try {
      primaryBridgeOrigin = new URL(bridgeBase).origin;
    } catch {
      setAuthState({ status: 'error', message: 'Bridge endpoint is not a valid URL.' });
      return;
    }

    setAuthState({ status: 'connecting', message: 'Opening GitHub login window...' });

    try {
      let startPayload: { success?: boolean; authorizeUrl?: string; error?: string } | null = null;
      let lastError = '';

      for (const startUrl of oauthStartUrls) {
        try {
          const startResponse = await fetch(startUrl);
          const payload = await startResponse.json() as { success?: boolean; authorizeUrl?: string; error?: string };
          if (startResponse.ok && payload.authorizeUrl) {
            startPayload = payload;
            break;
          }
          lastError = payload.error || `HTTP ${startResponse.status} from ${startUrl}`;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }

      if (!startPayload?.authorizeUrl) {
        throw new Error(`${lastError || 'Failed to start GitHub OAuth flow.'} Tried: ${oauthStartUrls.join(', ')}. If you recently updated, restart the bridge.`);
      }

      const popup = window.open(startPayload.authorizeUrl, 'flowize-github-oauth', 'popup=yes,width=620,height=760');
      if (!popup) {
        throw new Error('Popup blocked. Allow popups for this site and try again.');
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error('GitHub login timed out. Please try again.'));
        }, 180000);

        const poll = window.setInterval(() => {
          if (popup.closed) {
            cleanup();
            reject(new Error('GitHub login window was closed before completing OAuth.'));
          }
        }, 500);

        const cleanup = () => {
          window.clearTimeout(timeout);
          window.clearInterval(poll);
          window.removeEventListener('message', onMessage);
        };

        const onMessage = async (event: MessageEvent) => {
          const trustedOrigins = allowedBridgeOrigins.length > 0 ? allowedBridgeOrigins : [primaryBridgeOrigin];
          if (!trustedOrigins.includes(event.origin)) return;
          const data = event.data as { source?: string; success?: boolean; token?: string; error?: string };
          if (!data || data.source !== 'flowize-github-oauth') return;

          cleanup();
          popup.close();

          if (!data.success || !data.token) {
            reject(new Error(data.error || 'GitHub OAuth failed.'));
            return;
          }

          await onLoginSuccess(data.token);
          resolve();
        };

        window.addEventListener('message', onMessage);
      });

      setAuthState({ status: 'idle', message: '' });
    } catch (error) {
      setAuthState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md">
        {/* Login Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 mb-4">
              <GitGraph className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className={TYPOGRAPHY.pageTitle}>Welcome to Flowize</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Sign in with GitHub to continue
            </p>
          </div>

          {/* Error Message */}
          {authState.status === 'error' && (
            <div className={`mb-6 p-4 rounded-xl border ${TONE_STYLES.error.border} ${TONE_STYLES.error.bg}`}>
              <div className="flex items-start gap-3">
                <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${TONE_STYLES.error.icon}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${TONE_STYLES.error.text}`}>
                    {authState.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Scope Warning */}
          {scopeWarning && (
            <div className="mb-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {scopeWarning}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Login Mode Tabs */}
          <div className="flex gap-2 mb-6 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setLoginModeState('oauth');
                setAuthState({ status: 'idle', message: '' });
                setScopeWarning('');
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${loginMode === 'oauth'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Github className="w-4 h-4" />
                <span>GitHub OAuth</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginModeState('manual');
                setAuthState({ status: 'idle', message: '' });
                setScopeWarning('');
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${loginMode === 'manual'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Key className="w-4 h-4" />
                <span>Manual Token</span>
              </div>
            </button>
          </div>

          {/* OAuth Login */}
          {loginMode === 'oauth' && (
            <>
              <button
                onClick={handleGithubLogin}
                disabled={authState.status === 'connecting'}
                className={`
                  w-full py-3 px-4 rounded-xl border text-base font-semibold
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
                  disabled:opacity-70 disabled:cursor-not-allowed
                  ${authState.status === 'connecting'
                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    : 'bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 border-slate-900 dark:border-slate-100 text-white dark:text-slate-900'
                  }
                `}
              >
                <div className="flex items-center justify-center gap-3">
                  {authState.status === 'connecting' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Github className="w-5 h-5" />
                      <span>Continue with GitHub</span>
                    </>
                  )}
                </div>
              </button>

              {/* OAuth Info */}
              {authState.status === 'connecting' && authState.message && (
                <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
                  {authState.message}
                </p>
              )}

              <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <strong>Note:</strong> OAuth requires the bridge server to be running at {bridgeEndpoint || 'http://127.0.0.1:4141'}
                </p>
              </div>
            </>
          )}

          {/* Manual Token Login */}
          {loginMode === 'manual' && (
            <>
              <div className="space-y-3">
                <div>
                  <label htmlFor="github-token" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    GitHub Personal Access Token
                  </label>
                  <input
                    id="github-token"
                    type="password"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleManualLogin();
                      }
                    }}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={authState.status === 'connecting'}
                  />
                </div>

                <button
                  onClick={handleManualLogin}
                  disabled={authState.status === 'connecting' || !manualToken.trim()}
                  className={`
                    w-full py-3 px-4 rounded-xl border text-base font-semibold
                    transition-all duration-200
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${authState.status === 'connecting'
                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-600 text-white'
                    }
                  `}
                >
                  <div className="flex items-center justify-center gap-3">
                    {authState.status === 'connecting' ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Validating...</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-5 h-5" />
                        <span>Sign In with Token</span>
                      </>
                    )}
                  </div>
                </button>
              </div>

              {/* Manual Token Info */}
              <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-2">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <strong>Create a token at:</strong>{' '}
                  <a
                    href="https://github.com/settings/tokens/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-600 dark:hover:text-blue-200"
                  >
                    github.com/settings/tokens/new
                  </a>
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <strong>Required scopes:</strong> repo (Classic) or Contents + Pull Requests (Fine-grained)
                </p>
              </div>
            </>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <p className="text-center text-xs text-slate-500 dark:text-slate-500">
              {loginMode === 'oauth'
                ? 'By signing in, you agree to authenticate with GitHub OAuth'
                : 'Your token is stored locally and never sent to third parties'
              }
            </p>
          </div>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {loginMode === 'oauth'
              ? 'Need help? Make sure your bridge endpoint is configured and running.'
              : 'Use manual token to access features without running the bridge.'
            }
          </p>
        </div>
      </div>
    </div>
  );
};
