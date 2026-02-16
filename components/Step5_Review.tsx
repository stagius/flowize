import React, { useState } from 'react';
import { TaskItem, TaskStatus } from '../types';
import { GitPullRequest, CheckCircle2, FileCode, ExternalLink, GitCommit, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  tasks: TaskItem[];
  onApprovePR: (taskId: string) => Promise<void>;
  onCheckStatus: () => Promise<void>;
}

export const Step5_Review: React.FC<Props> = ({ tasks, onApprovePR, onCheckStatus }) => {
  const pendingReview = tasks.filter(t => t.status === TaskStatus.IMPLEMENTED);
  const activePRs = tasks.filter(t => t.status === TaskStatus.PR_CREATED || t.status === TaskStatus.PR_MERGED);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const handleApprove = async (id: string) => {
      setLoadingId(id);
      await onApprovePR(id);
      setLoadingId(null);
  };

  const handleCheckStatus = async () => {
    setIsChecking(true);
    await onCheckStatus();
    setIsChecking(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      
      {/* Pending Reviews */}
      <div className="flex flex-col h-full bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-teal-500/5">
          <h3 className="font-bold text-teal-400 flex items-center gap-2">
            <FileCode className="w-5 h-5" /> Code Review ({pendingReview.length})
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {pendingReview.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
               <CheckCircle2 className="w-10 h-10 opacity-20" />
               <p>No pending reviews.</p>
            </div>
          ) : (
            pendingReview.map(task => (
              <div key={task.id} className="border border-slate-700 rounded-xl overflow-hidden bg-slate-900 shadow-lg">
                <div className="bg-slate-800 p-3 border-b border-slate-700 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                       <GitCommit className="w-4 h-4 text-slate-500" />
                       <span className="font-semibold text-slate-200">{task.title}</span>
                   </div>
                   <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                      {task.branchName}
                   </span>
                </div>
                <div className="p-0 bg-slate-950 max-h-64 overflow-y-auto custom-scrollbar">
                    <div className="flex border-b border-slate-800/50">
                        <div className="w-8 bg-slate-900 text-slate-600 text-[10px] text-right pr-2 pt-2 select-none border-r border-slate-800">1<br/>2<br/>3<br/>4</div>
                        <pre className="p-2 text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed flex-1">
                            {task.implementationDetails}
                        </pre>
                    </div>
                </div>
                <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-between items-center">
                   <button className="text-xs text-red-400 hover:text-red-300 font-medium px-3 py-1 hover:bg-red-950/30 rounded transition-colors">Request Changes</button>
                   <button 
                     onClick={() => handleApprove(task.id)}
                     disabled={loadingId === task.id}
                     className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-[0_0_10px_rgba(20,184,166,0.2)] disabled:opacity-70 disabled:cursor-not-allowed"
                   >
                     {loadingId === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitPullRequest className="w-3.5 h-3.5" />}
                     Approve & Open PR
                   </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Active PRs Status */}
      <div className="flex flex-col h-full bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800 overflow-hidden">
         <div className="p-4 border-b border-slate-800 bg-blue-500/5 flex justify-between items-center">
          <h3 className="font-bold text-blue-400 flex items-center gap-2">
            <GitPullRequest className="w-5 h-5" /> Open Pull Requests
          </h3>
          <button 
             onClick={handleCheckStatus}
             disabled={isChecking}
             className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors border border-transparent hover:border-slate-700"
             title="Refresh CI Status"
          >
             <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
           {activePRs.filter(t => t.status === TaskStatus.PR_CREATED).length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                No active PRs.
              </div>
           ) : (
             activePRs.filter(t => t.status === TaskStatus.PR_CREATED).map(task => (
                <div key={task.id} className="flex items-center justify-between p-4 border border-blue-500/20 bg-blue-500/5 rounded-xl hover:bg-blue-500/10 transition-colors">
                    <div>
                        <div className="flex items-center gap-2">
                             <span className="text-blue-400 font-mono text-sm">#{task.prNumber}</span>
                             <span className="font-medium text-slate-200">{task.title}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                             <span className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor] ${
                                    task.vercelStatus === 'success' ? 'bg-emerald-500 text-emerald-500' :
                                    task.vercelStatus === 'failed' ? 'bg-red-500 text-red-500' :
                                    'bg-yellow-500 text-yellow-500'
                                }`}></span>
                                CI: <span className="capitalize">{task.vercelStatus || 'Unknown'}</span>
                             </span>
                             <span className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                    task.vercelStatus === 'success' ? 'bg-white' : 'bg-slate-500'
                                }`}></span>
                                Vercel: <span className="text-slate-300">{
                                    task.vercelStatus === 'success' ? 'Deployed' :
                                    task.vercelStatus === 'failed' ? 'Error' :
                                    'Building...'
                                }</span>
                             </span>
                        </div>
                    </div>
                    <a href={task.issueUrl || '#'} target="_blank" className="p-2 text-slate-500 hover:text-blue-400 bg-slate-950/50 rounded-lg border border-slate-800 transition-colors">
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