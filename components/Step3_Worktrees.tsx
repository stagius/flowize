import React, { useState, useEffect, useRef, useId } from 'react';
import { TaskItem, TaskStatus, WorktreeSlot, AppSettings } from '../types';
import { cancelAgentJob, generateImplementationFromAgent, openWorktreeCmdWindow } from '../services/agentService';
import { GitBranch, FolderGit2, Terminal, Loader2, CloudUpload, CheckCircle2, GitCommit, FileDiff, History, X, Command, Trash2, ScrollText, Copy, Check } from 'lucide-react';
import { PRIORITY_BADGES, WORKTREE_STATUS_THEMES } from '../designSystem';
import { useFocusTrap } from './ui/hooks/useFocusTrap';

interface Props {
    tasks: TaskItem[];
    slots: WorktreeSlot[];
    onAssignToSlot: (taskId: string, slotId: number) => void;
    onImplement: (
        taskId: string,
        implementation: string,
        logs: string,
        command: string,
        success: boolean,
        runState?: 'succeeded' | 'failed' | 'cancelled'
    ) => void;
    onFinishImplementation: (taskId: string) => Promise<void>;
    onCleanup: (slotId: number) => Promise<void>;
    settings?: AppSettings;
}

interface TerminalLine {
    type: 'command' | 'output' | 'error' | 'info';
    content: string;
}

