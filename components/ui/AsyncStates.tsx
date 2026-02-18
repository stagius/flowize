import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type LoadingSkeletonProps = {
  rows?: number;
  className?: string;
};

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ rows = 3, className = '' }) => {
  return (
    <div className={`space-y-3 ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="animate-pulse rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <div className="h-3.5 w-2/3 rounded bg-slate-800" />
          <div className="mt-3 h-3 w-full rounded bg-slate-800/80" />
          <div className="mt-2 h-3 w-4/5 rounded bg-slate-800/60" />
        </div>
      ))}
    </div>
  );
};

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void | Promise<void>;
  retryLabel?: string;
  compact?: boolean;
};

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try Again',
  compact = false
}) => {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-red-500/30 bg-red-500/10 text-red-100 ${compact ? 'p-3' : 'p-4'}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 shrink-0 ${compact ? 'h-4 w-4' : 'h-5 w-5'}`} />
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${compact ? 'text-sm' : 'text-base'}`}>{title}</p>
          <p className={`mt-1 text-red-100/85 ${compact ? 'text-xs' : 'text-sm'}`}>{message}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={() => {
              void onRetry();
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-red-300/30 bg-red-600/20 px-2.5 py-1.5 text-xs font-medium text-red-50 transition-colors hover:bg-red-600/30"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
};
