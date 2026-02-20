import React from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, Check } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string | null;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    errorId: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught an error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    (this as any).setState({
      errorInfo
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.location.href = '/';
  };

  private handleCopyError = (): void => {
    const { error, errorInfo } = (this as any).state;
    const errorText = [
      `Error: ${error?.message || 'Unknown error'}`,
      `Stack: ${error?.stack || 'No stack trace'}`,
      `Component Stack: ${errorInfo?.componentStack || 'No component stack'}`,
      `URL: ${window.location.href}`,
      `Timestamp: ${new Date().toISOString()}`
    ].join('\n\n');

    navigator.clipboard.writeText(errorText).then(() => {
      (this as any).setState({ copied: true });
      setTimeout(() => {
        (this as any).setState({ copied: false });
      }, 2000);
    }).catch(() => {
      console.log('Failed to copy to clipboard');
    });
  };

  public render(): React.ReactNode {
    const { hasError, error, errorInfo, errorId, copied } = (this as any).state;
    const { children, fallback } = (this as any).props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
              <div className="bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20 p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-red-100 dark:bg-red-500/20 rounded-xl">
                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1">
                    <h1 className="text-xl font-bold text-red-800 dark:text-red-200 mb-1">
                      Something went wrong
                    </h1>
                    <p className="text-sm text-red-600 dark:text-red-300">
                      Flowize encountered an unexpected error. Your data has been saved.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-slate-100 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    Error Message
                  </p>
                  <p className="text-sm font-mono text-red-600 dark:text-red-400 break-all">
                    {error?.message || 'Unknown error'}
                  </p>
                </div>

                {error?.stack && (
                  <details className="bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <summary className="p-4 cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100">
                      View technical details
                    </summary>
                    <div className="px-4 pb-4">
                      <pre className="text-xs font-mono text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
                        {error.stack}
                        {errorInfo?.componentStack && (
                          <>
                            {'\n\n--- Component Stack ---\n'}
                            {errorInfo.componentStack}
                          </>
                        )}
                      </pre>
                    </div>
                  </details>
                )}

                {errorId && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Error ID: <code className="font-mono">{errorId}</code>
                  </p>
                )}
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={this.handleReload}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload App
                </button>
                <button
                  onClick={this.handleGoHome}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-lg transition-colors border border-slate-300 dark:border-slate-700"
                >
                  <Home className="w-4 h-4" />
                  Go to Start
                </button>
                <button
                  onClick={this.handleCopyError}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 font-medium rounded-lg transition-colors border ${
                    copied 
                      ? 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700'
                      : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                  }`}
                  title={copied ? "Copied!" : "Copy error details"}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Bug className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4">
              If this problem persists, try clearing your browser data or contact support.
            </p>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
