import React, { useState, useEffect } from 'react';
import { STEPS } from './constants';
import { TaskItem, TaskStatus, WorktreeSlot, AppSettings } from './types';
import { Step1_Input } from './components/Step1_Input';
import { Step2_Issues } from './components/Step2_Issues';
import { Step3_Worktrees } from './components/Step3_Worktrees';
import { Step5_Review } from './components/Step5_Review';
import { Step6_Merge } from './components/Step6_Merge';
import { SettingsModal } from './components/SettingsModal';
import { createGithubIssue, fetchGithubIssues, createBranch, getBSHA, commitFile, createPullRequest, mergePullRequest, fetchMergedPRs, fetchOpenPRs, fetchCommitStatus } from './services/githubService';
import { createWorktree, pruneWorktree } from './services/gitService';
import { ChevronRight, GitGraph, Settings, LayoutDashboard, Terminal, Activity, Key, Menu, X } from 'lucide-react';

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [syncingTaskIds, setSyncingTaskIds] = useState<Set<string>>(new Set());
  
  const [settings, setSettings] = useState<AppSettings>({
    repoOwner: 'stagius',
    repoName: 'flowize',
    defaultBranch: 'master', // Updated default to 'master'
    worktreeRoot: '/home/dev/worktrees',
    maxWorktrees: 3,
    githubToken: ''
  });

  // Initialize slots
  const [slots, setSlots] = useState<WorktreeSlot[]>(
      Array.from({ length: 3 }, (_, i) => ({
          id: i + 1,
          taskId: null,
          path: `/home/dev/worktrees/wt-${i + 1}`
      }))
  );

  // Update slots when settings change (path or count)
  useEffect(() => {
    setSlots(prev => {
        const newSlots: WorktreeSlot[] = [];
        for (let i = 1; i <= settings.maxWorktrees; i++) {
            const existing = prev.find(p => p.id === i);
            if (existing) {
                // Keep existing assignment, update path if needed
                newSlots.push({
                    ...existing,
                    path: `${settings.worktreeRoot}/wt-${i}`
                });
            } else {
                // Create new slot
                newSlots.push({
                    id: i,
                    taskId: null,
                    path: `${settings.worktreeRoot}/wt-${i}`
                });
            }
        }
        return newSlots;
    });
  }, [settings.worktreeRoot, settings.maxWorktrees]);

  // --- Actions ---

  const handleTasksGenerated = (newTasks: TaskItem[]) => {
    setTasks(prev => [...prev, ...newTasks]);
    if (tasks.length === 0) setCurrentStep(2);
  };

  const handlePromoteToIssue = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (!settings.githubToken) {
        setIsSettingsOpen(true);
        // Simple alert for user guidance
        alert("Please set your GitHub Token in settings to create issues.");
        return;
    }

    setSyncingTaskIds(prev => new Set(prev).add(taskId));

    try {
        const issue = await createGithubIssue(settings, task);
        setTasks(prev => prev.map(t => 
            t.id === taskId ? { 
                ...t, 
                status: TaskStatus.ISSUE_CREATED,
                issueNumber: issue.number,
                issueUrl: issue.html_url
            } : t
        ));
    } catch (error: any) {
        console.error("Failed to create issue", error);
        alert(`Failed to create issue on GitHub: ${error.message}`);
    } finally {
        setSyncingTaskIds(prev => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
        });
    }
  };

  const handlePromoteAllIssues = async () => {
    if (!settings.githubToken) {
        setIsSettingsOpen(true);
        alert("Please set your GitHub Token in settings to create issues.");
        return;
    }

    const pending = tasks.filter(t => t.status === TaskStatus.FORMATTED);
    if (pending.length === 0) return;

    // Process sequentially to avoid rate limits or state race conditions in a simple implementation
    for (const task of pending) {
        await handlePromoteToIssue(task.id);
    }
  };

  const handleFetchRemote = async () => {
      if (!settings.githubToken) {
          setIsSettingsOpen(true);
          alert("Please set your GitHub Token in settings to fetch issues.");
          return;
      }

      try {
          const remoteIssues = await fetchGithubIssues(settings);
          
          // Filter out Pull Requests (which are also returned by the issues endpoint)
          const issuesOnly = remoteIssues.filter((issue: any) => !issue.pull_request);

          const newTasks = issuesOnly.map((issue: any) => {
              // Heuristics to map labels to metadata
              const priorityLabel = issue.labels.find((l: any) => 
                  l.name.toLowerCase().includes('priority') || 
                  l.name.toLowerCase() === 'high' || 
                  l.name.toLowerCase() === 'medium' || 
                  l.name.toLowerCase() === 'low'
              );
              
              let priority: 'High' | 'Medium' | 'Low' = 'Medium';
              if (priorityLabel) {
                  const name = priorityLabel.name.toLowerCase();
                  if (name.includes('high')) priority = 'High';
                  else if (name.includes('low')) priority = 'Low';
              }

              const groupLabel = issue.labels.find((l: any) => 
                  !l.name.toLowerCase().includes('priority') && 
                  !['high','medium','low'].includes(l.name.toLowerCase())
              );
              
              const group = groupLabel ? groupLabel.name : 'GitHub Import';

              return {
                  id: `gh-${issue.number}`,
                  rawText: issue.title,
                  title: issue.title,
                  description: issue.body || '',
                  group,
                  priority,
                  status: TaskStatus.ISSUE_CREATED, // Treat fetched issues as ready for worktree
                  issueNumber: issue.number,
                  issueUrl: issue.html_url,
                  createdAt: new Date(issue.created_at).getTime()
              } as TaskItem;
          });

          // Merge avoiding duplicates (by issue number)
          setTasks(prev => {
              const existingNumbers = new Set(prev.filter(t => t.issueNumber).map(t => t.issueNumber));
              const uniqueNewTasks = newTasks.filter((t: TaskItem) => t.issueNumber && !existingNumbers.has(t.issueNumber));
              
              if (uniqueNewTasks.length === 0) {
                  alert("No new issues found.");
                  return prev;
              }
              return [...prev, ...uniqueNewTasks];
          });

      } catch (error: any) {
          console.error("Failed to fetch issues", error);
          alert(`Failed to fetch remote issues: ${error.message}`);
      }
  };

  const handleAssignToSlot = async (taskId: string, slotId: number) => {
     // 1. Reserve slot and set task to initializing
     setSlots(prev => prev.map(s => s.id === slotId ? { ...s, taskId } : s));
     
     const branchName = `feat/${tasks.find(t => t.id === taskId)?.group.toLowerCase().replace(/\s+/g, '-')}-${taskId.substring(0,4)}`;
     
     setTasks(prev => prev.map(t => {
         if (t.id === taskId) {
             return {
                 ...t,
                 status: TaskStatus.WORKTREE_INITIALIZING,
                 branchName
             };
         }
         return t;
     }));

     // 2. Perform git operations (simulated)
     const currentSlot = slots.find(s => s.id === slotId) || { id: slotId, path: `${settings.worktreeRoot}/wt-${slotId}`, taskId };
     const task = tasks.find(t => t.id === taskId);
     
     if (task) {
        const updatedTask = { ...task, branchName };
        try {
            await createWorktree(settings, updatedTask, currentSlot);
            
            // 3. Set to active
            setTasks(prev => prev.map(t => 
                t.id === taskId ? { ...t, status: TaskStatus.WORKTREE_ACTIVE } : t
            ));
        } catch (error) {
            console.error("Git worktree creation failed", error);
            alert("Failed to create worktree on filesystem.");
            // Revert assignment on fail
            setSlots(prev => prev.map(s => s.id === slotId ? { ...s, taskId: null } : s));
            setTasks(prev => prev.map(t => 
                t.id === taskId ? { ...t, status: TaskStatus.ISSUE_CREATED } : t
            ));
        }
     }
  };

  const handleCleanupSlot = async (slotId: number) => {
      const slot = slots.find(s => s.id === slotId);
      if (!slot) return;

      const task = tasks.find(t => t.id === slot.taskId);
      
      if (task) {
          const confirm = window.confirm(`Slot ${slotId} is currently used by task "${task.title}".\n\nCleaning up will detach the task and reset it to 'Issue Created'.\n\nContinue?`);
          if (!confirm) return;
      }

      // Visual cleanup
      await pruneWorktree(slot);

      // Reset slot
      setSlots(prev => prev.map(s => s.id === slotId ? { ...s, taskId: null } : s));

      // Reset task if it existed
      if (task) {
          setTasks(prev => prev.map(t => 
              t.id === task.id ? { 
                  ...t, 
                  status: TaskStatus.ISSUE_CREATED,
                  branchName: undefined,
                  implementationDetails: undefined 
              } : t
          ));
      }
  };

  const handleImplement = (taskId: string, implementation: string) => {
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, status: TaskStatus.IMPLEMENTED, implementationDetails: implementation } : t
    ));
  };

  const handleFinishImplementation = async (taskId: string) => {
      const task = tasks.find(t => t.id === taskId);
      const slot = slots.find(s => s.taskId === taskId);
      
      if (slot && task && task.branchName) {
         try {
             // 1. Git Push Simulation (Visual)
             await pruneWorktree(slot, task.branchName);

             // 2. Real GitHub API Push
             if (settings.githubToken) {
                 const baseSha = await getBSHA(settings, settings.defaultBranch);
                 await createBranch(settings, task.branchName, baseSha);
                 await commitFile(
                     settings, 
                     task.branchName, 
                     `src/features/${task.group.toLowerCase()}/${task.id}.tsx`, 
                     task.implementationDetails || '// No code',
                     `feat: implement ${task.title} (#${task.issueNumber})`
                 );
             }

             setSlots(prev => prev.map(s => s.taskId === taskId ? { ...s, taskId: null } : s));
         } catch (e: any) {
             console.error("Failed to push to GitHub", e);
             alert(`Failed to push branch: ${e.message}`);
         }
      }
  };

  const handleApprovePR = async (taskId: string) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task || !task.branchName) return;

      try {
          let prNumber;
          let prUrl;
          
          if (settings.githubToken) {
              const pr = await createPullRequest(
                  settings, 
                  task.branchName, 
                  settings.defaultBranch, 
                  task.title, 
                  `${task.description}\n\nCloses #${task.issueNumber}`
              );
              prNumber = pr.number;
              prUrl = pr.html_url;
          } else {
             // Fallback
             prNumber = Math.floor(Math.random() * 500) + 100;
          }

          // Updated: vercelStatus is now pending until specifically checked
          setTasks(prev => prev.map(t => 
            t.id === taskId ? { 
                ...t, 
                status: TaskStatus.PR_CREATED, 
                prNumber, 
                issueUrl: prUrl || t.issueUrl, 
                vercelStatus: 'pending' 
            } : t
        ));

      } catch (e: any) {
          console.error("PR Creation Failed", e);
          alert(`Failed to create PR: ${e.message}`);
      }
  };

  const handleCheckCIStatus = async () => {
    if (!settings.githubToken) {
        setIsSettingsOpen(true);
        alert("Please set your GitHub Token in settings to check CI status.");
        return;
    }

    const prTasks = tasks.filter(t => t.status === TaskStatus.PR_CREATED);
    if (prTasks.length === 0) {
        alert("No active Pull Requests to check.");
        return;
    }

    let hasUpdates = false;
    const updatedTasks = [...tasks];

    for (const task of prTasks) {
        if (!task.branchName) continue;
        try {
            const statusData = await fetchCommitStatus(settings, task.branchName);
            // GitHub state: 'failure', 'pending', 'success', 'error'
            // App state: 'failed', 'pending', 'success'
            let vStatus: 'pending' | 'success' | 'failed' = 'pending';
            
            if (statusData.state === 'success') vStatus = 'success';
            else if (statusData.state === 'failure' || statusData.state === 'error') vStatus = 'failed';
            
            const idx = updatedTasks.findIndex(t => t.id === task.id);
            if (idx !== -1 && updatedTasks[idx].vercelStatus !== vStatus) {
                updatedTasks[idx] = { ...updatedTasks[idx], vercelStatus: vStatus };
                hasUpdates = true;
            }
        } catch (e) {
            console.error("Failed to check status for", task.branchName, e);
        }
    }

    if (hasUpdates) {
        setTasks(updatedTasks);
    } else {
        // Optional: Show a subtle notification that statuses are up to date
        // console.log("Statuses up to date");
    }
  };

  const handleMerge = async (taskId: string) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      if (settings.githubToken && task.prNumber) {
          try {
              await mergePullRequest(settings, task.prNumber, `Merge pull request #${task.prNumber} from ${task.branchName}`);
          } catch (e: any) {
              console.error("Merge Failed", e);
              alert(`Failed to merge PR: ${e.message}`);
              return;
          }
      }

      setTasks(prev => prev.map(t => 
          t.id === taskId ? { ...t, status: TaskStatus.PR_MERGED } : t
      ));
  };

  const handleFetchMerged = async () => {
      if (!settings.githubToken) {
          setIsSettingsOpen(true);
          alert("Please set your GitHub Token in settings to fetch PRs.");
          return;
      }

      try {
          // Fetch both merged and open PRs to sync the view
          const [mergedPRs, openPRs] = await Promise.all([
              fetchMergedPRs(settings),
              fetchOpenPRs(settings)
          ]);
          
          setTasks(prev => {
              const newTasks = [...prev];
              
              const processPR = (pr: any, status: TaskStatus) => {
                  const idx = newTasks.findIndex(t => t.prNumber === pr.number);
                  
                  if (idx !== -1) {
                      // Update existing task
                      if (newTasks[idx].status !== status) {
                          newTasks[idx] = { 
                              ...newTasks[idx], 
                              status, 
                              issueUrl: pr.html_url 
                          };
                      }
                  } else {
                      // Check by ID if constructed differently (gh-pr-...)
                      if (!newTasks.some(t => t.id === `gh-pr-${pr.number}`)) {
                           newTasks.push({
                              id: `gh-pr-${pr.number}`,
                              rawText: pr.title,
                              title: pr.title,
                              description: pr.body || '',
                              group: 'GitHub Import',
                              priority: 'Medium',
                              status: status,
                              prNumber: pr.number,
                              issueUrl: pr.html_url,
                              branchName: pr.head.ref,
                              createdAt: new Date(pr.created_at).getTime(),
                              vercelStatus: 'pending' // Default for new open PRs
                          });
                      }
                  }
              };

              mergedPRs.forEach((pr: any) => processPR(pr, TaskStatus.PR_MERGED));
              openPRs.forEach((pr: any) => processPR(pr, TaskStatus.PR_CREATED));

              return newTasks;
          });
      } catch (e: any) {
          console.error("Fetch PRs Failed", e);
          alert(`Failed to fetch PRs: ${e.message}`);
      }
  };

  // --- Render Helpers ---

  const renderContent = () => {
    switch (currentStep) {
      case 1: return <Step1_Input onTasksGenerated={handleTasksGenerated} existingTasks={tasks} />;
      case 2: return <Step2_Issues tasks={tasks} onPromoteToIssue={handlePromoteToIssue} onPromoteAll={handlePromoteAllIssues} syncingTaskIds={syncingTaskIds} onFetchRemote={handleFetchRemote} />;
      case 3: return <Step3_Worktrees 
                 tasks={tasks} 
                 slots={slots} 
                 onAssignToSlot={handleAssignToSlot} 
                 onImplement={handleImplement}
                 onFinishImplementation={handleFinishImplementation}
                 onCleanup={handleCleanupSlot}
                 settings={settings}
               />;
      case 4: return <Step5_Review tasks={tasks} onApprovePR={handleApprovePR} onCheckStatus={handleCheckCIStatus} />;
      case 5: return <Step6_Merge tasks={tasks} onMerge={handleMerge} onFetchMerged={handleFetchMerged} />;
      default: return <div>Unknown Step</div>;
    }
  };

  const activeWorktrees = slots.filter(s => s.taskId).length;
  const progressPercent = tasks.length > 0 
      ? Math.round((tasks.filter(t => t.status === TaskStatus.PR_MERGED).length / tasks.length) * 100) 
      : 0;
  
  const hasApiKey = !!process.env.API_KEY;

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        currentSettings={settings}
        onSave={setSettings}
        hasApiKey={hasApiKey}
      />

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
             <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-500/10 p-2 rounded-lg text-indigo-400">
                      <GitGraph className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-lg text-slate-100">Flowize</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
             </div>
             
             <nav className="p-4 space-y-2 flex-1">
                 {STEPS.map((step) => {
                     const isActive = currentStep === step.id;
                     const Icon = step.icon;
                     return (
                         <button
                            key={step.id}
                            onClick={() => {
                              setCurrentStep(step.id);
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center p-3 rounded-lg transition-all ${
                                isActive 
                                  ? `${step.bg} ${step.color} ring-1 ring-inset ${step.border}` 
                                  : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                            }`}
                         >
                            <Icon className={`w-5 h-5 ${isActive ? step.color : 'text-slate-500'}`} />
                            <span className="ml-3 font-medium">{step.label}</span>
                         </button>
                     );
                 })}
             </nav>

             <div className="p-4 border-t border-slate-800">
                 <div className="bg-slate-800/50 rounded-lg p-3 text-xs space-y-2">
                     <div className="flex justify-between items-center text-slate-400">
                         <span>System Status</span>
                         <Activity className="w-3 h-3 text-emerald-400" />
                     </div>
                     <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-emerald-500 font-medium">Online</span>
                     </div>
                     <div className="pt-2 border-t border-slate-700/50 flex justify-between items-center text-slate-500">
                        <span className="flex items-center gap-1.5"><Key className="w-3 h-3" /> API Key</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${hasApiKey ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                            {hasApiKey ? 'CONFIGURED' : 'MISSING'}
                        </span>
                     </div>
                 </div>
             </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar Navigation */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl flex flex-col justify-between hidden lg:flex sticky top-0 h-screen">
        <div>
          <div className="h-16 flex items-center justify-start px-6 border-b border-slate-800">
             <div className="bg-indigo-500/10 p-2 rounded-lg text-indigo-400">
                <GitGraph className="w-6 h-6" />
             </div>
             <span className="ml-3 font-bold text-lg tracking-tight text-slate-100">Flowize</span>
          </div>

          <nav className="p-4 space-y-2">
             {STEPS.map((step) => {
                 const isActive = currentStep === step.id;
                 const Icon = step.icon;
                 
                 return (
                     <button
                        key={step.id}
                        onClick={() => setCurrentStep(step.id)}
                        className={`w-full flex items-center p-3 rounded-lg transition-all duration-200 group ${
                            isActive 
                              ? `${step.bg} ${step.color} ring-1 ring-inset ${step.border}` 
                              : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                        }`}
                     >
                        <Icon className={`w-5 h-5 ${isActive ? step.color : 'text-slate-500 group-hover:text-slate-300'}`} />
                        <span className="ml-3 font-medium text-sm">{step.label}</span>
                        {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]"></div>}
                     </button>
                 );
             })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800">
            <div className="bg-slate-800/50 rounded-lg p-3 text-xs space-y-2">
                <div className="flex justify-between items-center text-slate-400">
                    <span>System Status</span>
                    <Activity className="w-3 h-3 text-emerald-400" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-emerald-500 font-medium">Online</span>
                </div>
                <div className="pt-2 border-t border-slate-700/50 flex justify-between items-center text-slate-500">
                    <span className="flex items-center gap-1.5"><Key className="w-3 h-3" /> API Key</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${hasApiKey ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                        {hasApiKey ? 'CONFIGURED' : 'MISSING'}
                    </span>
                </div>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
         {/* Top Bar */}
         <header className="h-16 border-b border-slate-800 bg-slate-900/30 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between px-4 md:px-6">
            <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="flex items-center gap-3 lg:hidden p-1 -ml-1 text-slate-400 hover:text-white"
            >
               <Menu className="w-6 h-6" />
               <span className="font-bold text-slate-100">Flowize</span>
            </button>
            
            <div className="hidden lg:flex items-center text-sm text-slate-400">
                <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-xs">
                   <Terminal className="w-3.5 h-3.5" />
                   <span className="text-slate-500">{settings.worktreeRoot}</span>
                   <span className="font-mono text-slate-300">/{settings.repoName}</span>
                </span>
            </div>

            <div className="flex items-center gap-4 md:gap-6">
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hidden sm:inline">Pipeline</span>
                        <span className="text-xs font-bold text-indigo-400">{progressPercent}%</span>
                    </div>
                    <div className="w-24 md:w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-700" 
                          style={{ width: `${progressPercent}%`}}
                        ></div>
                    </div>
                </div>

                <div className="h-8 w-px bg-slate-800 mx-1 md:mx-2"></div>

                <div className="flex items-center gap-3">
                   <div className="hidden md:flex flex-col items-end">
                       <span className="text-xs font-medium text-slate-200">{settings.repoOwner}</span>
                       <span className="text-[10px] text-slate-500">{activeWorktrees}/{settings.maxWorktrees} Active</span>
                   </div>
                   <button 
                     onClick={() => setIsSettingsOpen(true)}
                     className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                   >
                      <Settings className="w-5 h-5" />
                   </button>
                </div>
            </div>
         </header>

         <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
             <div className="max-w-7xl mx-auto h-full flex flex-col">
                 {/* Page Header */}
                 <div className="mb-6 flex items-center justify-between">
                     <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">
                            {STEPS.find(s => s.id === currentStep)?.label || 'Dashboard'}
                        </h1>
                        <p className="text-slate-400 text-sm mt-1">Manage your development lifecycle.</p>
                     </div>
                 </div>

                 {/* Step Content */}
                 <div className="flex-1 min-h-0 relative animate-in fade-in slide-in-from-bottom-4 duration-500">
                     {renderContent()}
                 </div>
             </div>
         </main>
      </div>

    </div>
  );
}