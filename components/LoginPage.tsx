import React, { useState } from 'react';
import { Github, AlertCircle, Loader2 } from 'lucide-react';
import { TYPOGRAPHY, TONE_STYLES, SPACING } from '../designSystem';

interface LoginPageProps {
  onLoginSuccess: (token: string) => void;
  bridgeEndpoint: string;
}

type AuthState = {
  status: 'idle' | 'connecting' | 'error';
  message: string;
};

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
  const [authState, setAuthState] = useState<AuthState>({ status: 'idle', message: '' });

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

        const onMessage = (event: MessageEvent) => {
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

          onLoginSuccess(data.token);
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
              <Github className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
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

          {/* GitHub Login Button */}
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

          {/* Loading Status */}
          {authState.status === 'connecting' && authState.message && (
            <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
              {authState.message}
            </p>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <p className="text-center text-xs text-slate-500 dark:text-slate-500">
              By signing in, you agree to authenticate with GitHub OAuth
            </p>
          </div>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Need help? Make sure your bridge endpoint is configured and running.
          </p>
        </div>
      </div>
    </div>
  );
};