export const Step3_Worktrees: React.FC<Props> = ({
    tasks,
    slots,
    onAssignToSlot,
    onImplement,
    onFinishImplementation,
    onCleanup,
    settings
}) => {
    const backlog = tasks.filter(t => t.status === TaskStatus.ISSUE_CREATED);
    const [loadingTask, setLoadingTask] = useState<string | null>(null);
    const [pushingTask, setPushingTask] = useState<string | null>(null);
    const [cleaningSlot, setCleaningSlot] = useState<number | null>(null);
    const [openingAgentWorkspaceSlot, setOpeningAgentWorkspaceSlot] = useState<number | null>(null);
    const [openingFullAgentSlot, setOpeningFullAgentSlot] = useState<number | null>(null);
    const [copiedCmdTaskId, setCopiedCmdTaskId] = useState<string | null>(null);
    const [copiedPathSlotId, setCopiedPathSlotId] = useState<number | null>(null);

    // Terminal State
    const [activeTerminalSlotId, setActiveTerminalSlotId] = useState<number | null>(null);
    const [activeAgentConsoleSlotId, setActiveAgentConsoleSlotId] = useState<number | null>(null);
    const [runningAgentTaskId, setRunningAgentTaskId] = useState<string | null>(null);
    const [runningAgentJobIdByTask, setRunningAgentJobIdByTask] = useState<Record<string, string>>({});
    const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);
    const [copiedAgentCommandTaskId, setCopiedAgentCommandTaskId] = useState<string | null>(null);
    const [liveAgentLogs, setLiveAgentLogs] = useState<Record<string, string>>({});
    const [terminalHistory, setTerminalHistory] = useState<TerminalLine[]>([]);
    const terminalEndRef = useRef<HTMLDivElement>(null);
    
    // Accessibility IDs
    const terminalModalTitleId = useId();
    const agentConsoleTitleId = useId();
    
    // Focus trap for terminal modal
    const terminalModalRef = useFocusTrap<HTMLDivElement>({
        isActive: activeTerminalSlotId !== null,
        onEscape: () => setActiveTerminalSlotId(null),
        restoreFocus: true,
    });
    
    // Focus trap for agent console modal
    const agentConsoleRef = useFocusTrap<HTMLDivElement>({
        isActive: activeAgentConsoleSlotId !== null,
        onEscape: () => setActiveAgentConsoleSlotId(null),
        restoreFocus: true,
    });

    const handleImplement = async (task: TaskItem, slot: WorktreeSlot) => {
        setLoadingTask(task.id);
        setRunningAgentTaskId(task.id);
        setActiveAgentConsoleSlotId(slot.id);
        setLiveAgentLogs((prev) => ({ ...prev, [task.id]: 'Starting sub-agent...' }));

        try {
            const result = await generateImplementationFromAgent(task, slot, settings, (progress) => {
                setLiveAgentLogs((prev) => ({ ...prev, [task.id]: progress.logs }));
                if (progress.jobId) {
                    setRunningAgentJobIdByTask((prev) => ({ ...prev, [task.id]: progress.jobId as string }));
                }
            });
            onImplement(task.id, result.implementation, result.logs, result.command, result.success, result.success ? 'succeeded' : 'failed');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const fallbackLogs = `Sub-agent execution crashed before completion.\nError: ${message}`;
            onImplement(task.id, fallbackLogs, fallbackLogs, '', false, 'failed');
        } finally {
            setRunningAgentTaskId(null);
            setLoadingTask(null);
            setLiveAgentLogs((prev) => {
                const next = { ...prev };
                delete next[task.id];
                return next;
            });
            setRunningAgentJobIdByTask((prev) => {
                const next = { ...prev };
                delete next[task.id];
                return next;
            });
        }
    };

    const handleCancelAgent = async (taskId: string) => {
        const jobId = runningAgentJobIdByTask[taskId];
        if (!jobId) {
            return;
        }
        setCancellingTaskId(taskId);
        try {
            await cancelAgentJob(settings, jobId);
            const cancelledLog = `Job cancelled by user. jobId=${jobId}`;
            onImplement(taskId, cancelledLog, cancelledLog, '', false, 'cancelled');
            setRunningAgentTaskId(null);
            setLoadingTask(null);
            setRunningAgentJobIdByTask((prev) => {
                const next = { ...prev };
                delete next[taskId];
                return next;
            });
            setLiveAgentLogs((prev) => {
                const next = { ...prev };
                delete next[taskId];
                return next;
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setLiveAgentLogs((prev) => ({ ...prev, [taskId]: `${prev[taskId] || ''}\n\nCancel failed: ${message}`.trim() }));
        } finally {
            setCancellingTaskId(null);
        }
    };

    const handlePush = async (taskId: string) => {
        setPushingTask(taskId);
        await onFinishImplementation(taskId);
        setPushingTask(null);
    };

    const handleMarkFlowSuccess = (task: TaskItem) => {
        const now = new Date().toISOString();
        const implementation = task.implementationDetails?.trim().length
            ? task.implementationDetails
            : `// Flow manually marked successful at ${now}`;
        const logs = task.agentLogs?.trim().length
            ? task.agentLogs
            : `Manually marked as success from worktree slot at ${now}.`;
        const command = task.agentLastCommand?.trim().length
            ? task.agentLastCommand
            : 'manual-success';

        onImplement(task.id, implementation, logs, command, true, 'succeeded');
    };

    const handleCleanupClick = async (slotId: number) => {
        setCleaningSlot(slotId);
        await onCleanup(slotId);
        setCleaningSlot(null);
    };

    const handleQuickAssignToSlot = (slotId: number) => {
        const nextTask = backlog[0];
        if (!nextTask) {
            return;
        }
        onAssignToSlot(nextTask.id, slotId);
    };

    const toShellPath = (value: string): string => {
        if (/^[a-zA-Z]:[\\/]/.test(value)) {
            return value.replace(/\//g, '\\');
        }
        return value;
    };

    const joinPath = (base: string, suffix: string): string => {
        if (base.endsWith('/')) return `${base}${suffix}`;
        return `${base}/${suffix}`;
    };

    const buildAgentCommandForTask = (task: TaskItem, slot: WorktreeSlot): string => {
        const template = settings?.antiGravityAgentCommand?.trim();
        if (!template || !task.issueNumber || !task.branchName) return '';

        const subdir = settings?.antiGravityAgentSubdir?.trim() || '.antigravity';
        const agentWorkspace = joinPath(slot.path, subdir.replace(/^[\\/]+/, ''));
        const issueDescriptionFile = joinPath(agentWorkspace, 'issue-description.md');
        const skillFile = joinPath(agentWorkspace, 'SKILL.md');
        const agentName = settings?.antiGravityAgentName?.trim() || '';

        return template
            .replace(/\{issueNumber\}/g, String(task.issueNumber))
            .replace(/\{branch\}/g, task.branchName)
            .replace(/\{title\}/g, task.title)
            .replace(/\{worktreePath\}/g, toShellPath(slot.path))
            .replace(/\{agentWorkspace\}/g, toShellPath(agentWorkspace))
            .replace(/\{agentName\}/g, agentName)
            .replace(/\{agentFlag\}/g, agentName ? `--agent "${agentName}"` : '')
            .replace(/\{issueDescriptionFile\}/g, toShellPath(issueDescriptionFile))
            .replace(/\{briefFile\}/g, toShellPath(issueDescriptionFile))
            .replace(/\{skillFile\}/g, toShellPath(skillFile));
    };

    const copyAgentCommandForTask = async (task: TaskItem, slot: WorktreeSlot): Promise<boolean> => {
        const command = buildAgentCommandForTask(task, slot);
        if (!command) return false;

        try {
            await navigator.clipboard.writeText(command);
            setCopiedCmdTaskId(task.id);
            setTimeout(() => {
                setCopiedCmdTaskId((current) => current === task.id ? null : current);
            }, 1500);
            return true;
        } catch {
            return false;
        }
    };

    const handleOpenAgentWorkspaceCmd = async (slot: WorktreeSlot, task?: TaskItem) => {
        copyAgentCommandForTask(task, slot);
        setOpeningAgentWorkspaceSlot(slot.id);
        const workspaceSubdir = settings?.antiGravityAgentSubdir?.trim() || '.antigravity';
        const agentName = settings?.antiGravityAgentName?.trim();
        const startupCommand = agentName ? `opencode --agent "${agentName}"` : 'opencode';

        try {
            if (task) {
                await copyAgentCommandForTask(task, slot);
            }
            await openWorktreeCmdWindow(settings, slot, {
                subdir: workspaceSubdir,
                title: `Flowize AG-${slot.id}`,
                startupCommand,
                ensureDirectory: true
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to open Anti-Gravity workspace CMD:', error);
            window.alert(`Failed to open Anti-Gravity workspace for this slot.\n${message}`);
        } finally {
            setOpeningAgentWorkspaceSlot((current) => (current === slot.id ? null : current));
        }
    };

    const handleOpenFullAgentIde = async (slot: WorktreeSlot) => {
        setOpeningFullAgentSlot(slot.id);

        try {
            await openWorktreeCmdWindow(settings, slot, {
                title: `Flowize AG-FULL-${slot.id}`,
                launchAntigravity: true,
                closeAfterStartup: true
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to open full Anti-Gravity IDE:', error);
            window.alert(`Failed to open full Anti-Gravity IDE for this slot.\n${message}`);
        } finally {
            setOpeningFullAgentSlot((current) => (current === slot.id ? null : current));
        }
    };

    // Scroll to bottom of terminal when history changes
    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [terminalHistory]);

    // Keyboard shortcuts for terminal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (activeTerminalSlotId === null) return;

            const slot = slots.find(s => s.id === activeTerminalSlotId);
            const task = tasks.find(t => t.id === slot?.taskId);
            if (!task) return;

            if (e.key === 'Escape') setActiveTerminalSlotId(null);
            // Only trigger if not typing in an input (future proofing)
            if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
                if (e.key.toLowerCase() === 's') runGitCommand('git status');
                if (e.key.toLowerCase() === 'l') runGitCommand('git log');
                if (e.key.toLowerCase() === 'd') runGitCommand('git diff');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTerminalSlotId, slots, tasks]);

    const openTerminal = (slotId: number) => {
        setTerminalHistory([{ type: 'info', content: `Flowize Terminal v1.0.0\nConnected to worktree slot #${slotId}` }]);
        setActiveTerminalSlotId(slotId);
    };

    const runGitCommand = (command: string) => {
        setTerminalHistory(prev => [...prev, { type: 'command', content: `> ${command}` }]);

        const output = [
            'This in-app terminal no longer returns synthetic git output.',
            'Use the real worktree command window opened from the slot actions to run git commands.'
        ].join('\n');

        setTimeout(() => {
            setTerminalHistory(prev => [...prev, { type: 'output', content: output }]);
        }, 300);
    };

    const getStatusConfig = (task: TaskItem | undefined, isPushing: boolean) => {
        if (!task) return {
            theme: 'slate',
            icon: FolderGit2,
            label: 'Empty Slot',
            animate: false
        };

        if (isPushing) return {
            theme: 'cyan',
            icon: CloudUpload,
            label: 'Pushing...',
            animate: true
        };

        switch (task.status) {
            case TaskStatus.WORKTREE_INITIALIZING:
                return {
                    theme: 'yellow',
                    icon: Loader2,
                    label: 'Initializing',
                    animate: true
                };
            case TaskStatus.WORKTREE_ACTIVE:
                return {
                    theme: 'indigo',
                    icon: Terminal,
                    label: 'Active',
                    animate: false
                };
            case TaskStatus.IMPLEMENTED:
                return {
                    theme: 'emerald',
                    icon: CheckCircle2,
                    label: 'Implemented',
                    animate: false
                };
            case TaskStatus.PUSHED:
                return {
                    theme: 'cyan',
                    icon: CloudUpload,
                    label: 'Pushed',
                    animate: false
                };
            default:
                return {
                    theme: 'slate',
                    icon: GitBranch,
                    label: 'Unknown',
                    animate: false
                };
        }
    };

    const activeAgentSlot = activeAgentConsoleSlotId !== null ? slots.find(s => s.id === activeAgentConsoleSlotId) : undefined;
    const activeAgentTask = activeAgentSlot ? tasks.find(t => t.id === activeAgentSlot.taskId) : undefined;
    const activeAgentJobId = activeAgentTask ? runningAgentJobIdByTask[activeAgentTask.id] : undefined;
    const activeAgentLogs = activeAgentTask
        ? (runningAgentTaskId === activeAgentTask.id
            ? (liveAgentLogs[activeAgentTask.id] || activeAgentTask.agentLogs || '')
            : (activeAgentTask.agentLogs || liveAgentLogs[activeAgentTask.id] || ''))
        : '';

    const extractCommandFromLogs = (logs: string): string => {
        const marker = 'Command: ';
        const index = logs.indexOf(marker);
        if (index < 0) {
            return '';
        }
        const afterMarker = logs.slice(index + marker.length);
        const endOfLine = afterMarker.indexOf('\n');
        return (endOfLine >= 0 ? afterMarker.slice(0, endOfLine) : afterMarker).trim();
    };

    const activeAgentCommand = activeAgentTask?.agentLastCommand || extractCommandFromLogs(activeAgentLogs || '');

    const handleCopyActiveAgentCommand = async () => {
        if (!activeAgentTask?.id || !activeAgentCommand) {
            return;
        }
        const taskId = activeAgentTask.id;

        try {
            await navigator.clipboard.writeText(activeAgentCommand);
            setCopiedAgentCommandTaskId(taskId);
            setTimeout(() => {
                setCopiedAgentCommandTaskId((current) => current === taskId ? null : current);
            }, 1500);
        } catch {
            // Ignore clipboard errors in unsupported contexts.
        }
    };

    const handleCopyWorktreePath = async (slotId: number, path: string) => {
        try {
            await navigator.clipboard.writeText(path);
            setCopiedPathSlotId(slotId);
            setTimeout(() => {
                setCopiedPathSlotId((current) => current === slotId ? null : current);
            }, 1500);
        } catch {
            // Ignore clipboard errors in unsupported contexts.
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full relative">

            {/* Terminal Modal Overlay */}
            {activeTerminalSlotId !== null && (
                <div 
                    className="absolute inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-white/60 dark:bg-slate-950/60 animate-in fade-in duration-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={terminalModalTitleId}
                >
                    <div 
                        ref={terminalModalRef}
                        className="w-full max-w-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800 h-[600px]"
                    >
                        {/* Terminal Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <Terminal className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                                <h2 id={terminalModalTitleId} className="font-mono text-sm text-slate-900 dark:text-slate-200">
                                    wt-{activeTerminalSlotId}
                                    <span className="text-slate-500 dark:text-slate-600 mx-2" aria-hidden="true">|</span>
                                    {tasks.find(t => t.id === slots.find(s => s.id === activeTerminalSlotId)?.taskId)?.branchName || 'HEAD'}
                                </h2>
                            </div>
                            <button
                                onClick={() => setActiveTerminalSlotId(null)}
                                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
                                aria-label="Close terminal"
                            >
                                <X className="w-5 h-5" aria-hidden="true" />
                            </button>
                        </div>

                        {/* Terminal Output */}
                        <div 
                            className="flex-1 bg-slate-100 dark:bg-black/50 p-4 font-mono text-xs overflow-y-auto custom-scrollbar"
                            role="log"
                            aria-live="polite"
                            aria-label="Terminal output"
                        >
                            {terminalHistory.map((line, i) => (
                                <div key={i} className={`mb-1 whitespace-pre-wrap ${line.type === 'command' ? 'text-slate-600 dark:text-slate-400 font-bold mt-4' :
                                    line.type === 'info' ? 'text-indigo-600 dark:text-indigo-400' :
                                        line.type === 'error' ? 'text-red-600 dark:text-red-400' :
                                            'text-slate-900 dark:text-slate-300'
                                    }`}>
                                    {line.content}
                                </div>
                            ))}
                            <div ref={terminalEndRef} />
                        </div>

                        {/* Command Palette */}
                        <div className="bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4">
                            <div className="text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold mb-3 flex items-center gap-2">
                                <Command className="w-3 h-3" aria-hidden="true" /> Git Operations
                            </div>
                            <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Git commands">
                                {[
                                    { cmd: 'git status', icon: GitBranch, label: 'Status', key: 'S' },
                                    { cmd: 'git log', icon: History, label: 'Log', key: 'L' },
                                    { cmd: 'git diff', icon: FileDiff, label: 'Diff', key: 'D' },
                                ].map((action) => {
                                    const slot = slots.find(s => s.id === activeTerminalSlotId);
                                    const task = tasks.find(t => t.id === slot?.taskId);
                                    return (
                                        <button
                                            key={action.cmd}
                                            onClick={() => task && runGitCommand(action.cmd)}
                                            aria-label={`Run ${action.cmd}`}
                                            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 transition-all active:scale-95 group"
                                        >
                                            <action.icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                                            {action.label}
                                            <span className="ml-1 bg-slate-100 dark:bg-slate-950 px-1.5 rounded text-slate-600 dark:text-slate-400 text-[10px] border border-slate-200 dark:border-slate-800 group-hover:border-slate-300 dark:group-hover:border-slate-600 transition-colors" aria-hidden="true">
                                                {action.key}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Agent Console Overlay */}
            {activeAgentConsoleSlotId !== null && (
                <div 
                    className="absolute inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-white/60 dark:bg-slate-950/60 animate-in fade-in duration-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={agentConsoleTitleId}
                >
                    <div 
                        ref={agentConsoleRef}
                        className="w-full max-w-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800 h-[600px]"
                    >
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <ScrollText className="w-5 h-5 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
                                <h2 id={agentConsoleTitleId} className="font-mono text-sm text-slate-900 dark:text-slate-200">
                                    agent-console
                                    <span className="text-slate-500 dark:text-slate-600 mx-2" aria-hidden="true">|</span>
                                    wt-{activeAgentConsoleSlotId}
                                    <span className="text-slate-500 dark:text-slate-600 mx-2" aria-hidden="true">|</span>
                                    {activeAgentTask?.branchName || 'HEAD'}
                                </h2>
                            </div>
                            <div className="flex items-center gap-2" role="toolbar" aria-label="Agent console actions">
                                {activeAgentTask && activeAgentCommand && (
                                    <button
                                        onClick={handleCopyActiveAgentCommand}
                                        className="text-[11px] px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800/60 text-slate-900 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700/80"
                                        aria-label={copiedAgentCommandTaskId === activeAgentTask.id ? 'Command copied' : 'Copy agent command'}
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            {copiedAgentCommandTaskId === activeAgentTask.id ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                                            {copiedAgentCommandTaskId === activeAgentTask.id ? 'Copied' : 'Copy Command'}
                                        </span>
                                    </button>
                                )}
                                {activeAgentTask && runningAgentTaskId === activeAgentTask.id && activeAgentJobId && (
                                    <button
                                        onClick={() => handleCancelAgent(activeAgentTask.id)}
                                        disabled={cancellingTaskId === activeAgentTask.id}
                                        aria-busy={cancellingTaskId === activeAgentTask.id}
                                        className="text-[11px] px-2.5 py-1 rounded border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 hover:bg-red-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {cancellingTaskId === activeAgentTask.id ? 'Cancelling...' : 'Cancel Run'}
                                    </button>
                                )}
                                <button
                                    onClick={() => setActiveAgentConsoleSlotId(null)}
                                    className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
                                    aria-label="Close agent console"
                                >
                                    <X className="w-5 h-5" aria-hidden="true" />
                                </button>
                            </div>
                        </div>

                        <div 
                            className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 text-[11px] text-slate-600 dark:text-slate-400 font-mono"
                            role="status"
                            aria-live="polite"
                        >
                            {runningAgentTaskId && activeAgentTask?.id === runningAgentTaskId
                                ? 'Agent status: running...'
                                : `Agent status: ${activeAgentTask?.agentRunState || 'idle'}`}
                        </div>

                        <div 
                            className="flex-1 bg-slate-100 dark:bg-black/50 p-4 font-mono text-xs overflow-y-auto custom-scrollbar whitespace-pre-wrap text-slate-900 dark:text-slate-300"
                            role="log"
                            aria-live="polite"
                            aria-label="Agent output logs"
                        >
                            {runningAgentTaskId && activeAgentTask?.id === runningAgentTaskId
                                ? (activeAgentLogs || 'Starting sub-agent...\nWaiting for command output...')
                                : (activeAgentLogs || 'No agent logs yet. Run Implement to execute the issue sub-agent and capture logs here.')}
                        </div>
                    </div>
                </div>
            )}

            {/* Backlog Column */}
            <div className="xl:col-span-1 bg-slate-100 dark:bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden h-full min-h-[460px] xl:max-h-[calc(100vh-12rem)]">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 flex-shrink-0">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-300 flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-orange-600 dark:text-orange-400" /> Issue Backlog
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        Assign issues to available worktree slots.
                    </p>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                    {backlog.length === 0 ? (
                        <div className="text-center text-slate-500 dark:text-slate-600 text-sm mt-10 p-4">
                            Backlog empty. <br />Sync issues from previous step.
                        </div>
                    ) : (
                        backlog.map(task => (
                            <div key={task.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800/50 transition-colors bg-white dark:bg-slate-900/30 group">
                                <div className="flex justify-between items-center mb-2 gap-2">
                                    <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 font-mono">
                                        #{task.issueNumber ?? task.id}
                                    </span>
                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${PRIORITY_BADGES[task.priority]}`}>
                                        {task.priority}
                                    </span>
                                </div>
                                <p className="font-medium text-sm text-slate-900 dark:text-slate-200 mb-3">{task.title}</p>

                                {/* Assignment Actions */}
                                <div className="flex flex-wrap gap-1">
                                    {slots.map(slot => (
                                        <button
                                            key={slot.id}
                                            disabled={!!slot.taskId}
                                            onClick={() => onAssignToSlot(task.id, slot.id)}
                                            className={`text-[10px] py-1 px-2 rounded border transition-all ${slot.taskId
                                                ? 'bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-slate-700 border-slate-200 dark:border-slate-800 cursor-not-allowed hidden'
                                                : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/40'
                                                }`}
                                        >
                                            WT-{slot.id}
                                        </button>
                                    ))}
                                    {slots.every(s => s.taskId) && (
                                        <span className="text-[10px] text-slate-500 dark:text-slate-600 italic">No slots available</span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Worktree Slots Area */}
            <div className="xl:col-span-3 flex flex-col gap-4 h-full min-h-[460px] overflow-y-auto custom-scrollbar pr-1 xl:pr-2 max-h-[calc(100vh-12rem)]">
                {slots.map((slot) => {
                    const assignedTask = tasks.find(t => t.id === slot.taskId);
                    const isInitializing = assignedTask?.status === TaskStatus.WORKTREE_INITIALIZING;
                    const isPushing = pushingTask === assignedTask?.id;

                    const config = getStatusConfig(assignedTask, isPushing);
                    const theme = WORKTREE_STATUS_THEMES[config.theme as keyof typeof WORKTREE_STATUS_THEMES];
                    const StatusIcon = config.icon;

                    const gitStatus = !assignedTask ? null :
                        assignedTask.status === TaskStatus.IMPLEMENTED ? { label: 'STAGED', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' } :
                            assignedTask.status === TaskStatus.PUSHED ? { label: 'PUSHED', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' } :
                            assignedTask.status === TaskStatus.WORKTREE_ACTIVE ? { label: 'DIRTY', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' } :
                                { label: 'CLEAN', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' };

                    return (
                        <div key={slot.id} className={`rounded-xl border flex flex-col md:flex-row overflow-hidden transition-all relative flex-shrink-0 min-h-[250px] ${theme.border} ${theme.bg} ${assignedTask ? 'shadow-lg' : ''}`}>
                            {/* Status Indicator Bar */}
                            {assignedTask && <div className={`absolute top-0 left-0 w-full h-1 md:w-1 md:h-full ${theme.bar} ${config.animate ? 'animate-pulse' : ''}`}></div>}

                            {/* Slot Header / Status - Mobile Optimized */}
                            <div className="w-full md:w-56 bg-slate-100 dark:bg-slate-950/50 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-3 md:p-4 flex flex-row md:flex-col justify-between md:justify-center items-center text-left md:text-center flex-shrink-0 gap-3 md:gap-0">
                                
                                {/* Mobile Left: Icon + ID + Status */}
                                <div className="flex items-center md:flex-col gap-3 md:gap-0 min-w-0 flex-1 md:flex-none">
                                    <div className={`w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center border md:mb-3 flex-shrink-0 ${theme.iconBg} ${theme.iconBorder} ${theme.text}`}>
                                        <StatusIcon className={`w-4 h-4 md:w-6 md:h-6 ${config.animate ? 'animate-spin' : ''}`} />
                                    </div>

                                    <div className="flex flex-col md:items-center min-w-0">
                                        <h4 className="font-bold text-slate-900 dark:text-slate-200 text-sm md:text-base truncate">WT-{slot.id}</h4>
                                        
                                        <div className="flex items-center gap-2 md:flex-col md:gap-2 md:mt-2">
                                            <div className={`px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-bold uppercase tracking-wider border ${theme.text} ${theme.iconBg} ${theme.iconBorder}`}>
                                                {config.label}
                                            </div>

                                            {assignedTask && gitStatus && (
                                                <div className={`px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-bold uppercase tracking-wider border flex items-center justify-center gap-1 w-auto md:hidden ${gitStatus.color} ${gitStatus.bg} ${gitStatus.border}`}>
                                                    <GitCommit className="w-3 h-3" />
                                                    {gitStatus.label}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Desktop Only: Extra Details */}
                                <div className="hidden md:flex flex-col items-center gap-2 w-full mt-2">
                                    {assignedTask && gitStatus && (
                                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border flex items-center justify-center gap-1.5 w-auto ${gitStatus.color} ${gitStatus.bg} ${gitStatus.border}`} title="Git Status">
                                            <GitCommit className="w-3 h-3" aria-hidden="true" />
                                            <span aria-label={`Git status: ${gitStatus.label}`}>{gitStatus.label}</span>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => handleCopyWorktreePath(slot.id, slot.path)}
                                        className="text-[10px] text-slate-600 dark:text-slate-400 font-mono mt-3 bg-slate-200 dark:bg-slate-900 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-800 truncate w-full max-w-[150px] mx-auto opacity-70 hover:opacity-100 hover:border-slate-400 dark:hover:border-slate-600 transition-all flex items-center justify-center gap-1.5 group"
                                        aria-label="Copy worktree path to clipboard"
                                        title={copiedPathSlotId === slot.id ? "Copied!" : "Click to copy path"}
                                    >
                                        <span className="truncate">{slot.path}</span>
                                        {copiedPathSlotId === slot.id ? (
                                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden="true" />
                                        ) : (
                                            <Copy className="w-3 h-3 transition-opacity flex-shrink-0" aria-hidden="true" />
                                        )}
                                    </button>

                                    {assignedTask && (
                                        <div className={`mt-3 flex items-center gap-2 text-[10px] font-mono ${theme.text}`}>
                                            <GitBranch className="w-3 h-3" aria-hidden="true" />
                                            <span aria-label={`Branch: ${assignedTask.branchName}`}>{assignedTask.branchName?.replace('feat/', '')}</span>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => handleCleanupClick(slot.id)}
                                        disabled={cleaningSlot === slot.id}
                                        aria-busy={cleaningSlot === slot.id}
                                        aria-label={`Cleanup worktree slot ${slot.id}`}
                                        className={`mt-4 flex items-center gap-2 text-[10px] transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-800 px-2 py-1 rounded-full ${cleaningSlot === slot.id ? 'text-slate-500 dark:text-slate-400' : 'text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400'}`}
                                    >
                                        {cleaningSlot === slot.id ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3 h-3" aria-hidden="true" />}
                                        Cleanup
                                    </button>
                                </div>

                                {/* Mobile Right: Actions */}
                                <div className="md:hidden flex flex-col items-end gap-2">
                                     <button
                                        onClick={() => handleCleanupClick(slot.id)}
                                        disabled={cleaningSlot === slot.id}
                                        aria-busy={cleaningSlot === slot.id}
                                        aria-label={`Cleanup worktree slot ${slot.id}`}
                                        className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 ${cleaningSlot === slot.id ? 'text-slate-500 dark:text-slate-600' : 'text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400'}`}
                                    >
                                        {cleaningSlot === slot.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                                    </button>
                                </div>
                            </div>

                            {/* Content Area */}
                            <div className="flex-1 p-3 md:p-4 relative flex flex-col min-w-0">
                                {!assignedTask ? (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-600 gap-2 py-6 md:py-0">
                                        <FolderGit2 className="w-8 h-8 opacity-20" />
                                        <span className="text-sm">Available for development</span>
                                        {backlog.length > 0 ? (
                                            <button
                                                onClick={() => handleQuickAssignToSlot(slot.id)}
                                                className="mt-2 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-lg shadow-indigo-900/20"
                                                title={`Assign next issue (${backlog[0].title})`}
                                            >
                                                <GitBranch className="w-3 h-3" />
                                                Assign Next Issue
                                            </button>
                                        ) : (
                                            <span className="text-[11px] text-slate-600 dark:text-slate-700">No backlog issue to assign</span>
                                        )}
                                    </div>
                                ) : isInitializing ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600 dark:text-slate-400 py-6 md:py-8">
                                        <div className={`flex items-center gap-2 text-sm font-medium ${theme.text}`}>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Setting up Worktree...
                                        </div>
                                        <div className="w-full max-w-sm bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-3 font-mono text-xs space-y-2 opacity-70">
                                            <p className="text-slate-600 dark:text-slate-400">{'>'} git fetch origin</p>
                                            <p className="text-slate-600 dark:text-slate-400">{'>'} mkdir -p {slot.path}</p>
                                            <p className={`${theme.text} animate-pulse`}>
                                                {'>'} git worktree add {slot.path}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-col sm:flex-row justify-between items-start mb-3 gap-3 md:gap-4">
                                            <div className="min-w-0 pr-0 md:pr-4 w-full sm:w-auto flex-1">
                                                <div className="flex items-center gap-2 mb-1.5 min-w-0">
                                                    {assignedTask.issueNumber && (
                                                        assignedTask.issueUrl ? (
                                                            <a 
                                                                href={assignedTask.issueUrl} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="text-[10px] md:text-xs font-mono bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-500/50 transition-colors flex items-center gap-1.5 flex-shrink-0"
                                                            >
                                                                <span className="opacity-50">Issue</span> #{assignedTask.issueNumber}
                                                            </a>
                                                        ) : (
                                                            <span className="text-[10px] md:text-xs font-mono bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 cursor-default flex-shrink-0">
                                                                <span className="opacity-50">Issue</span> #{assignedTask.issueNumber}
                                                            </span>
                                                        )
                                                    )}
                                                    <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate min-w-0 text-sm md:text-lg">{assignedTask.title}</h3>
                                                </div>
                                                <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 truncate">{assignedTask.description}</p>
                                                {assignedTask.reviewFeedback && (
                                                    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                                                        <span className="font-bold uppercase tracking-wider text-[10px] opacity-70 block mb-1">Feedback</span>
                                                        {assignedTask.reviewFeedback}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto flex-shrink-0" role="toolbar" aria-label="Task actions">

                                                {assignedTask.status === TaskStatus.WORKTREE_ACTIVE && (
                                                    <>
                                                        <button
                                                            onClick={() => copyAgentCommandForTask(assignedTask, slot)}
                                                            className="flex-1 sm:flex-none flex items-center justify-center bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 px-3 py-2 rounded-lg text-xs md:text-sm transition-colors"
                                                            aria-label={copiedCmdTaskId === assignedTask.id ? 'Command copied' : 'Copy agent command'}
                                                        >
                                                            {copiedCmdTaskId === assignedTask.id ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-300" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                                                        </button>
                                                        
                                                        {/* Mobile: Agent actions Group */}
                                                        <div className="flex gap-2 flex-1 sm:contents">
                                                            <button
                                                                onClick={() => handleOpenAgentWorkspaceCmd(slot, assignedTask)}
                                                                disabled={openingAgentWorkspaceSlot === slot.id}
                                                                aria-busy={openingAgentWorkspaceSlot === slot.id}
                                                                aria-label="Open terminal in workspace"
                                                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors shadow-lg shadow-indigo-900/20"
                                                            >
                                                                {openingAgentWorkspaceSlot === slot.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Terminal className="w-4 h-4" aria-hidden="true" />}
                                                                <span className="hidden sm:inline">cmd</span>
                                                                <span className="sm:hidden">CMD</span>
                                                            </button>

                                                            <button
                                                                onClick={() => handleOpenFullAgentIde(slot)}
                                                                disabled={openingFullAgentSlot === slot.id}
                                                                aria-busy={openingFullAgentSlot === slot.id}
                                                                aria-label="Open IDE"
                                                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors shadow-lg shadow-indigo-900/20"
                                                            >
                                                                {openingFullAgentSlot === slot.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Terminal className="w-4 h-4" aria-hidden="true" />}
                                                                <span className="hidden sm:inline">Open IDE</span>
                                                                <span className="sm:hidden">IDE</span>
                                                            </button>
                                                        </div>

                                                        <button
                                                            onClick={() => handleMarkFlowSuccess(assignedTask)}
                                                            aria-label="Mark task as finished"
                                                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20"
                                                        >
                                                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                                            <span className="hidden sm:inline">Finish</span>
                                                            <span className="sm:hidden">Done</span>
                                                        </button>
                                                    </>
                                                )}
                                                {assignedTask.status === TaskStatus.IMPLEMENTED && (
                                                    <button
                                                        onClick={() => handlePush(assignedTask.id)}
                                                        disabled={isPushing}
                                                        aria-busy={isPushing}
                                                        aria-label="Push and create pull request"
                                                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-70 disabled:cursor-not-allowed"
                                                    >
                                                        {isPushing ? (
                                                            <><Loader2 className="w-4 h-4 animate-spin" /> Pushing...</>
                                                        ) : (
                                                            <><CloudUpload className="w-4 h-4" /> Push & Review</>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Code Editor View */}
                                        <div className="flex-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden relative group min-h-[150px] md:min-h-[250px]">
                                            <div className="absolute top-0 left-0 right-0 h-6 bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 flex items-center px-2 gap-1.5">
                                                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                                                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                                                <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50"></div>
                                            </div>
                                            <div className="pt-8 pb-2 px-3 h-full overflow-y-auto font-mono text-xs text-slate-900 dark:text-slate-300">
                                                {assignedTask.status === TaskStatus.IMPLEMENTED || assignedTask.status === TaskStatus.PUSHED ? (
                                                    <pre className="whitespace-pre-wrap"><code className="language-typescript">{assignedTask.implementationDetails}</code></pre>
                                                ) : loadingTask === assignedTask.id ? (
                                                    <div className="h-full flex flex-col items-center justify-center gap-3">
                                                        <div className="relative">
                                                            <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin"></div>
                                                        </div>
                                                        <span className="text-indigo-600 dark:text-indigo-400 animate-pulse">Writing code...</span>
                                                    </div>
                                                ) : (
                                                    <div className="h-full flex flex-col items-center justify-center text-slate-600 dark:text-slate-700 gap-2">
                                                        <span className="opacity-50"># Waiting for implementation...</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
