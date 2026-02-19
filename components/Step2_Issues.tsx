import React, { useState } from 'react';
import { TaskItem, TaskStatus } from '../types';
import { Github, ArrowRight, Check, Loader2, ExternalLink, CloudDownload, ChevronDown, Trash2 } from 'lucide-react';
import { PRIORITY_BADGES } from '../designSystem';
import { ErrorState, LoadingSkeleton } from './ui/AsyncStates';

interface Props {
  tasks: TaskItem[];
  onPromoteToIssue: (taskId: string) => void;
  onPromoteAll: () => void;
  syncingTaskIds: Set<string>;
  onFetchRemote: () => Promise<void>;
  onEditTask: (taskId: string, updates: Partial<Pick<TaskItem, 'title' | 'description' | 'group' | 'priority'>>) => void;
  onDeleteTask: (taskId: string) => void;
}

export const Step2_Issues: React.FC<Props> = ({
  tasks,
  onPromoteToIssue,
  onPromoteAll,
  syncingTaskIds,
  onFetchRemote,
  onEditTask,
  onDeleteTask
}) => {
  const [isFetching, setIsFetching] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, { title: string; description: string; group: string; priority: TaskItem['priority'] }>>({});
  const [openPriorityTaskId, setOpenPriorityTaskId] = useState<string | null>(null);
  
  const pendingTasks = tasks.filter(t => t.status === TaskStatus.FORMATTED);
  const createdIssues = tasks.filter(t => {
    if (t.status === TaskStatus.FORMATTED || t.status === TaskStatus.RAW) return false;
    if (!t.issueNumber) return false;
    if (t.id.startsWith('gh-pr-')) return false;
    return true;
  });
  const isAnySyncing = syncingTaskIds.size > 0;

  const handleFetch = async () => {
      setSyncError(null);
      setIsFetching(true);
      try {
        await onFetchRemote();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSyncError(message);
      } finally {
        setIsFetching(false);
      }
  };

  const handleSyncAll = async () => {
      setSyncError(null);
      try {
        await Promise.resolve(onPromoteAll());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSyncError(message);
      }
  };

  const startEditing = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setOpenPriorityTaskId(null);
    setEditDrafts(prev => ({
      ...prev,
      [task.id]: {
        title: task.title,
        description: task.description,
        group: task.group,
        priority: task.priority
      }
    }));
  };

  const cancelEditing = (taskId: string) => {
    setEditingTaskId(null);
    setOpenPriorityTaskId(null);
    setEditDrafts(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const handleEditChange = (taskId: string, field: 'title' | 'description' | 'group' | 'priority', value: string) => {
    setEditDrafts(prev => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        [field]: value
      }
    }));
  };

  const saveEditing = (taskId: string) => {
    const draft = editDrafts[taskId];
    if (!draft) return;
    onEditTask(taskId, {
      title: draft.title.trim() || 'Untitled Task',
      description: draft.description.trim(),
      group: draft.group.trim() || 'General',
      priority: draft.priority
    });
    setOpenPriorityTaskId(null);
    cancelEditing(taskId);
  };

  return (
    <div className="flex flex-col h-full space-y-6">
       <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <Github className="w-5 h-5 text-purple-700 dark:text-purple-400" />
              Issue Sync
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Review AI-formatted tasks and push to GitHub.
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
              <button 
                onClick={handleFetch}
                disabled={isFetching}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 border border-slate-300 dark:border-slate-700 shadow-lg w-full md:w-auto"
              >
                  {isFetching ? <Loader2 className="w-4 h-4 animate-spin"/> : <CloudDownload className="w-4 h-4"/>}
                  Fetch Remote
              </button>
              
               <button 
                onClick={() => {
                  void handleSyncAll();
                }}
                disabled={pendingTasks.length === 0 || isAnySyncing || isFetching}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20 dark:shadow-purple-900/20 border border-purple-500/20 w-full md:w-auto"
              >
                {isAnySyncing ? <Loader2 className="w-4 h-4 animate-spin"/> : <ArrowRight className="w-4 h-4"/>}
                Sync All
              </button>
          </div>
       </div>

       {syncError && (
        <ErrorState
          title="Issue sync failed"
          message={syncError}
          onRetry={handleFetch}
          retryLabel="Retry Fetch"
          compact
        />
       )}

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden max-h-[calc(100vh-16rem)]">
           {/* Pending Column */}
           <div className="lg:col-span-2 bg-white dark:bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden h-full min-h-[460px]">
             <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
                <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                    Pending Approval
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">{pendingTasks.length} tasks</span>
             </div>
             <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {isFetching ? (
                     <LoadingSkeleton rows={3} className="pt-1" />
                 ) : pendingTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-600 text-sm gap-2">
                        <Check className="w-8 h-8 opacity-20" />
                        All caught up!
                    </div>
                ) : (
                    pendingTasks.map(task => {
                        const isSyncing = syncingTaskIds.has(task.id);
                        const isEditing = editingTaskId === task.id;
                        const draft = editDrafts[task.id];
                        return (
                            <div key={task.id} className="group border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 rounded-xl p-4 hover:border-purple-500/30 transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] relative overflow-visible">
                                <div className="flex justify-between items-start mb-2 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${
                                            task.priority === 'High' ? 'text-red-500 bg-red-500' :
                                            task.priority === 'Medium' ? 'text-yellow-500 bg-yellow-500' : 'text-sky-500 bg-sky-500'
                                        }`}></span>
                                        <h4 className="font-medium text-slate-900 dark:text-slate-200">{task.title}</h4>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                          onClick={() => startEditing(task)}
                                          disabled={isSyncing}
                                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-700 disabled:opacity-70 disabled:cursor-not-allowed"
                                      >
                                          Edit
                                      </button>
                                      <button
                                          onClick={() => onDeleteTask(task.id)}
                                          disabled={isSyncing}
                                          className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-500/20 text-slate-700 hover:text-red-700 dark:text-slate-300 dark:hover:text-red-200 border border-slate-300 hover:border-red-400/60 dark:border-slate-700 dark:hover:border-red-400/40 disabled:opacity-70 disabled:cursor-not-allowed"
                                          title="Delete pending task"
                                      >
                                          <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button 
                                          onClick={() => onPromoteToIssue(task.id)}
                                          disabled={isSyncing}
                                          className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-all ${
                                              isSyncing 
                                              ? 'bg-purple-200 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 cursor-not-allowed' 
                                              : 'bg-purple-600 hover:bg-purple-500 text-white border border-purple-500/40 shadow-lg shadow-purple-500/20 dark:shadow-purple-900/20'
                                          }`}
                                      >
                                          <span className="inline-flex items-center gap-1.5">
                                            <span className="2xl:hidden">{isSyncing ? 'Creating...' : 'Create'}</span>
                                            <span className="hidden 2xl:inline">{isSyncing ? 'Creating...' : 'Create Issue'}</span>
                                            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                                          </span>
                                      </button>
                                    </div>
                                </div>
                                {isEditing && draft ? (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Title</label>
                                      <input
                                        value={draft.title}
                                        onChange={(e) => handleEditChange(task.id, 'title', e.target.value)}
                                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/60 transition-all"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Group</label>
                                      <input
                                        value={draft.group}
                                        onChange={(e) => handleEditChange(task.id, 'group', e.target.value)}
                                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/60 transition-all"
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Description</label>
                                    <textarea
                                      value={draft.description}
                                      onChange={(e) => handleEditChange(task.id, 'description', e.target.value)}
                                      className="w-full min-h-[90px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/60 transition-all"
                                    />
                                  </div>
                                    <div className="flex flex-wrap items-center gap-3">
                                      <div className="space-y-1">
                                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Priority</label>
                                        <div className="relative">
                                          <button
                                            type="button"
                                            onClick={() => setOpenPriorityTaskId(current => current === task.id ? null : task.id)}
                                            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/60 transition-all text-left flex items-center justify-between"
                                          >
                                            <span>{draft.priority}</span>
                                            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${openPriorityTaskId === task.id ? 'rotate-180' : ''}`} />
                                          </button>

                                          {openPriorityTaskId === task.id && (
                                            <div className="absolute left-0 right-0 top-full mt-1 z-[140] rounded-lg border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-2xl overflow-hidden">
                                              {(['High', 'Medium', 'Low'] as TaskItem['priority'][]).map((priority) => {
                                                const isSelected = draft.priority === priority;
                                                return (
                                                  <button
                                                    key={priority}
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => {
                                                      handleEditChange(task.id, 'priority', priority);
                                                      setOpenPriorityTaskId(null);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 border-b border-slate-200/70 dark:border-slate-800/70 last:border-b-0 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors ${isSelected ? 'bg-purple-500/10' : ''}`}
                                                  >
                                                    <p className="text-xs font-medium text-slate-900 dark:text-slate-200">{priority}</p>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 ml-auto">
                                        <button
                                          onClick={() => cancelEditing(task.id)}
                                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-700"
                                        >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => saveEditing(task.id)}
                                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 hover:bg-purple-500 text-white border border-purple-500/50"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">{task.description}</p>
                                    <div className="flex items-center gap-2 text-xs relative z-10">
                                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-700 dark:text-slate-400 border border-slate-300 dark:border-slate-700">{task.group}</span>
                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${PRIORITY_BADGES[task.priority]}`}>{task.priority}</span>
                                        <span className="text-slate-600 dark:text-slate-600 font-mono">ID: {task.issueNumber ?? task.id}</span>
                                    </div>
                                  </>
                                )}
                            </div>
                        );
                    })
                )}
             </div>
          </div>

           {/* Created Column */}
           <div className="bg-slate-100 dark:bg-slate-900/30 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden h-full min-h-[460px]">
             <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <h3 className="font-semibold text-slate-700 dark:text-slate-400">Synced Issues</h3>
             </div>
             <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {isFetching && createdIssues.length === 0 && <LoadingSkeleton rows={2} />}
                {!isFetching && createdIssues.slice().reverse().map(task => (
                    <div key={task.id} className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800/50 opacity-80 hover:opacity-100 transition-opacity">
                         <div className="mt-1">
                             <Github className="w-4 h-4 text-green-600 dark:text-green-500" />
                         </div>
                         <div className="flex-1 min-w-0">
                             <p className="text-sm font-medium text-slate-900 dark:text-slate-300 truncate">{task.title}</p>
                             <div className="flex items-center justify-between mt-1">
                                <a 
                                    href={task.issueUrl || '#'} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1 font-mono hover:underline"
                                >
                                    #{task.issueNumber || '???'} <ExternalLink className="w-3 h-3" />
                                </a>
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${PRIORITY_BADGES[task.priority]}`}>{task.priority}</span>
                              </div>
                          </div>
                     </div>
                ))}
                {!isFetching && createdIssues.length === 0 && (
                     <div className="text-center text-slate-600 dark:text-slate-600 text-sm mt-10">No issues synced yet.</div>
                )}
             </div>
          </div>
       </div>
    </div>
  );
};
