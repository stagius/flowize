import React, { useState } from 'react';
import { TaskItem, TaskStatus } from '../types';
import { Github, ArrowRight, Check, AlertCircle, Loader2, ExternalLink, CloudDownload } from 'lucide-react';

interface Props {
  tasks: TaskItem[];
  onPromoteToIssue: (taskId: string) => void;
  onPromoteAll: () => void;
  syncingTaskIds: Set<string>;
  onFetchRemote: () => Promise<void>;
}

export const Step2_Issues: React.FC<Props> = ({ tasks, onPromoteToIssue, onPromoteAll, syncingTaskIds, onFetchRemote }) => {
  const [isFetching, setIsFetching] = useState(false);
  
  const pendingTasks = tasks.filter(t => t.status === TaskStatus.FORMATTED);
  const createdIssues = tasks.filter(t => {
    if (t.status === TaskStatus.FORMATTED || t.status === TaskStatus.RAW) return false;
    if (!t.issueNumber) return false;
    if (t.id.startsWith('gh-pr-')) return false;
    return true;
  });
  const isAnySyncing = syncingTaskIds.size > 0;

  const handleFetch = async () => {
      setIsFetching(true);
      try {
        await onFetchRemote();
      } finally {
        setIsFetching(false);
      }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
       <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
              <Github className="w-5 h-5 text-purple-400" />
              Issue Sync
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Review AI-formatted tasks and push to GitHub.
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
              <button 
                onClick={handleFetch}
                disabled={isFetching}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 border border-slate-700 shadow-lg w-full md:w-auto"
              >
                  {isFetching ? <Loader2 className="w-4 h-4 animate-spin"/> : <CloudDownload className="w-4 h-4"/>}
                  Fetch Remote
              </button>
              
              <button 
                onClick={onPromoteAll}
                disabled={pendingTasks.length === 0 || isAnySyncing || isFetching}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20 border border-purple-500/20 w-full md:w-auto"
              >
                {isAnySyncing ? <Loader2 className="w-4 h-4 animate-spin"/> : <ArrowRight className="w-4 h-4"/>}
                Sync All
              </button>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
          {/* Pending Column */}
          <div className="lg:col-span-2 bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800 flex flex-col overflow-hidden h-[500px] lg:h-auto">
             <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                <h3 className="font-semibold text-slate-300 flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                    Pending Approval
                </h3>
                <span className="text-xs text-slate-500">{pendingTasks.length} tasks</span>
             </div>
             <div className="overflow-y-auto p-4 space-y-3 flex-1 custom-scrollbar">
                {pendingTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600 text-sm gap-2">
                        <Check className="w-8 h-8 opacity-20" />
                        All caught up!
                    </div>
                ) : (
                    pendingTasks.map(task => {
                        const isSyncing = syncingTaskIds.has(task.id);
                        return (
                            <div key={task.id} className="group border border-slate-800 bg-slate-950/40 rounded-xl p-4 hover:border-purple-500/30 transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] relative overflow-hidden">
                                <div className="flex justify-between items-start mb-2 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${
                                            task.priority === 'High' ? 'text-red-500 bg-red-500' :
                                            task.priority === 'Medium' ? 'text-yellow-500 bg-yellow-500' : 'text-sky-500 bg-sky-500'
                                        }`}></span>
                                        <h4 className="font-medium text-slate-200">{task.title}</h4>
                                    </div>
                                    <button 
                                        onClick={() => onPromoteToIssue(task.id)}
                                        disabled={isSyncing}
                                        className={`opacity-100 lg:opacity-0 group-hover:opacity-100 text-xs px-3 py-1.5 rounded font-semibold transition-all hover:scale-105 ${
                                            isSyncing 
                                            ? 'bg-purple-900/50 text-purple-300 cursor-not-allowed' 
                                            : 'bg-white text-slate-900'
                                        }`}
                                    >
                                        {isSyncing ? 'Creating...' : 'Create Issue'}
                                    </button>
                                </div>
                                <p className="text-sm text-slate-400 mb-3 leading-relaxed">{task.description}</p>
                                <div className="flex items-center gap-2 text-xs relative z-10">
                                    <span className="bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700">{task.group}</span>
                                    <span className="text-slate-600 font-mono">ID: {task.id.substring(0,6)}</span>
                                </div>
                            </div>
                        );
                    })
                )}
             </div>
          </div>

          {/* Created Column */}
          <div className="bg-slate-900/30 rounded-2xl border border-slate-800 flex flex-col overflow-hidden h-[300px] lg:h-auto">
             <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                <h3 className="font-semibold text-slate-400">Synced Issues</h3>
             </div>
             <div className="overflow-y-auto p-4 space-y-3 flex-1 custom-scrollbar">
                {createdIssues.slice().reverse().map(task => (
                    <div key={task.id} className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800/50 opacity-80 hover:opacity-100 transition-opacity">
                         <div className="mt-1">
                             <Github className="w-4 h-4 text-green-500" />
                         </div>
                         <div className="flex-1 min-w-0">
                             <p className="text-sm font-medium text-slate-300 truncate">{task.title}</p>
                             <div className="flex items-center justify-between mt-1">
                                <a 
                                    href={task.issueUrl || '#'} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-xs text-green-500 flex items-center gap-1 font-mono hover:underline"
                                >
                                    #{task.issueNumber || '???'} <ExternalLink className="w-3 h-3" />
                                </a>
                                <span className="text-[10px] text-slate-500 capitalize">{task.priority}</span>
                             </div>
                         </div>
                    </div>
                ))}
                {createdIssues.length === 0 && (
                     <div className="text-center text-slate-600 text-sm mt-10">No issues synced yet.</div>
                )}
             </div>
          </div>
       </div>
    </div>
  );
};
