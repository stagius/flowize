import React, { useState } from 'react';
import { TaskItem, TaskStatus } from '../types';
import { GitPullRequest, CheckCircle2, FileCode, ExternalLink, GitCommit, Loader2, RefreshCw, Server } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from './ui/AsyncStates';

interface Props {
  tasks: TaskItem[];
  onApprovePR: (taskId: string) => Promise<void>;
  onRequestChanges: (taskId: string, feedback: string) => void;
  onCheckStatus: () => Promise<void>;
  bridgeHealth?: { status: 'checking' | 'healthy' | 'unhealthy'; endpoint?: string };
}

export const Step5_Review: React.FC<Props> = ({ tasks, onApprovePR, onRequestChanges, onCheckStatus, bridgeHealth }) => {
  const pendingReview = tasks.filter(t => t.status === TaskStatus.IMPLEMENTED || t.status === TaskStatus.PUSHED);
  const activePRs = tasks.filter(t => t.status === TaskStatus.PR_CREATED || t.status === TaskStatus.PR_MERGED);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [isChecking, setIsChecking] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setReviewError(null);
    setLoadingId(id);
    try {
      await onApprovePR(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReviewError(message);
    } finally {
      setLoadingId(null);
    }
  };

  const handleCheckStatus = async () => {
    setReviewError(null);
    setIsChecking(true);
    try {
      await onCheckStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReviewError(message);
    } finally {
      setIsChecking(false);
    }
  };

  const handleRequestChanges = (id: string) => {
    setRequestingId(id);
    try {
      const note = (reviewNotes[id] || '').trim();
      onRequestChanges(id, note);
      setReviewNotes(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">

      {reviewError && (
        <div className="lg:col-span-2">
          <ErrorState
            title="Review action failed"
            message={reviewError}
            onRetry={handleCheckStatus}
            retryLabel="Retry Status Check"
            compact
          />
        </div>
      )}

      {/* Pending Reviews */}
      <div className="flex flex-col h-full bg-white dark:bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-teal-50 dark:bg-teal-500/5">
          <h3 className="font-bold text-teal-700 dark:text-teal-400 flex items-center gap-2">
            <FileCode className="w-5 h-5 text-teal-600 dark:text-teal-400" /> Code Review ({pendingReview.length})
            {/* Bridge Required Notice */}
            <span className={`px-2 py-0.5 rounded inline-flex items-center gap-1 ${bridgeHealth?.status === 'healthy'
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30'
              : bridgeHealth?.status === 'unhealthy'
                ? 'bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-800/30'
                : 'bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200/50 dark:border-yellow-800/30'
              }`}>
              <Server className={`w-3 h-3 flex-shrink-0 ${bridgeHealth?.status === 'healthy'
                ? 'text-emerald-600 dark:text-emerald-400'
                : bridgeHealth?.status === 'unhealthy'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-yellow-600 dark:text-yellow-400'
                }`} />
              {bridgeHealth?.status === 'healthy' && (
                <span className={`text-[10px] text-emerald-700 dark:text-emerald-300`}>Bridge active</span>
              )}

              {bridgeHealth?.status === 'unhealthy' && (
                <span className={`text-[10px] text-red-700 dark:text-red-300`}>Bridge required</span>
              )}

              {bridgeHealth?.status !== 'healthy' && bridgeHealth?.status !== 'unhealthy' && (
                <span className={`text-[10px] text-yellow-700 dark:text-yellow-300`}>Bridge required</span>
              )}
            </span>
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {pendingReview.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-600 gap-2">
              <CheckCircle2 className="w-10 h-10 opacity-20" />
              <p>No pending reviews.</p>
            </div>
          ) : (
            pendingReview.map(task => (
              <div key={task.id} className="border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-lg">
                <div className="bg-slate-100 dark:bg-slate-800 p-3 border-b border-slate-300 dark:border-slate-700 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <GitCommit className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <span className="font-semibold text-slate-900 dark:text-slate-200">{task.title}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-950 px-2 py-1 rounded border border-slate-300 dark:border-slate-800">
                    {task.branchName}
                  </span>
                </div>
                <div className="p-0 bg-slate-50 dark:bg-slate-950 max-h-64 overflow-y-auto custom-scrollbar">
                  <div className="flex border-b border-slate-200 dark:border-slate-800/50">
                    <div className="w-8 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-600 text-[10px] text-right pr-2 pt-2 select-none border-r border-slate-300 dark:border-slate-800">1<br />2<br />3<br />4</div>
                    <pre className="p-2 text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed flex-1">
                      {task.implementationDetails}
                    </pre>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex flex-col md:items-stretch gap-2.5">
                  <textarea
                    value={reviewNotes[task.id] || ''}
                    onChange={(e) => setReviewNotes(prev => ({ ...prev, [task.id]: e.target.value }))}
                    placeholder="Add feedback for requested changes (optional)"
                    className="w-full md:flex-1 min-h-[38px] max-h-24 resize-y rounded-lg border border-slate-300 dark:border-slate-700/80 bg-transparent px-3 py-2 text-xs leading-5 text-slate-900 dark:text-slate-200 placeholder:text-slate-600 dark:placeholder:text-slate-400 shadow-sm dark:shadow-inner dark:shadow-black/20 focus:outline-none focus:border-red-400 dark:focus:border-red-400/40 focus:ring-2 focus:ring-red-500/20"
                  />
                  <div className="flex items-center justify-end gap-2 md:shrink-0">
                    <button
                      onClick={() => handleRequestChanges(task.id)}
                      disabled={requestingId === task.id || loadingId === task.id}
                      className="h-11 px-3 rounded-lg border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20 hover:border-red-300 dark:hover:border-red-400/40 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {requestingId === task.id ? 'Requesting...' : 'Request Changes'}
                    </button>
                    <button
                      onClick={() => handleApprove(task.id)}
                      disabled={loadingId === task.id || requestingId === task.id}
                      className="h-11 bg-teal-600 hover:bg-teal-500 text-white px-4 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-[0_0_10px_rgba(20,184,166,0.2)] disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {loadingId === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitPullRequest className="w-3.5 h-3.5" />}
                      Approve code & Open PR
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Active PRs Status */}
      <div className="flex flex-col h-full bg-white dark:bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-blue-50 dark:bg-blue-500/5 flex justify-between items-center">
          <h3 className="font-bold text-blue-700 dark:text-blue-400 flex items-center gap-2">
            <GitPullRequest className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Open Pull Requests
          </h3>
          <button
            onClick={handleCheckStatus}
            disabled={isChecking}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Refresh CI Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {isChecking ? (
            <LoadingSkeleton rows={3} />
          ) : activePRs.filter(t => t.status === TaskStatus.PR_CREATED).length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-600 text-sm">
              No active PRs.
            </div>
          ) : (
            activePRs.filter(t => t.status === TaskStatus.PR_CREATED).map(task => (
              <div key={task.id} className="flex items-center justify-between p-4 border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/5 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/10 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-700 dark:text-blue-400 font-mono text-sm">#{task.prNumber}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-200">{task.title}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor] ${task.vercelStatus === 'success' ? 'bg-emerald-500 text-emerald-500' :
                        task.vercelStatus === 'failed' ? 'bg-red-500 text-red-500' :
                          'bg-yellow-500 text-yellow-500'
                        }`}></span>
                      CI: <span className="capitalize">{task.vercelStatus || 'Unknown'}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${task.vercelStatus === 'success' ? 'bg-slate-900 dark:bg-white' : 'bg-slate-500'
                        }`}></span>
                      Vercel: <span className="text-slate-700 dark:text-slate-300">{
                        task.vercelStatus === 'success' ? 'Deployed' :
                          task.vercelStatus === 'failed' ? 'Error' :
                            'Building...'
                      }</span>
                    </span>
                  </div>
                </div>
                <a href={task.issueUrl || '#'} target="_blank" className="p-2 text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 bg-slate-100 dark:bg-slate-950/50 rounded-lg border border-slate-300 dark:border-slate-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
