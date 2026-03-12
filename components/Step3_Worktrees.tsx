import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import { TaskItem, TaskStatus, WorktreeSlot, AppSettings } from '../types';
import { cancelAgentJob, fetchAgentSession, generateImplementationFromAgent, openWorktreeCmdWindow } from '../services/agentService';
import { GitBranch, FolderGit2, Terminal, Loader2, CloudUpload, CheckCircle2, GitCommit, FileDiff, History, X, Command, Trash2, ScrollText, Copy, Check, Server, Radio, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { PRIORITY_BADGES, WORKTREE_STATUS_THEMES } from '../designSystem';
import { useFocusTrap } from './ui/hooks/useFocusTrap';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';

const CODE_SNIPPETS = [
    `// Implementing feature...
async function processData(input: string) {
  const validated = validateInput(input);
  const transformed = transformData(validated);
  
  const result = await fetch('/api/transform', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: transformed })
  });
  
  if (!result.ok) {
    throw new Error(\`Failed: \${result.statusText}\`);
  }
  
  return result.json();
}`,
    `// Processing task...
export const validateInput = (data: unknown): ValidationResult => {
  const schema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    email: z.string().email(),
    metadata: z.record(z.unknown()).optional()
  });
  
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
};`,
    `// Writing implementation...
const handleSubmit = async (values: FormValues) => {
  setIsLoading(true);
  setError(null);
  
  try {
    const result = await saveToDatabase(values);
    await invalidateCache(['items', result.id]);
    toast.success('Saved successfully!');
    navigate(\`/items/\${result.id}\`);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
    toast.error('Failed to save');
  } finally {
    setIsLoading(false);
  }
};

useEffect(() => {
  if (isOpen) fetchData();
}, [isOpen]);`,
    `// Creating handler...
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  
  const [items, total] = await Promise.all([
    db.item.findMany({ skip: (page - 1) * limit, take: limit }),
    db.item.count()
  ]);
  
  return Response.json({
    data: items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
}`
];

const HOST_STATUS_COLLAPSED_KEY = 'flowize.step3.host-status-collapsed.v1';
const BACKLOG_COLLAPSED_KEY = 'flowize.step3.backlog-collapsed.v1';

const MAX_VISIBLE_LINES = 8;

const TypewriterText: React.FC = () => {
    const [displayText, setDisplayText] = useState('');
    const [snippetIndex, setSnippetIndex] = useState(0);
    const [charIndex, setCharIndex] = useState(0);

    const currentSnippet = CODE_SNIPPETS[snippetIndex];

    useEffect(() => {
        const speed = Math.random() * 20 + 10;
        const timer = setTimeout(() => {
            if (charIndex < currentSnippet.length) {
                const nextChar = currentSnippet[charIndex];
                setDisplayText((prev) => {
                    const newText = prev + nextChar;
                    const lines = newText.split('\n');
                    if (lines.length > 50) {
                        return lines.slice(-50).join('\n');
                    }
                    return newText;
                });
                setCharIndex((prev) => prev + 1);
            } else {
                setDisplayText((prev) => prev + '\n\n');
                setCharIndex(0);
                setSnippetIndex((prev) => (prev + 1) % CODE_SNIPPETS.length);
            }
        }, speed);

        return () => clearTimeout(timer);
    }, [charIndex, currentSnippet]);

    const allLines = displayText.split('\n');
    const visibleLines = allLines.length > MAX_VISIBLE_LINES
        ? allLines.slice(-MAX_VISIBLE_LINES)
        : allLines;

    return (
        <div className="text-left w-full px-4 opacity-60 h-32">
            {visibleLines.map((line, i) => (
                <div key={i} className="leading-relaxed whitespace-pre">
                    <span className="text-slate-500 dark:text-slate-500">{line}</span>
                    {i === visibleLines.length - 1 && (
                        <span className="inline-block w-2 h-4 bg-indigo-500/70 ml-0.5 align-middle animate-[blink_1s_step-end_infinite]" />
                    )}
                </div>
            ))}
        </div>
    );
};

interface DraggableIssueCardProps {
    task: TaskItem;
    slots: WorktreeSlot[];
    onAssignToSlot: (taskId: string, slotId: number) => void;
    isSlotAvailable: (slot: WorktreeSlot) => boolean;
}

const DraggableIssueCard: React.FC<DraggableIssueCardProps> = ({ task, slots, onAssignToSlot, isSlotAvailable }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: task.id,
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
    } : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`p-3 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800/50 transition-colors bg-white dark:bg-slate-900/30 group ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            {...listeners}
            {...attributes}
        >
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
                {slots.map(slot => {
                    const slotAvailable = isSlotAvailable(slot);
                    return (
                        <button
                            key={slot.id}
                            disabled={!slotAvailable}
                            onClick={(e) => {
                                e.stopPropagation();
                                onAssignToSlot(task.id, slot.id);
                            }}
                            className={`text-[10px] py-1 px-2 rounded border transition-all  min-w-[44px] ${!slotAvailable
                                ? 'bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-slate-700 border-slate-200 dark:border-slate-800 cursor-not-allowed hidden'
                                : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/40'
                                }`}
                        >
                            WT-{slot.id}
                        </button>
                    );
                })}
                {slots.every(s => !isSlotAvailable(s)) && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-600 italic">No slots available</span>
                )}
            </div>
        </div>
    );
};

interface DroppableSlotWrapperProps {
    slotId: number;
    isOccupied: boolean;
    isDraggingActive: boolean;
    children: React.ReactNode;
}

const DroppableSlotWrapper: React.FC<DroppableSlotWrapperProps> = ({ slotId, isOccupied, isDraggingActive, children }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: slotId.toString(),
        disabled: isOccupied,
    });

    return (
        <div
            ref={setNodeRef}
            className={`flex-1 p-3 md:p-4 relative flex flex-col min-w-0 transition-all ${isOver && !isOccupied
                ? 'bg-indigo-500/10 ring-2 ring-indigo-500 ring-inset'
                : isDraggingActive && !isOccupied
                    ? 'ring-2 ring-dashed ring-indigo-400/50 ring-inset'
                    : ''
                }`}
        >
            {children}
        </div>
    );
};

interface BacklogDroppableZoneProps {
    children: React.ReactNode;
}

const BacklogDroppableZone: React.FC<BacklogDroppableZoneProps> = ({ children }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: 'backlog',
    });

    return (
        <div
            ref={setNodeRef}
            className={`transition-all ${isOver
                ? 'ring-2 ring-orange-500 ring-inset rounded-2xl'
                : ''
                }`}
        >
            {children}
        </div>
    );
};

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
        runState?: 'succeeded' | 'failed' | 'cancelled',
        metadata?: { jobId?: string; sessionId?: string }
    ) => void;
    onRemoteSessionSync?: (taskId: string, payload: {
        logs: string;
        command?: string;
        runState: 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled';
        implementation?: string;
        jobId?: string;
        sessionId?: string;
    }) => void;
    onFinishImplementation: (taskId: string) => Promise<void>;
    onCleanup: (slotId: number) => Promise<void>;
    settings?: AppSettings;
    bridgeHealth?: {
        status: 'checking' | 'healthy' | 'unhealthy';
        endpoint?: string;
        authRequired?: boolean;
        persistence?: boolean;
        dataDir?: string;
        typedActions?: string[];
        metrics?: {
            activeJobs?: number;
            totalJobs?: number;
            runningSessions?: number;
            completedSessions?: number;
            interruptedSessions?: number;
            failedSessions?: number;
            cancelledSessions?: number;
            totalSessions?: number;
        };
        diagnostics?: {
            startedAt?: number;
            uptimeMs?: number;
            host?: string;
            port?: number;
            workdir?: string;
            allowedOrigin?: string;
            dataDir?: string;
            logLevel?: string;
            authRequired?: boolean;
            oauthEnabled?: boolean;
        };
    };
    showToast?: (message: string, tone?: 'info' | 'success' | 'warning' | 'error') => void;
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
    settings,
    bridgeHealth,
    showToast,
    onRemoteSessionSync
}) => {
    const backlog = tasks.filter(t => t.status === TaskStatus.ISSUE_CREATED);

    const isSlotAvailable = (slot: WorktreeSlot): boolean => {
        if (!slot.taskId) return true;
        const taskExists = tasks.some(t => t.id === slot.taskId);
        return !taskExists;
    };

    const [loadingTask, setLoadingTask] = useState<string | null>(null);
    const [pushingTask, setPushingTask] = useState<string | null>(null);
    const [cleaningSlot, setCleaningSlot] = useState<number | null>(null);
    const [openingAgentWorkspaceSlot, setOpeningAgentWorkspaceSlot] = useState<number | null>(null);
    const [openingFullAgentSlot, setOpeningFullAgentSlot] = useState<number | null>(null);
    const [selectedIde, setSelectedIde] = useState<'antigravity' | 'intellij'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('flowize-selected-ide');
            if (saved === 'antigravity' || saved === 'intellij') return saved;
        }
        return 'antigravity';
    });
    const [openIdeDropdownSlot, setOpenIdeDropdownSlot] = useState<number | null>(null);
    const [copiedCmdTaskId, setCopiedCmdTaskId] = useState<string | null>(null);
    const [copiedPathSlotId, setCopiedPathSlotId] = useState<number | null>(null);
    const ideDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (openIdeDropdownSlot === null) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (ideDropdownRef.current && !ideDropdownRef.current.contains(event.target as Node)) {
                setOpenIdeDropdownSlot(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openIdeDropdownSlot]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('flowize-selected-ide', selectedIde);
        }
    }, [selectedIde]);

    // Terminal State
    const [activeTerminalSlotId, setActiveTerminalSlotId] = useState<number | null>(null);
    const [activeAgentConsoleSlotId, setActiveAgentConsoleSlotId] = useState<number | null>(null);
    const [runningAgentTaskId, setRunningAgentTaskId] = useState<string | null>(null);
    const [runningAgentJobIdByTask, setRunningAgentJobIdByTask] = useState<Record<string, string>>({});
    const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);
    const [copiedAgentCommandTaskId, setCopiedAgentCommandTaskId] = useState<string | null>(null);
    const [liveAgentLogs, setLiveAgentLogs] = useState<Record<string, string>>({});
    const [resumingTaskId, setResumingTaskId] = useState<string | null>(null);
    const [isHostStatusCollapsed, setIsHostStatusCollapsed] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }

        try {
            return window.localStorage.getItem(HOST_STATUS_COLLAPSED_KEY) === 'true';
        } catch {
            return false;
        }
    });
    const [isBacklogCollapsed, setIsBacklogCollapsed] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        try {
            return window.localStorage.getItem(BACKLOG_COLLAPSED_KEY) === 'true';
        } catch {
            return false;
        }
    });
    const [terminalHistory, setTerminalHistory] = useState<TerminalLine[]>([]);
    const terminalEndRef = useRef<HTMLDivElement>(null);
    const agentConsoleEndRef = useRef<HTMLDivElement>(null);
    const tasksRef = useRef(tasks);
    useEffect(() => { tasksRef.current = tasks; }, [tasks]);
    // Per-task AbortController so handleCancelAgent can stop the running pollAsyncJob loop.
    const agentAbortControllers = useRef<Record<string, AbortController>>({});

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        try {
            window.localStorage.setItem(HOST_STATUS_COLLAPSED_KEY, String(isHostStatusCollapsed));
        } catch {
            // Ignore localStorage failures.
        }
    }, [isHostStatusCollapsed]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        try {
            window.localStorage.setItem(BACKLOG_COLLAPSED_KEY, String(isBacklogCollapsed));
        } catch {
            // Ignore localStorage failures.
        }
    }, [isBacklogCollapsed]);

    // Drag and Drop State
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // 8px threshold to distinguish drag from click
            },
        })
    );

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

        const controller = new AbortController();
        agentAbortControllers.current[task.id] = controller;

        try {
            const result = await generateImplementationFromAgent(task, slot, settings, (progress) => {
                setLiveAgentLogs((prev) => ({ ...prev, [task.id]: progress.logs }));
                if (progress.jobId) {
                    setRunningAgentJobIdByTask((prev) => ({ ...prev, [task.id]: progress.jobId as string }));
                }
            }, controller.signal);
            onImplement(
                task.id,
                result.implementation,
                result.logs,
                result.command,
                result.success,
                result.cancelled ? 'cancelled' : (result.success ? 'succeeded' : 'failed'),
                { jobId: result.jobId, sessionId: result.sessionId }
            );
        } catch (error) {
            // CancelledError is thrown when the user presses Cancel — treat as cancelled, not failed.
            const isCancelled = error instanceof Error && error.name === 'CancelledError';
            if (isCancelled) {
                // handleCancelAgent has already called onImplement with 'cancelled'; nothing more to do.
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            const fallbackLogs = `Sub-agent execution crashed before completion.\nError: ${message}`;
            onImplement(task.id, fallbackLogs, fallbackLogs, '', false, 'failed');
        } finally {
            delete agentAbortControllers.current[task.id];
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
        const task = tasks.find((item) => item.id === taskId);
        const jobId = runningAgentJobIdByTask[taskId] || task?.agentJobId;
        if (!jobId) {
            return;
        }
        setCancellingTaskId(taskId);
        try {
            // Abort the in-flight pollAsyncJob loop first so it stops immediately and
            // does not retry other bridge candidates or spawn a new process.
            agentAbortControllers.current[taskId]?.abort();

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

    const handleOpenAgentConsole = (task: TaskItem, slot: WorktreeSlot) => {
        if (!task.agentLogs && !liveAgentLogs[task.id] && !task.agentSessionId) {
            showToast?.('No remote logs are available for this task yet.', 'warning');
            return;
        }

        setActiveAgentConsoleSlotId(slot.id);
    };

    const syncTaskFromRemoteSession = useCallback(async (
        task: TaskItem,
        slot: WorktreeSlot,
        options?: { openConsole?: boolean; showErrors?: boolean }
    ) => {
        if (!task.agentSessionId) {
            return null;
        }

        try {
            const session = await fetchAgentSession(settings, task.agentSessionId);
            const logs = buildResumeLogs(task.agentLastCommand || session.command || '', session);
            const runState = mapSessionStatusToRunState(session.status, session.done, session.exitCode, session.success);
            const implementation = runState === 'succeeded'
                ? (session.stdout?.trim() || task.implementationDetails || 'Remote run completed successfully.')
                : (task.implementationDetails || '');

            setLiveAgentLogs((prev) => ({ ...prev, [task.id]: logs }));
            if (session.jobId) {
                setRunningAgentJobIdByTask((prev) => ({ ...prev, [task.id]: session.jobId as string }));
            }

            if (runState === 'running') {
                setRunningAgentTaskId(task.id);
            } else {
                setRunningAgentTaskId((current) => current === task.id ? null : current);
            }

            if (options?.openConsole) {
                setActiveAgentConsoleSlotId(slot.id);
            }

            onRemoteSessionSync?.(task.id, {
                logs,
                command: task.agentLastCommand || session.command || '',
                runState,
                implementation,
                jobId: session.jobId,
                sessionId: session.sessionId || task.agentSessionId
            });

            return { session, runState, logs };
        } catch (error) {
            if (options?.showErrors !== false) {
                const message = error instanceof Error ? error.message : String(error);
                showToast?.(`Failed to resume remote run.\n${message}`, 'error');
            }
            return null;
        }
    }, [onRemoteSessionSync, settings, showToast]);

    const mapSessionStatusToRunState = (status?: string, done?: boolean, exitCode?: number, success?: boolean): 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled' => {
        if (status === 'running' && done !== true) return 'running';
        if (status === 'completed' || (done === true && success === true && (exitCode ?? 0) === 0)) return 'succeeded';
        if (status === 'cancelled' || exitCode === 130) return 'cancelled';
        if (status === 'interrupted') return 'failed';
        if (done === true && success === true) return 'succeeded'; // guard against running+done race
        if (status === 'failed' || done === true) return 'failed';
        return 'idle';
    };

    const buildResumeLogs = (command: string, session: Awaited<ReturnType<typeof fetchAgentSession>>): string => {
        const runState = session.done === true
            ? (session.success === true ? 'completed' : (session.exitCode === 130 ? 'cancelled' : 'failed'))
            : (session.status || 'running');
        const stdout = session.stdout?.trim() ? session.stdout : '<empty>';
        const stderr = session.stderr?.trim() ? session.stderr : '<empty>';
        return [
            `Session: ${session.sessionId || 'unknown'}`,
            `Job: ${session.jobId || 'unknown'}`,
            `Command: ${command || session.command || '<unknown>'}`,
            `State: ${runState}${typeof session.pid === 'number' ? ` | PID ${session.pid}` : ''}`,
            '',
            `STDOUT:\n${stdout}`,
            '',
            `STDERR:\n${stderr}`,
            '',
            `Exit Code: ${typeof session.exitCode === 'number' ? session.exitCode : 'running'}`
        ].join('\n');
    };

    const handleResumeAgent = async (task: TaskItem, slot: WorktreeSlot) => {
        if (!task.agentSessionId) {
            showToast?.('No remote session is stored for this task yet.', 'warning');
            return;
        }

        setResumingTaskId(task.id);

        try {
            await syncTaskFromRemoteSession(task, slot, { openConsole: true, showErrors: true });
        } finally {
            setResumingTaskId((current) => current === task.id ? null : current);
        }
    };

    useEffect(() => {
        if (!onRemoteSessionSync) return;
        if (!settings?.agentEndpoint) return;

        const tasksWithSessions = tasks.filter((task) => task.agentSessionId);
        if (tasksWithSessions.length === 0) return;

        let cancelled = false;

        const reconcileAllSessions = async () => {
            for (const task of tasksWithSessions) {
                const slot = slots.find((item) => item.taskId === task.id);
                if (!slot || !task.agentSessionId || cancelled) continue;

                await syncTaskFromRemoteSession(task, slot, { showErrors: false });
            }
        };

        const pollRunningSessions = async () => {
            const runningTasks = tasksRef.current.filter((task) => task.agentSessionId && task.agentRunState === 'running');
            for (const task of runningTasks) {
                const slot = slots.find((item) => item.taskId === task.id);
                if (!slot || !task.agentSessionId || cancelled) continue;
                await syncTaskFromRemoteSession(task, slot, { showErrors: false });
            }
        };

        reconcileAllSessions();
        const timer = window.setInterval(pollRunningSessions, 4000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [onRemoteSessionSync, settings, slots, syncTaskFromRemoteSession]); // tasks read via tasksRef to avoid restarting the interval on every task update

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
        const template = settings?.agentCommand?.trim();
        if (!template || !task.issueNumber || !task.branchName) return '';

        const subdir = settings?.agentSubdir?.trim() || '.agent-workspace';
        const agentWorkspace = joinPath(slot.path, subdir.replace(/^[\\/]+/, ''));
        const issueDescriptionFile = joinPath(agentWorkspace, 'issue-description.md');
        const skillFile = joinPath(agentWorkspace, 'SKILL.md');
        const agentName = settings?.agentName?.trim() || '';

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

        const success = await copyToClipboard(command);
        if (success) {
            setCopiedCmdTaskId(task.id);
            setTimeout(() => {
                setCopiedCmdTaskId((current) => current === task.id ? null : current);
            }, 1500);
        }
        return success;
    };

    const handleOpenAgentWorkspaceCmd = async (slot: WorktreeSlot, task?: TaskItem) => {
        copyAgentCommandForTask(task, slot);
        setOpeningAgentWorkspaceSlot(slot.id);
        const workspaceSubdir = settings?.agentSubdir?.trim() || '.agent-workspace';
        const agentName = settings?.agentName?.trim();
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

            let userMessage = `Failed to open Anti-Gravity workspace for this slot.\n\n${message}`;

            if (message.includes('does not exist')) {
                userMessage += '\n\nThe worktree directory may have been deleted or never created.\n\nSuggestions:\n1. Click "Cleanup" to release this slot\n2. Re-assign the task to create a fresh worktree\n3. Check that slot.path is correct: ' + slot.path;
            }

            showToast?.(userMessage, 'error');
        } finally {
            setOpeningAgentWorkspaceSlot((current) => (current === slot.id ? null : current));
        }
    };

    const handleOpenFullAgentIde = async (slot: WorktreeSlot, ide: 'antigravity' | 'intellij' = 'antigravity') => {
        setOpeningFullAgentSlot(slot.id);

        try {
            await openWorktreeCmdWindow(settings, slot, {
                title: `Flowize AG-FULL-${slot.id}`,
                launchAntigravity: ide === 'antigravity',
                launchIntellij: ide === 'intellij',
                ideaHome: settings?.ideaHome,
                closeAfterStartup: true
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to open IDE:', error);
            showToast?.(`Failed to open IDE for this slot.\n${message}`, 'error');
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
    const activeAgentJobId = activeAgentTask ? (runningAgentJobIdByTask[activeAgentTask.id] || activeAgentTask.agentJobId) : undefined;
    const activeAgentLogs = activeAgentTask
        ? (runningAgentTaskId === activeAgentTask.id
            ? (liveAgentLogs[activeAgentTask.id] || activeAgentTask.agentLogs || '')
            : (activeAgentTask.agentLogs || liveAgentLogs[activeAgentTask.id] || ''))
        : '';

    // Scroll to bottom of agent console when logs change
    useEffect(() => {
        agentConsoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeAgentLogs]);

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
    const remoteSessionTasks = tasks
        .filter((task) => task.agentSessionId)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const activeRemoteSessionCount = bridgeHealth?.metrics?.runningSessions ?? tasks.filter((task) => task.agentRunState === 'running' && task.agentSessionId).length;
    const hostReady = bridgeHealth?.status === 'healthy';
    const bridgeCapabilities = bridgeHealth?.typedActions || [];

    const handleCopyActiveAgentCommand = async () => {
        if (!activeAgentTask?.id || !activeAgentCommand) {
            return;
        }
        const taskId = activeAgentTask.id;

        const success = await copyToClipboard(activeAgentCommand);
        if (success) {
            setCopiedAgentCommandTaskId(taskId);
            setTimeout(() => {
                setCopiedAgentCommandTaskId((current) => current === taskId ? null : current);
            }, 1500);
        }
    };

    const copyToClipboard = async (text: string): Promise<boolean> => {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                // Fall through to fallback
            }
        }
        // Fallback for environments where clipboard API is not available
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            textArea.style.top = '-9999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const result = document.execCommand('copy');
            document.body.removeChild(textArea);
            return result;
        } catch {
            return false;
        }
    };

    const handleCopyWorktreePath = async (slotId: number, path: string) => {
        const success = await copyToClipboard(path);
        if (success) {
            setCopiedPathSlotId(slotId);
            setTimeout(() => {
                setCopiedPathSlotId((current) => current === slotId ? null : current);
            }, 1500);
        }
    };

    // Drag and Drop Handlers
    const handleDragStart = (event: DragStartEvent) => {
        setActiveTaskId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTaskId(null);

        if (!over) return;

        // If dropped in the backlog zone, don't assign
        if (over.id === 'backlog') {
            return;
        }

        const taskId = active.id as string;
        const slotId = parseInt(over.id as string);

        const slot = slots.find(s => s.id === slotId);
        if (slot && isSlotAvailable(slot)) {
            onAssignToSlot(taskId, slotId);
        }
    };

    const handleDragCancel = () => {
        setActiveTaskId(null);
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 relative">

                <div className="xl:col-span-4 bg-slate-100 dark:bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <h3 className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                <Server className={`w-4 h-4 ${hostReady ? 'text-emerald-600 dark:text-emerald-400' : bridgeHealth?.status === 'checking' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`} aria-hidden="true" />
                                Host Status
                            </h3>
                            {!isHostStatusCollapsed && (
                                <p className="hidden md:inline text-xs text-slate-600 dark:text-slate-400 mt-1">
                                    Always-on PC readiness for remote worktree execution and review.
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <div className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${hostReady
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : bridgeHealth?.status === 'checking'
                                    ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300'
                                    : 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300'
                                }`}>
                                {hostReady ? 'Host ready' : bridgeHealth?.status === 'checking' ? 'Checking host...' : 'Host offline'}
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsHostStatusCollapsed((prev) => !prev)}
                                className="ml-1 inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                                aria-label={isHostStatusCollapsed ? 'Expand host status' : 'Collapse host status'}
                                title={isHostStatusCollapsed ? 'Expand host status' : 'Collapse host status'}
                            >
                                {isHostStatusCollapsed ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronUp className="w-4 h-4" aria-hidden="true" />}
                            </button>
                        </div>
                    </div>

                    {!isHostStatusCollapsed && (
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/60 p-3">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500 font-semibold">Bridge</div>
                                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {bridgeHealth?.status === 'healthy' ? 'Connected' : bridgeHealth?.status === 'checking' ? 'Checking' : 'Unavailable'}
                                </div>
                                <div className="mt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400 break-all">
                                    {bridgeHealth?.endpoint || settings?.agentEndpoint || 'No endpoint'}
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/60 p-3">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500 font-semibold">Persistence</div>
                                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {bridgeHealth?.persistence ? 'Enabled' : 'Unknown'}
                                </div>
                                <div className="mt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400 break-all">
                                    {bridgeHealth?.dataDir || 'Awaiting bridge health'}
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/60 p-3">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500 font-semibold">Remote Runs</div>
                                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {activeRemoteSessionCount} active / {(bridgeHealth?.metrics?.totalSessions ?? remoteSessionTasks.length)} tracked
                                </div>
                                <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                                    {bridgeCapabilities.includes('flowize-run-agent') && bridgeCapabilities.includes('flowize-push-worktree-branch')
                                        ? 'Run + push actions available from phone.'
                                        : 'Waiting for full typed remote capabilities.'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

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
                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800 h-[600px] max-h-[85vh]"
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
                                    className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors min-w-[44px]  flex items-center justify-center"
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
                                                className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 transition-all active:scale-95 group "
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
                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800 h-[600px] max-h-[85vh]"
                        >
                            <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-2">
                                <div className="flex gap-3">
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
                                    {activeAgentTask && runningAgentTaskId === activeAgentTask.id && activeAgentJobId && (
                                        <button
                                            onClick={() => handleCancelAgent(activeAgentTask.id)}
                                            disabled={cancellingTaskId === activeAgentTask.id}
                                            aria-busy={cancellingTaskId === activeAgentTask.id}
                                            className="text-[11px] px-2.5 py-1 rounded border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 hover:bg-red-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                            {cancellingTaskId === activeAgentTask.id ? 'Cancelling...' : 'Cancel'}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setActiveAgentConsoleSlotId(null)}
                                        className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors min-w-[44px] flex items-center justify-center"
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
                                {cancellingTaskId && activeAgentTask?.id === cancellingTaskId
                                    ? 'Agent status: cancelling...'
                                    : runningAgentTaskId && activeAgentTask?.id === runningAgentTaskId
                                        ? 'Agent status: running...'
                                        : `Agent status: ${activeAgentTask?.agentRunState || 'idle'}`}
                                {activeAgentTask?.agentSessionId ? `  session=${activeAgentTask.agentSessionId}` : ''}
                                {activeAgentJobId ? `  job=${activeAgentJobId}` : ''}
                            </div>

                            <div
                                className="flex-1 bg-slate-100 dark:bg-black/50 p-4 font-mono text-xs overflow-y-auto custom-scrollbar whitespace-pre-wrap text-slate-900 dark:text-slate-300"
                                role="log"
                                aria-live="polite"
                                aria-label="Agent output logs"
                            >
                                {runningAgentTaskId && activeAgentTask?.id === runningAgentTaskId
                                    ? (activeAgentLogs || 'Starting sub-agent...\nWaiting for command output...')
                                    : (activeAgentLogs || 'No remote logs yet. Use Run Remotely to execute this issue on the always-on PC and capture logs here.')}
                                <div ref={agentConsoleEndRef} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Backlog Column */}
                <BacklogDroppableZone>
                    <div className={`xl:col-span-1 bg-slate-100 dark:bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden ${isBacklogCollapsed ? '' : 'h-full min-h-[460px] xl:max-h-[calc(100vh-12rem)]'}`}>
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 flex-shrink-0">
                            <h3 className="font-semibold text-slate-900 dark:text-slate-300 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <GitBranch className="w-4 h-4 text-orange-600 dark:text-orange-400" /> Backlog
                                    {backlog.length > 0 && (
                                        <span className="ml-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium">
                                            {backlog.length}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsBacklogCollapsed((prev) => !prev)}
                                        className="ml-1 inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                                        aria-label={isBacklogCollapsed ? 'Expand issue backlog' : 'Collapse issue backlog'}
                                        title={isBacklogCollapsed ? 'Expand issue backlog' : 'Collapse issue backlog'}
                                    >
                                        {isBacklogCollapsed ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronUp className="w-4 h-4" aria-hidden="true" />}
                                    </button>
                                </div>
                            </h3>
                            {!isBacklogCollapsed && (
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                    Assign issues to available worktree slots.
                                </p>
                            )}
                        </div>
                        {!isBacklogCollapsed && (
                            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                                {backlog.length === 0 ? (
                                    <div className="text-center text-slate-500 dark:text-slate-600 text-sm mt-10 p-4">
                                        Backlog empty. <br />Sync issues from previous step.
                                    </div>
                                ) : (
                                    backlog.map(task => (
                                        <DraggableIssueCard
                                            key={task.id}
                                            task={task}
                                            slots={slots}
                                            onAssignToSlot={onAssignToSlot}
                                            isSlotAvailable={isSlotAvailable}
                                        />
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </BacklogDroppableZone>

                {remoteSessionTasks.length > 0 && (
                    <div className="xl:col-span-4 bg-slate-100 dark:bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                    <Radio className="w-4 h-4 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
                                    Remote Sessions
                                </h3>
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                    Run headless on the always-on PC, then reconnect from this device any time.
                                </p>
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-500">
                                {remoteSessionTasks.length} tracked
                            </div>
                        </div>
                        <div className="p-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
                            {remoteSessionTasks.map((task) => {
                                const slot = slots.find((item) => item.taskId === task.id);
                                const tone = task.agentRunState === 'running'
                                    ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                                    : task.agentRunState === 'succeeded'
                                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                        : task.agentRunState === 'cancelled'
                                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                            : task.agentRunState === 'failed'
                                                ? 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300'
                                                : 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300';

                                return (
                                    <div key={task.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/60 p-3 flex flex-col gap-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500 font-semibold">
                                                    {slot ? `WT-${slot.id}` : 'Detached Session'}
                                                </div>
                                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{task.title}</div>
                                                <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono truncate">
                                                    {task.branchName || 'unknown-branch'}
                                                </div>
                                            </div>
                                            <div className={`rounded-md border px-2 py-1 text-[10px] font-mono whitespace-nowrap ${tone}`}>
                                                {task.agentRunState || 'idle'}
                                            </div>
                                        </div>

                                        <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 space-y-1">
                                            <div className="truncate">session={task.agentSessionId}</div>
                                            {task.agentJobId && <div className="truncate">job={task.agentJobId}</div>}
                                        </div>

                                        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Remote session actions">
                                            {slot && (
                                                <button
                                                    onClick={() => handleResumeAgent(task, slot)}
                                                    disabled={resumingTaskId === task.id}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed "
                                                >
                                                    {resumingTaskId === task.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
                                                    Reconnect
                                                </button>
                                            )}
                                            {slot && (
                                                <button
                                                    onClick={() => handleOpenAgentConsole(task, slot)}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 text-xs font-medium transition-colors "
                                                >
                                                    <ScrollText className="w-4 h-4" aria-hidden="true" />
                                                    Open Console
                                                </button>
                                            )}
                                            {(task.agentRunState === 'running') && (runningAgentJobIdByTask[task.id] || task.agentJobId) && (
                                                <button
                                                    onClick={() => handleCancelAgent(task.id)}
                                                    disabled={cancellingTaskId === task.id}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20 text-xs font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed "
                                                >
                                                    {cancellingTaskId === task.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <X className="w-4 h-4" aria-hidden="true" />}
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Worktree Slots Area */}
                <div className="xl:col-span-3 flex flex-col gap-4 h-full min-h-[460px] overflow-y-auto custom-scrollbar pr-1 xl:pr-2 max-h-[calc(100vh-12rem)]">
                    {slots.map((slot) => {
                        const assignedTask = tasks.find(t => t.id === slot.taskId);
                        const isInitializing = assignedTask?.status === TaskStatus.WORKTREE_INITIALIZING;
                        const isPushing = pushingTask === assignedTask?.id;
                        const remoteSessionTone = assignedTask?.agentRunState === 'running'
                            ? 'text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 border-cyan-500/20'
                            : assignedTask?.agentRunState === 'succeeded'
                                ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                                : assignedTask?.agentRunState === 'cancelled'
                                    ? 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20'
                                    : assignedTask?.agentRunState === 'failed'
                                        ? 'text-red-700 dark:text-red-300 bg-red-500/10 border-red-500/20'
                                        : 'text-slate-600 dark:text-slate-400 bg-slate-500/10 border-slate-500/20';

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
                                            className="text-[10px] text-slate-600 dark:text-slate-400 font-mono mt-3 bg-slate-200 dark:bg-slate-900 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-800 truncate w-full max-w-[150px] mx-auto opacity-70 hover:opacity-100 hover:border-slate-400 dark:hover:border-slate-600 transition-all flex items-center justify-center gap-1.5 group "
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
                                            className={`mt-4 flex items-center gap-2 text-[10px] transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-800 px-2 py-1 rounded-full  ${cleaningSlot === slot.id ? 'text-slate-500 dark:text-slate-400' : 'text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400'}`}
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
                                            className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 min-w-[44px]  flex items-center justify-center ${cleaningSlot === slot.id ? 'text-slate-500 dark:text-slate-600' : 'text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400'}`}
                                        >
                                            {cleaningSlot === slot.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Content Area */}
                                <DroppableSlotWrapper slotId={slot.id} isOccupied={!isSlotAvailable(slot)} isDraggingActive={!!activeTaskId}>
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
                                            <div className="flex flex-col sm:flex-row flex-wrap justify-between items-start mb-3 gap-3 md:gap-4">
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
                                                        <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate min-w-0 text-sm md:text-lg" title={assignedTask.title}>{assignedTask.title}</h3>
                                                    </div>
                                                    <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 truncate" title={assignedTask.description}>{assignedTask.description}</p>
                                                    {assignedTask.agentSessionId && (
                                                        <div className={`mt-2 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[10px] font-mono ${remoteSessionTone}`}>
                                                            <ScrollText className="w-3 h-3" aria-hidden="true" />
                                                            <span>{assignedTask.agentRunState === 'running' ? 'Remote run active' : `Remote run ${assignedTask.agentRunState || 'idle'}`}</span>
                                                            <span className="opacity-70">{assignedTask.agentSessionId}</span>
                                                        </div>
                                                    )}
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
                                                            <div className="w-full flex flex-col gap-2">
                                                                <div className="flex gap-2 justify-between">
                                                                    {assignedTask.agentSessionId && (
                                                                        <button
                                                                            onClick={() => handleResumeAgent(assignedTask, slot)}
                                                                            disabled={resumingTaskId === assignedTask.id}
                                                                            aria-busy={resumingTaskId === assignedTask.id}
                                                                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors shadow-lg shadow-cyan-900/20 disabled:opacity-70 disabled:cursor-not-allowed"
                                                                            aria-label="Resume remote run"
                                                                        >
                                                                            {resumingTaskId === assignedTask.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ScrollText className="w-4 h-4" aria-hidden="true" />}
                                                                            <span className="hidden sm:inline">Resume Run</span>
                                                                            <span className="sm:hidden">Resume</span>
                                                                        </button>
                                                                    )}

                                                                    {(assignedTask.agentLogs || liveAgentLogs[assignedTask.id] || assignedTask.agentSessionId) && (
                                                                        <button
                                                                            onClick={() => handleOpenAgentConsole(assignedTask, slot)}
                                                                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 px-3 py-2 rounded-lg text-xs md:text-sm transition-colors"
                                                                            aria-label="Open live logs"
                                                                        >
                                                                            <ScrollText className="w-4 h-4" aria-hidden="true" />
                                                                            <span>Logs</span>
                                                                        </button>
                                                                    )}

                                                                    <button
                                                                        onClick={() => handleImplement(assignedTask, slot)}
                                                                        disabled={loadingTask === assignedTask.id || assignedTask.agentRunState === 'running'}
                                                                        aria-busy={loadingTask === assignedTask.id || assignedTask.agentRunState === 'running'}
                                                                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors shadow-lg shadow-indigo-900/20 disabled:opacity-70 disabled:cursor-not-allowed"
                                                                        aria-label="Run remotely"
                                                                    >
                                                                        {(loadingTask === assignedTask.id || assignedTask.agentRunState === 'running') ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Radio className="w-4 h-4" aria-hidden="true" />}
                                                                        <span className="hidden md:inline">Run Remotely</span>
                                                                        <span className="md:hidden">Run</span>
                                                                    </button>
                                                                </div>

                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => copyAgentCommandForTask(assignedTask, slot)}
                                                                        className="flex-1 sm:flex-none flex items-center justify-center bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 px-3 py-2 rounded-lg text-xs md:text-sm transition-colors"
                                                                        aria-label={copiedCmdTaskId === assignedTask.id ? 'Command copied' : 'Copy remote command'}
                                                                    >
                                                                        {copiedCmdTaskId === assignedTask.id ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-300" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                                                                    </button>

                                                                    {/* Mobile: Agent actions Group */}
                                                                    <div className="flex gap-2 flex-1 sm:contents">
                                                                        <div ref={ideDropdownRef} className="relative inline-flex flex-1 sm:flex-none">
                                                                            <button
                                                                                onClick={() => handleOpenFullAgentIde(slot, selectedIde)}
                                                                                disabled={openingFullAgentSlot === slot.id}
                                                                                aria-busy={openingFullAgentSlot === slot.id}
                                                                                aria-label="Open local IDE"
                                                                                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-l-lg text-xs md:text-sm font-medium transition-colors shadow-lg shadow-indigo-900/20 h-full"
                                                                            >
                                                                                {openingFullAgentSlot === slot.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Terminal className="w-4 h-4" aria-hidden="true" />}
                                                                                <span>IDE</span>
                                                                            </button>
                                                                            <div className="relative h-full">
                                                                                <button
                                                                                    onClick={() => setOpenIdeDropdownSlot(openIdeDropdownSlot === slot.id ? null : slot.id)}
                                                                                    className="h-full px-2 bg-indigo-700 hover:bg-indigo-600 rounded-r-lg flex items-center border-l border-indigo-500"
                                                                                    disabled={openingFullAgentSlot === slot.id}
                                                                                >
                                                                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                                                </button>
                                                                                {openIdeDropdownSlot === slot.id && (
                                                                                    <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/95 shadow-2xl min-w-[140px] overflow-hidden">
                                                                                        <button
                                                                                            onClick={() => { setSelectedIde('antigravity'); setOpenIdeDropdownSlot(null); }}
                                                                                            className={`w-full text-left px-3 py-2 text-xs transition-colors ${selectedIde === 'antigravity' ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-900 dark:text-slate-200'}`}
                                                                                        >
                                                                                            Antigravity
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                if (settings?.ideaHome) {
                                                                                                    setSelectedIde('intellij');
                                                                                                    setOpenIdeDropdownSlot(null);
                                                                                                }
                                                                                            }}
                                                                                            disabled={!settings?.ideaHome}
                                                                                            className={`w-full text-left px-3 py-2 text-xs transition-colors ${selectedIde === 'intellij' ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-900 dark:text-slate-200'} ${!settings?.ideaHome ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                                        >
                                                                                            IntelliJ {!settings?.ideaHome && <span className="text-[10px]">(see settings)</span>}
                                                                                        </button>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
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
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                    {(assignedTask.status === TaskStatus.IMPLEMENTED || assignedTask.status === TaskStatus.PUSHED) && (
                                                        <>
                                                            {(assignedTask.agentLogs || liveAgentLogs[assignedTask.id] || assignedTask.agentSessionId) && (
                                                                <button
                                                                    onClick={() => handleOpenAgentConsole(assignedTask, slot)}
                                                                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 px-4 py-2 rounded-lg text-xs md:text-sm transition-colors"
                                                                    aria-label="Open live logs"
                                                                >
                                                                    <ScrollText className="w-4 h-4" aria-hidden="true" />
                                                                    Logs
                                                                </button>
                                                            )}

                                                            {assignedTask.status === TaskStatus.IMPLEMENTED && (
                                                                <button
                                                                    onClick={() => handlePush(assignedTask.id)}
                                                                    disabled={isPushing}
                                                                    aria-busy={isPushing}
                                                                    aria-label="Push remotely and continue review"
                                                                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-70 disabled:cursor-not-allowed"
                                                                >
                                                                    {isPushing ? (
                                                                        <><Loader2 className="w-4 h-4 animate-spin" /> Remote push...</>
                                                                    ) : (
                                                                        <><CloudUpload className="w-4 h-4" /> Push Remotely</>
                                                                    )}
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Code Editor View */}
                                            <div
                                                onClick={assignedTask.status === TaskStatus.WORKTREE_ACTIVE && openingAgentWorkspaceSlot !== slot.id ? () => handleOpenAgentWorkspaceCmd(slot, assignedTask) : undefined}
                                                className={`flex-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden relative group h-48 group ${assignedTask.status === TaskStatus.WORKTREE_ACTIVE && openingAgentWorkspaceSlot !== slot.id
                                                    ? 'cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-600 hover:ring-2 hover:ring-indigo-400/30 dark:hover:ring-indigo-600/30 transition-all'
                                                    : ''
                                                    }`}
                                            >
                                                <div className="absolute top-0 left-0 right-0 h-6 bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 flex items-center px-2 gap-1.5">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50"></div>
                                                    {assignedTask.status === TaskStatus.WORKTREE_ACTIVE && (
                                                        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                                                            {openingAgentWorkspaceSlot === slot.id ? (
                                                                <>
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                    <span>Opening local shell...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Terminal className="w-3 h-3 group-hover:text-indigo-400" />
                                                                    <span className="group-hover:text-indigo-400 group-hover:font-semibold">Open local shell</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="pt-8 pb-2 px-3 h-full overflow-y-auto font-mono text-xs text-slate-900 dark:text-slate-300">
                                                    {assignedTask.status === TaskStatus.IMPLEMENTED || assignedTask.status === TaskStatus.PUSHED ? (
                                                        <pre className="whitespace-pre-wrap"><code className="language-typescript">{assignedTask.implementationDetails}</code></pre>
                                                    ) : cancellingTaskId === assignedTask.id ? (
                                                        <div className="h-full flex flex-col items-center justify-center gap-3">
                                                            <span className="text-slate-500 dark:text-slate-400 text-xs font-mono">Cancelling...</span>
                                                        </div>
                                                    ) : loadingTask === assignedTask.id ? (
                                                        <div className="h-full flex flex-col items-center justify-center gap-3">
                                                            <div className="relative">
                                                                <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin"></div>
                                                            </div>
                                                            <span className="text-indigo-600 dark:text-indigo-400 animate-pulse">Running remotely...</span>
                                                        </div>
                                                    ) : (
                                                        <div className="h-full flex flex-col items-start justify-start pt-2 text-slate-600 dark:text-slate-700 font-mono overflow-hidden">
                                                            <TypewriterText />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </DroppableSlotWrapper>
                            </div>
                        );
                    })}
                </div>
            </div>
            <DragOverlay>
                {activeTaskId ? (
                    <div className="p-3 border-2 border-indigo-500 rounded-xl bg-white dark:bg-slate-900/90 shadow-2xl opacity-90 cursor-grabbing">
                        {(() => {
                            const task = tasks.find(t => t.id === activeTaskId);
                            if (!task) return null;
                            return (
                                <>
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
                                            <div
                                                key={slot.id}
                                                className={`text-[10px] py-1 px-2 rounded border transition-all ${!isSlotAvailable(slot)
                                                    ? 'bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-slate-700 border-slate-200 dark:border-slate-800 cursor-not-allowed hidden'
                                                    : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20'
                                                    }`}
                                            >
                                                WT-{slot.id}
                                            </div>
                                        ))}
                                        {slots.every(s => !isSlotAvailable(s)) && (
                                            <span className="text-[10px] text-slate-500 dark:text-slate-600 italic">No slots available</span>
                                        )}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};
