import React, { useState } from 'react';
import { AppSettings, TaskItem, TaskStatus } from '../types';
import { GitMerge, CheckCircle, ExternalLink, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from './ui/AsyncStates';

interface Props {
  tasks: TaskItem[];
  onMerge: (taskId: string) => Promise<void>;
  onResolveConflict: (taskId: string) => Promise<void>;
  onFetchMerged: () => Promise<void>;
  settings?: AppSettings;
}

export const Step6_Merge: React.FC<Props> = ({ tasks, onMerge, onResolveConflict, onFetchMerged, settings }) => {
  const readyToMerge = tasks.filter(t => t.status === TaskStatus.PR_CREATED);
  const mergedHistory = tasks.filter(t => t.status === TaskStatus.PR_MERGED);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const buildPrUrl = (task: TaskItem): string | null => {
    if (task.issueUrl) return task.issueUrl;
    if (!task.prNumber || !settings?.repoOwner || !settings?.repoName) return null;
    return `https://github.com/${settings.repoOwner}/${settings.repoName}/pull/${task.prNumber}`;
  };

  const handleMergeClick = async (taskId: string) => {
      setMergeError(null);
      setMergingId(taskId);
      try {
        await onMerge(taskId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setMergeError(message);
      } finally {
        setMergingId(null);
      }
  };

  const handleResolveClick = async (taskId: string) => {
      setMergeError(null);
      setResolvingId(taskId);
      try {
        await onResolveConflict(taskId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setMergeError(message);
      } finally {
        setResolvingId(null);
      }
  };

  const handleFetch = async () => {
    setMergeError(null);
    setIsFetching(true);
    try {
      await onFetchMerged();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMergeError(message);
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      {mergeError && (
        <ErrorState
          title="Merge workflow failed"
          message={mergeError}
          onRetry={handleFetch}
          retryLabel="Retry Sync"
          compact
        />
      )}
      
      {/* Ready to Merge */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800 overflow-hidden flex-shrink-0">
         <div className="p-4 border-b border-slate-800 bg-green-500/5 flex justify-between items-center">
             <h3 className="font-bold text-green-400 flex items-center gap-2">
               <GitMerge className="w-5 h-5" /> Ready to Merge
             </h3>
             <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold px-2 py-1 rounded-full">
               {readyToMerge.length} Ready
             </span>
         </div>
         <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {readyToMerge.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-600">
                    No PRs ready for merge. Complete reviews first.
                </div>
            ) : (
                readyToMerge.map(task => (
                    <div key={task.id} className="border border-green-500/20 bg-green-500/5 rounded-xl p-5 flex flex-col justify-between h-48 hover:bg-green-500/10 transition-colors relative overflow-hidden group">
                         <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-green-500/20 to-transparent rounded-bl-full -mr-8 -mt-8 opacity-50"></div>
                             <div>
                              <div className="flex justify-between items-start mb-2">
                                  <span className="text-xs font-mono text-green-300/80">
                                      {buildPrUrl(task) ? (
                                        <a
                                          href={buildPrUrl(task) as string}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="hover:text-green-200 hover:underline inline-flex items-center gap-1"
                                        >
                                          PR #{task.prNumber} <ExternalLink className="w-3 h-3" />
                                        </a>
                                      ) : (
                                        <span>PR #{task.prNumber}</span>
                                      )}
                                  </span>
                                  <div className={`flex items-center gap-1 text-[10px] border px-1.5 py-0.5 rounded shadow-sm ${
                                      task.vercelStatus === 'success' 
                                         ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                        : task.vercelStatus === 'failed'
                                        ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                        : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                                 }`}>
                                     <span className={`w-1.5 h-1.5 rounded-full ${
                                         task.vercelStatus === 'success' ? 'bg-emerald-500' :
                                         task.vercelStatus === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                                     }`}></span> 
                                     {task.vercelStatus === 'success' ? 'Deployed' : task.vercelStatus === 'failed' ? 'Failed' : 'Building'}
                                 </div>
                             </div>
                              <h4 className="font-bold text-slate-100 mb-1 line-clamp-2">{task.title}</h4>
                              <p className="text-xs text-slate-400 line-clamp-2 mb-3">{task.description}</p>
                              {task.mergeConflict && (
                                <div className="mb-3 inline-flex items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-semibold text-orange-200">
                                  <AlertTriangle className="w-3 h-3" /> Merge conflict detected
                                </div>
                              )}
                          </div>
                          <button 
                              onClick={() => task.mergeConflict ? handleResolveClick(task.id) : handleMergeClick(task.id)}
                              disabled={mergingId === task.id || resolvingId === task.id}
                              className={`w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                                  mergingId === task.id || resolvingId === task.id
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  : task.mergeConflict
                                    ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/30'
                                    : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/30'
                              }`}
                          >
                              {mergingId === task.id || resolvingId === task.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> {resolvingId === task.id ? 'Opening Worktree...' : 'Merging...'}
                                  </>
                              ) : (
                                  <>
                                    {task.mergeConflict ? (
                                      <AlertTriangle className="w-3.5 h-3.5 text-orange-200" />
                                    ) : (
                                      task.vercelStatus !== 'success' && <AlertTriangle className="w-3.5 h-3.5 text-yellow-300" />
                                    )}
                                    {task.mergeConflict ? 'Resolve Conflict in Worktree' : 'Merge Pull Request'}
                                  </>
                              )}
                          </button>
                    </div>
                ))
            )}
         </div>
      </div>

      {/* Merged History */}
      <div className="flex-1 bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center">
             <h3 className="font-bold text-slate-300 flex items-center gap-2">
               <CheckCircle className="w-5 h-5 text-slate-500" /> Merged History
             </h3>
             <button 
                onClick={handleFetch}
                disabled={isFetching}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 border border-slate-700 shadow-sm"
             >
                <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                Sync PRs
             </button>
          </div>
          <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
              {isFetching && mergedHistory.length === 0 && (
                <div className="p-4">
                  <LoadingSkeleton rows={3} />
                </div>
              )}
              {!isFetching && (
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-950/50 text-slate-500 font-medium border-b border-slate-800">
                      <tr>
                          <th className="px-6 py-3">Task</th>
                          <th className="px-6 py-3">PR</th>
                          <th className="hidden xl:flex px-6 py-3">Group</th>
                          <th className="px-6 py-3 text-right">Status</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                      {mergedHistory.length === 0 ? (
                          <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-slate-600">
                                  No items merged yet.
                              </td>
                          </tr>
                      ) : (
                          mergedHistory.slice().reverse().map(task => {
                              const prUrl = buildPrUrl(task);
                              return (
                              <tr key={task.id} className="hover:bg-slate-800/30 transition-colors">
                                  <td className="px-6 py-3 font-medium text-slate-200">{task.title}</td>
                                  <td className="px-5 py-3 font-mono text-slate-500">
                                      {prUrl ? (
                                        <a 
                                            href={prUrl}
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="hover:text-blue-400 hover:underline flex items-center gap-1 transition-colors"
                                        >
                                            #{task.prNumber} <ExternalLink className="w-3 h-3" />
                                        </a>
                                      ) : (
                                        <span>#{task.prNumber}</span>
                                      )}
                                  </td>
                                  <td className="hidden xl:flex px-6 py-3">
                                      <span className="bg-slate-800/50 border border-slate-700 px-2 py-1 rounded-full text-xs text-slate-400">{task.group}</span>
                                  </td>
                                  <td className="px-6 py-3 text-right">
                                      <span className="inline-flex items-center gap-1.5 text-purple-300 font-medium bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-full text-xs">
                                          <GitMerge className="w-3 h-3" /> Merged
                                      </span>
                                  </td>
                              </tr>
                          );
                          })
                       )}
                  </tbody>
              </table>
              )}
          </div>
      </div>
    </div>
  );
};
