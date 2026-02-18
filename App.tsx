import React, { useState, useEffect, useRef } from 'react';
import { STEPS } from './constants';
import { TaskItem, TaskStatus, WorktreeSlot, AppSettings } from './types';
import { Step1_Input } from './components/Step1_Input';
import { Step2_Issues } from './components/Step2_Issues';
import { Step3_Worktrees } from './components/Step3_Worktrees';
import { Step5_Review } from './components/Step5_Review';
import { Step6_Merge } from './components/Step6_Merge';
import { SettingsModal } from './components/SettingsModal';
import { AlertDialog, AlertDialogState, ConfirmDialog, ConfirmDialogState, DialogTone } from './components/ui/Dialogs';
import { ToastItem, ToastStack, ToastTone } from './components/ui/ToastStack';
import { createGithubIssue, fetchGithubIssues, createBranch, getBSHA, commitFile, createPullRequest, mergePullRequest, fetchMergedPRs, fetchOpenPRs, fetchCommitStatus, fetchAuthenticatedUser, fetchPullRequestDetails } from './services/githubService';
import { createWorktree, pruneWorktree, pushWorktreeBranch, forcePushWorktreeBranchWithLease } from './services/gitService';
import { ChevronLeft, ChevronRight, GitGraph, Settings, LayoutDashboard, Terminal, Activity, Key, Menu, X, Server, Github } from 'lucide-react';

type BridgeHealthState = {
    status: 'checking' | 'healthy' | 'unhealthy';
    endpoint?: string;
};

const SETTINGS_STORAGE_KEY = 'flowize.settings.v1';
const TASKS_STORAGE_KEY = 'flowize.tasks.v1';
const SLOTS_STORAGE_KEY = 'flowize.slots.v1';
const STEP_STORAGE_KEY = 'flowize.current-step.v1';

const createDefaultSettings = (envGithubToken: string, browserHost: string): AppSettings => ({
    repoOwner: 'stagius',
    repoName: 'flowize',
    defaultBranch: 'master',
    worktreeRoot: 'z:/flowize',
    maxWorktrees: 3,
    githubToken: envGithubToken,
    antiGravityAgentCommand: 'cd "{worktreePath}" && opencode run {agentFlag} "Implement issue #{issueNumber} on branch {branch}. Use {issueDescriptionFile} as requirements and follow {skillFile}. Return code/output for this task." --print-logs',
    antiGravityAgentName: '',
    antiGravityAgentEndpoint: `http://${browserHost}:4141/run`,
    antiGravityAgentSubdir: '.antigravity',
    antiGravitySkillFile: '.opencode/skills/specflow-worktree-automation/SKILL.md'
});

const normalizeSettings = (raw: Partial<AppSettings>, defaults: AppSettings): AppSettings => {
    const merged = { ...defaults, ...raw };
    const maxWorktrees = Number.isFinite(Number(merged.maxWorktrees))
        ? Math.max(1, Math.min(10, Number(merged.maxWorktrees)))
        : defaults.maxWorktrees;

    return {
        ...merged,
        maxWorktrees
    };
};

export default function App() {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const envGithubToken = env?.VITE_GITHUB_TOKEN || env?.GITHUB_TOKEN || '';
    const envApiKey = env?.VITE_API_KEY || env?.API_KEY || '';
    const browserHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
    const defaultSettings = createDefaultSettings(envGithubToken, browserHost);

    const [currentStep, setCurrentStep] = useState<number>(() => {
        if (typeof window === 'undefined') {
            return 1;
        }

        try {
            const stored = Number(window.localStorage.getItem(STEP_STORAGE_KEY));
            return [1, 2, 3, 4, 5].includes(stored) ? stored : 1;
        } catch {
            return 1;
        }
    });
    const [tasks, setTasks] = useState<TaskItem[]>(() => {
        if (typeof window === 'undefined') {
            return [];
        }

        try {
            const stored = window.localStorage.getItem(TASKS_STORAGE_KEY);
            if (!stored) {
                return [];
            }

            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) {
                return [];
            }

            const validStatuses = new Set(Object.values(TaskStatus));
            return parsed
                .map((item: unknown) => {
                    if (!item || typeof item !== 'object') return null;
                    const value = item as Partial<TaskItem>;
                    if (
                        typeof value.id !== 'string' ||
                        typeof value.rawText !== 'string' ||
                        typeof value.title !== 'string' ||
                        typeof value.description !== 'string' ||
                        typeof value.group !== 'string' ||
                        !['High', 'Medium', 'Low'].includes(String(value.priority)) ||
                        !validStatuses.has(value.status as TaskStatus)
                    ) {
                        return null;
                    }

                    return {
                        ...value,
                        status: value.status as TaskStatus,
                        createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : Date.now()
                    } as TaskItem;
                })
                .filter((item): item is TaskItem => Boolean(item));
        } catch {
            return [];
        }
    });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [syncingTaskIds, setSyncingTaskIds] = useState<Set<string>>(new Set());
    const [alertDialog, setAlertDialog] = useState<AlertDialogState | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [alertActionBusy, setAlertActionBusy] = useState(false);
    const [bridgeHealth, setBridgeHealth] = useState<BridgeHealthState>({ status: 'checking' });
    const [githubLogin, setGithubLogin] = useState<string>('');
    const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
    const alertActionRef = useRef<(() => Promise<void> | void) | null>(null);

    const showToast = (message: string, tone: ToastTone = 'info') => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setToasts(prev => [...prev, { id, message, tone }]);
        window.setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4500);
    };

    const showAlertDialog = (
        title: string,
        message: string,
        tone: DialogTone = 'error',
        action?: { label: string; tone?: DialogTone; run: () => Promise<void> | void }
    ) => {
        alertActionRef.current = action?.run || null;
        setAlertDialog({
            title,
            message,
            tone,
            actionLabel: action?.label,
            actionTone: action?.tone
        });
    };

    const closeAlertDialog = () => {
        setAlertDialog(null);
        alertActionRef.current = null;
        setAlertActionBusy(false);
    };

    const handleAlertAction = async () => {
        if (!alertActionRef.current) return;
        setAlertActionBusy(true);
        try {
            await alertActionRef.current();
            closeAlertDialog();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(`Action failed: ${message}`, 'error');
            setAlertActionBusy(false);
        }
    };

    const askConfirmation = (config: {
        title: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        tone?: DialogTone;
    }): Promise<boolean> => {
        return new Promise((resolve) => {
            confirmResolverRef.current = resolve;
            setConfirmDialog({
                title: config.title,
                message: config.message,
                confirmLabel: config.confirmLabel || 'Confirm',
                cancelLabel: config.cancelLabel || 'Cancel',
                tone: config.tone || 'warning'
            });
        });
    };

    const closeConfirmDialog = (confirmed: boolean) => {
        setConfirmDialog(null);
        if (confirmResolverRef.current) {
            confirmResolverRef.current(confirmed);
            confirmResolverRef.current = null;
        }
    };

    const buildWorktreeSlotPath = (root: string, slotNumber: number): string => {
        const suffix = `-wt-${slotNumber}`;

        if (root.includes('\\')) {
            const trimmed = root.endsWith('\\') ? root.slice(0, -1) : root;
            return `${trimmed}${suffix}`;
        }

        const trimmed = root.endsWith('/') ? root.slice(0, -1) : root;
        return `${trimmed}${suffix}`;
    };

    const buildDefaultSlots = (root: string, count: number): WorktreeSlot[] => {
        return Array.from({ length: count }, (_, i) => ({
            id: i + 1,
            taskId: null,
            path: buildWorktreeSlotPath(root, i + 1)
        }));
    };

    const [settings, setSettings] = useState<AppSettings>(() => {
        if (typeof window === 'undefined') {
            return defaultSettings;
        }

        try {
            const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (!stored) {
                return defaultSettings;
            }
            const parsed = JSON.parse(stored) as Partial<AppSettings>;
            return normalizeSettings(parsed, defaultSettings);
        } catch {
            return defaultSettings;
        }
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }, [settings]);

    // Initialize slots
    const [slots, setSlots] = useState<WorktreeSlot[]>(() => {
        if (typeof window === 'undefined') {
            return buildDefaultSlots(settings.worktreeRoot, settings.maxWorktrees);
        }

        try {
            const stored = window.localStorage.getItem(SLOTS_STORAGE_KEY);
            if (!stored) {
                return buildDefaultSlots(settings.worktreeRoot, settings.maxWorktrees);
            }

            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) {
                return buildDefaultSlots(settings.worktreeRoot, settings.maxWorktrees);
            }

            const sanitized = parsed
                .map((slot: unknown) => {
                    if (!slot || typeof slot !== 'object') return null;
                    const value = slot as Partial<WorktreeSlot>;
                    const id = Number(value.id);
                    if (!Number.isInteger(id) || id < 1) return null;
                    return {
                        id,
                        taskId: typeof value.taskId === 'string' ? value.taskId : null,
                        path: typeof value.path === 'string' ? value.path : buildWorktreeSlotPath(settings.worktreeRoot, id)
                    } as WorktreeSlot;
                })
                .filter((slot): slot is WorktreeSlot => Boolean(slot));

            return sanitized.length > 0
                ? sanitized
                : buildDefaultSlots(settings.worktreeRoot, settings.maxWorktrees);
        } catch {
            return buildDefaultSlots(settings.worktreeRoot, settings.maxWorktrees);
        }
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(STEP_STORAGE_KEY, String(currentStep));
    }, [currentStep]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    }, [tasks]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(slots));
    }, [slots]);

    useEffect(() => {
        const taskIds = new Set(tasks.map(task => task.id));
        setSlots(prev => {
            const next = prev.map(slot => {
                if (slot.taskId && !taskIds.has(slot.taskId)) {
                    return { ...slot, taskId: null };
                }
                return slot;
            });

            const changed = next.some((slot, index) => slot.taskId !== prev[index]?.taskId);
            return changed ? next : prev;
        });
    }, [tasks]);

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
                        path: buildWorktreeSlotPath(settings.worktreeRoot, i)
                    });
                } else {
                    // Create new slot
                    newSlots.push({
                        id: i,
                        taskId: null,
                        path: buildWorktreeSlotPath(settings.worktreeRoot, i)
                    });
                }
            }
            return newSlots;
        });
    }, [settings.worktreeRoot, settings.maxWorktrees]);

    useEffect(() => {
        const endpoint = settings.antiGravityAgentEndpoint?.trim();
        if (!endpoint) {
            setBridgeHealth({ status: 'unhealthy' });
            return;
        }

        const getCandidates = (value: string): string[] => {
            const trimmed = value.replace(/\/+$/, '');
            const withRun = trimmed.endsWith('/run') ? trimmed : `${trimmed}/run`;
            const withoutRun = trimmed.endsWith('/run') ? trimmed.slice(0, -4) : trimmed;
            const host = typeof window !== 'undefined' ? window.location.hostname : '';

            const candidates = [withRun, withoutRun]
                .flatMap((item) => {
                    const variants = [item];
                    if (item.includes('127.0.0.1')) variants.push(item.replace('127.0.0.1', 'localhost'));
                    if (item.includes('localhost')) variants.push(item.replace('localhost', '127.0.0.1'));
                    if (host && !item.includes(host)) {
                        variants.push(item.replace('127.0.0.1', host));
                        variants.push(item.replace('localhost', host));
                    }
                    return variants;
                })
                .map((item) => {
                    const base = item.endsWith('/run') ? item.slice(0, -4) : item;
                    return `${base}/health`;
                });

            return Array.from(new Set(candidates));
        };

        let active = true;
        setBridgeHealth({ status: 'checking' });

        const check = async () => {
            const candidates = getCandidates(endpoint);
            for (const healthUrl of candidates) {
                try {
                    const response = await fetch(healthUrl, { method: 'GET' });
                    if (!response.ok) continue;
                    const payload = await response.json() as { ok?: boolean };
                    if (payload.ok && active) {
                        setBridgeHealth({ status: 'healthy', endpoint: healthUrl });
                        return;
                    }
                } catch {
                    // continue trying alternate health endpoints
                }
            }

            if (active) {
                setBridgeHealth({ status: 'unhealthy' });
            }
        };

        check();

        return () => {
            active = false;
        };
    }, [settings.antiGravityAgentEndpoint]);

    useEffect(() => {
        const token = (settings.githubToken || '').trim();
        if (!token) {
            setGithubLogin('');
            return;
        }

        let cancelled = false;
        const loadUser = async () => {
            try {
                const user = await fetchAuthenticatedUser(token);
                if (!cancelled) {
                    setGithubLogin(user.login || '');
                }
            } catch {
                if (!cancelled) {
                    setGithubLogin('');
                }
            }
        };

        void loadUser();
        return () => {
            cancelled = true;
        };
    }, [settings.githubToken]);

    // --- Actions ---

    const hasGithubToken = Boolean(settings.githubToken || envGithubToken);

    const handleTasksGenerated = (newTasks: TaskItem[]) => {
        setTasks(prev => [...prev, ...newTasks]);
        if (tasks.length === 0) setCurrentStep(2);
    };

    const handleSaveSettings = (next: AppSettings) => {
        setSettings(normalizeSettings(next, defaultSettings));
    };

    const handleResetSettings = () => {
        setSettings(defaultSettings);
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
        }
        showToast('Settings reset to defaults.', 'info');
    };

    const handleClearLocalSession = () => {
        setCurrentStep(1);
        setTasks([]);
        setSlots(prev => prev.map(slot => ({
            ...slot,
            taskId: null,
            path: buildWorktreeSlotPath(settings.worktreeRoot, slot.id)
        })));

        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(TASKS_STORAGE_KEY);
            window.localStorage.removeItem(SLOTS_STORAGE_KEY);
            window.localStorage.removeItem(STEP_STORAGE_KEY);
        }

        showToast('Local workflow session cleared.', 'info');
    };

    const handlePromoteToIssue = async (taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        if (!hasGithubToken) {
            setIsSettingsOpen(true);
            showToast("Set GitHub Token in Settings to create issues.", 'warning');
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
            showAlertDialog('GitHub Issue Creation Failed', `Failed to create issue on GitHub: ${error.message}`, 'error');
        } finally {
            setSyncingTaskIds(prev => {
                const next = new Set(prev);
                next.delete(taskId);
                return next;
            });
        }
    };

    const handlePromoteAllIssues = async () => {
        if (!hasGithubToken) {
            setIsSettingsOpen(true);
            showToast("Set GitHub Token in Settings to create issues.", 'warning');
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
        if (!hasGithubToken) {
            setIsSettingsOpen(true);
            showToast("Set GitHub Token in Settings to fetch issues.", 'warning');
            return;
        }

        if (tasks.length > 0) {
            const confirmReplace = await askConfirmation({
                title: 'Replace current task list?',
                message: 'Fetching remote issues will replace the current local task list in this session.',
                confirmLabel: 'Replace List',
                cancelLabel: 'Keep Current',
                tone: 'warning'
            });

            if (!confirmReplace) {
                showToast('Fetch cancelled. Current task list kept.', 'info');
                return;
            }
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
                    !['high', 'medium', 'low'].includes(l.name.toLowerCase())
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

            setTasks(newTasks);

            if (newTasks.length === 0) {
                showToast('No open issues found. Task list cleared.', 'warning');
            } else {
                showToast(`Fetched ${newTasks.length} issues and replaced current list.`, 'warning');
            }

        } catch (error: any) {
            console.error("Failed to fetch issues", error);
            showAlertDialog('Fetch Issues Failed', `Failed to fetch remote issues: ${error.message}`, 'error');
        }
    };

    const handleAssignToSlot = async (taskId: string, slotId: number) => {
        // 1. Reserve slot and set task to initializing
        setSlots(prev => prev.map(s => s.id === slotId ? { ...s, taskId } : s));

        const branchName = `feat/${tasks.find(t => t.id === taskId)?.group.toLowerCase().replace(/\s+/g, '-')}-${taskId.substring(0, 4)}`;

        setTasks(prev => prev.map(t => {
            if (t.id === taskId) {
                return {
                    ...t,
                    status: TaskStatus.WORKTREE_INITIALIZING,
                    branchName,
                    agentRunState: 'idle'
                };
            }
            return t;
        }));

        // 2. Perform git operations via local bridge
        const currentSlot = slots.find(s => s.id === slotId) || { id: slotId, path: buildWorktreeSlotPath(settings.worktreeRoot, slotId), taskId };
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
                const message = error instanceof Error ? error.message : String(error);
                const checkedOutMatch = message.match(/already checked out at '([^']+)'/i);
                if (checkedOutMatch?.[1]) {
                    const existingPath = checkedOutMatch[1];
                    showAlertDialog(
                        'Worktree Creation Failed',
                        `Failed to create worktree on filesystem: ${message}`,
                        'error',
                        {
                            label: 'Cleanup Existing Worktree',
                            tone: 'warning',
                            run: async () => {
                                await pruneWorktree({ id: -1, taskId: null, path: existingPath }, undefined, settings);
                                showToast(`Cleanup attempted for ${existingPath}`, 'success');
                            }
                        }
                    );
                } else {
                    showAlertDialog('Worktree Creation Failed', `Failed to create worktree on filesystem: ${message}`, 'error');
                }
                // Revert assignment on fail
                setSlots(prev => prev.map(s => s.id === slotId ? { ...s, taskId: null } : s));
                setTasks(prev => prev.map(t =>
                    t.id === taskId ? { ...t, status: TaskStatus.ISSUE_CREATED } : t
                ));
            }
        }
    };

    const refreshIssueBacklogAfterCleanup = async () => {
        if (!hasGithubToken) {
            return;
        }

        const remoteIssues = await fetchGithubIssues(settings);
        const issuesOnly = remoteIssues.filter((issue: any) => !issue.pull_request);
        const openIssueNumbers = new Set<number>(
            issuesOnly
                .map((issue: any) => Number(issue.number))
                .filter((issueNumber: number) => Number.isFinite(issueNumber))
        );

        setTasks(prev => prev.filter(task => {
            if (task.status !== TaskStatus.ISSUE_CREATED) {
                return true;
            }
            if (!task.issueNumber) {
                return true;
            }
            return openIssueNumbers.has(task.issueNumber);
        }));
    };

    const handleCleanupSlot = async (slotId: number) => {
        const slot = slots.find(s => s.id === slotId);
        if (!slot) return;

        const task = tasks.find(t => t.id === slot.taskId);

        if (task) {
            const confirm = await askConfirmation({
                title: `Cleanup Worktree ${slotId}?`,
                message: `Slot ${slotId} is currently used by task "${task.title}".\n\nCleaning up will detach the task and reset it to 'Issue Created'.`,
                confirmLabel: 'Cleanup',
                cancelLabel: 'Cancel',
                tone: 'warning'
            });
            if (!confirm) return;
        }

        let cleanupError: string | null = null;
        try {
            await pruneWorktree(slot, undefined, settings);
        } catch (error) {
            cleanupError = error instanceof Error ? error.message : String(error);
        }

        // Reset slot
        setSlots(prev => prev.map(s => s.id === slotId ? { ...s, taskId: null } : s));

        // Reset task if it existed
        if (task) {
            setTasks(prev => prev.map(t =>
                t.id === task.id ? {
                    ...t,
                    status: TaskStatus.ISSUE_CREATED,
                    branchName: undefined,
                    implementationDetails: undefined,
                    agentLogs: undefined,
                    agentLastCommand: undefined,
                    agentRunState: 'idle'
                } : t
            ));
        }

        try {
            await refreshIssueBacklogAfterCleanup();
        } catch (error) {
            console.warn('Issue backlog refresh after cleanup failed', error);
        }

        if (cleanupError) {
            showAlertDialog('Cleanup Partially Completed', `Slot was reset, but filesystem cleanup reported: ${cleanupError}`, 'warning');
        } else {
            showToast(`Worktree slot ${slotId} cleaned up.`, 'success');
        }
    };

    const handleImplement = (
        taskId: string,
        implementation: string,
        logs: string,
        command: string,
        success: boolean,
        runState?: 'succeeded' | 'failed' | 'cancelled'
    ) => {
        setTasks(prev => prev.map(t =>
            t.id === taskId ? {
                ...t,
                status: success ? TaskStatus.IMPLEMENTED : TaskStatus.WORKTREE_ACTIVE,
                implementationDetails: implementation,
                agentLogs: logs,
                agentLastCommand: command,
                agentRunState: runState || (success ? 'succeeded' : 'failed'),
                reviewFeedback: success ? undefined : t.reviewFeedback
            } : t
        ));
    };

    const pushTaskImplementationToGithub = async (task: TaskItem): Promise<void> => {
        if (!task.branchName) {
            throw new Error('Task branch is missing.');
        }
        if (!hasGithubToken) {
            throw new Error('GitHub Token not configured. Add one in Settings to push branch changes.');
        }

        const baseSha = await getBSHA(settings, settings.defaultBranch);
        await createBranch(settings, task.branchName, baseSha);
        await commitFile(
            settings,
            task.branchName,
            `src/features/${task.group.toLowerCase()}/${task.id}.tsx`,
            task.implementationDetails || '// No code',
            `feat: implement ${task.title} (#${task.issueNumber})`
        );
    };

    const handleFinishImplementation = async (taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        const slot = slots.find(s => s.taskId === taskId);

        if (!task || !slot || !task.branchName) {
            showAlertDialog('Push Failed', 'This task is not assigned to an active worktree slot.', 'error');
            return;
        }

        try {
            await pushWorktreeBranch(slot, task.branchName, settings);
            setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, status: TaskStatus.PUSHED } : t
            ));
            setCurrentStep(4);
            showToast(`Branch ${task.branchName} pushed. Continue review in Step 4.`, 'success');
        } catch (e: any) {
            console.error("Failed to push to GitHub", e);
            const message = e instanceof Error ? e.message : String(e);

            if (isPushDivergedError(message)) {
                showAlertDialog(
                    'Push Conflict Detected',
                    `Remote branch ${task.branchName} has diverged and safe push failed. You can force push with lease to update this task branch while still protecting against unexpected remote changes.\n\nDetails: ${message}`,
                    'warning',
                    {
                        label: 'Force Push (--with-lease)',
                        tone: 'warning',
                        run: async () => {
                            await forcePushWorktreeBranchWithLease(slot, task.branchName as string, settings);
                            setTasks(prev => prev.map(t =>
                                t.id === taskId ? { ...t, status: TaskStatus.PUSHED } : t
                            ));
                            setCurrentStep(4);
                            showToast(`Force pushed ${task.branchName}. Continue review in Step 4.`, 'warning');
                        }
                    }
                );
                return;
            }

            showAlertDialog('Push Failed', `Failed to push branch: ${message}`, 'error');
        }
    };

    const handleApprovePR = async (taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        const slot = slots.find(s => s.taskId === taskId);
        if (!task || !task.branchName) return;

        if (!hasGithubToken) {
            showAlertDialog('GitHub Token Required', 'Cannot create a pull request without a GitHub token. Add one in Settings.', 'warning');
            return;
        }

        try {
            if (slot) {
                await pushWorktreeBranch(slot, task.branchName, settings);
            } else {
                await pushTaskImplementationToGithub(task);
            }

            const pr = await createPullRequest(
                settings,
                task.branchName,
                settings.defaultBranch,
                task.title,
                `${task.description}\n\nCloses #${task.issueNumber}`
            );
            const prNumber = pr.number;
            const prUrl = pr.html_url;

            // Updated: vercelStatus is now pending until specifically checked
            setTasks(prev => prev.map(t =>
                t.id === taskId ? {
                    ...t,
                    status: TaskStatus.PR_CREATED,
                    prNumber,
                    issueUrl: prUrl || t.issueUrl,
                    vercelStatus: 'pending',
                    mergeConflict: false
                } : t
            ));

            if (slot) {
                try {
                    await pruneWorktree(slot, task.branchName, settings);
                    setSlots(prev => prev.map(s => s.taskId === taskId ? { ...s, taskId: null } : s));
                } catch (e: any) {
                    console.error('Worktree cleanup after PR approval failed', e);
                    showAlertDialog(
                        'PR Created, Cleanup Failed',
                        `PR #${prNumber} was created, but worktree cleanup failed: ${e.message}`,
                        'warning'
                    );
                }
            }

        } catch (e: any) {
            console.error("PR Creation Failed", e);
            showAlertDialog('Pull Request Creation Failed', `Failed to create PR: ${e.message}`, 'error');
        }
    };

    const handleRequestChanges = (taskId: string, feedback: string) => {
        const cleanFeedback = feedback.trim();
        setTasks(prev => prev.map(t =>
            t.id === taskId
                ? {
                    ...t,
                    status: TaskStatus.WORKTREE_ACTIVE,
                    agentRunState: 'idle',
                    reviewFeedback: cleanFeedback || undefined
                }
                : t
        ));

        showToast(cleanFeedback ? 'Changes requested with feedback.' : 'Changes requested. Task moved back to active worktree.', 'warning');
    };

    const handleCheckCIStatus = async () => {
        if (!hasGithubToken) {
            setIsSettingsOpen(true);
            showToast("Set GitHub Token in Settings to check CI status.", 'warning');
            return;
        }

        const prTasks = tasks.filter(t => t.status === TaskStatus.PR_CREATED);
        if (prTasks.length === 0) {
            showToast('No active Pull Requests to check.', 'info');
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

    const isMergeConflictError = (message: string): boolean => {
        const normalized = message.toLowerCase();
        return normalized.includes('not mergeable') || normalized.includes('merge conflict') || normalized.includes('conflict between base and head');
    };

    const shortSha = (sha?: string): string => {
        if (!sha) return 'unknown';
        return sha.slice(0, 7);
    };

    const isPushDivergedError = (message: string): boolean => {
        return /fetch first|non-fast-forward|failed to push some refs|auto-rebase failed/i.test(message);
    };

    const handleResolveMergeConflict = async (taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task || !task.branchName) {
            throw new Error('Task or branch is missing. Re-sync PRs and retry.');
        }

        const availableSlots = slots.filter(s => !s.taskId).sort((a, b) => a.id - b.id);
        if (availableSlots.length === 0) {
            throw new Error('No free worktree slot available. Cleanup a slot in Step 3 and retry.');
        }

        setTasks(prev => prev.map(t =>
            t.id === taskId
                ? {
                    ...t,
                    status: TaskStatus.WORKTREE_INITIALIZING,
                    mergeConflict: true,
                    reviewFeedback: `Resolve merge conflicts for PR #${t.prNumber || '?'}, then push updates and send for review again.`,
                    agentRunState: 'idle'
                }
                : t
        ));

        const attempted: string[] = [];

        for (const slot of availableSlots) {
            const assignedSlot: WorktreeSlot = { ...slot, taskId };
            setSlots(prev => prev.map(s => s.id === assignedSlot.id ? assignedSlot : s));

            try {
                await createWorktree(settings, task, assignedSlot);

                setTasks(prev => prev.map(t =>
                    t.id === taskId
                        ? {
                            ...t,
                            status: TaskStatus.WORKTREE_ACTIVE,
                            mergeConflict: false
                        }
                        : t
                ));

                try {
                    await handleFetchMerged();
                } catch {
                    // Non-blocking refresh; task is already moved to active worktree.
                }

                setCurrentStep(3);
                showToast(`Conflict workspace ready in Worktree ${assignedSlot.id}.`, 'warning');
                return;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                attempted.push(`WT-${assignedSlot.id}: ${message}`);
                setSlots(prev => prev.map(s => s.id === assignedSlot.id ? { ...s, taskId: null } : s));
            }
        }

        setTasks(prev => prev.map(t =>
            t.id === taskId
                ? {
                    ...t,
                    status: TaskStatus.PR_CREATED,
                    mergeConflict: true
                }
                : t
        ));

        throw new Error(`Failed to prepare conflict workspace. Attempts: ${attempted.join(' | ')}`);
    };

    const handleMerge = async (taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        if (settings.githubToken && task.prNumber) {
            try {
                await mergePullRequest(settings, task.prNumber, `Merge pull request #${task.prNumber} from ${task.branchName}`);
            } catch (e: any) {
                console.error("Merge Failed", e);
                const message = e instanceof Error ? e.message : String(e);

                if (isMergeConflictError(message)) {
                    setTasks(prev => prev.map(t =>
                        t.id === taskId ? { ...t, mergeConflict: true } : t
                    ));

                    let conflictContext = '';
                    try {
                        const prDetails = await fetchPullRequestDetails(settings, task.prNumber);
                        const baseRef = `${prDetails.base.ref}@${shortSha(prDetails.base.sha)}`;
                        const headRef = `${prDetails.head.ref}@${shortSha(prDetails.head.sha)}`;
                        const mergeableState = prDetails.mergeable_state || 'unknown';
                        const mergeableFlag = prDetails.mergeable === null ? 'pending' : String(prDetails.mergeable);
                        conflictContext = `\n\nConflict context:\n- Base: ${baseRef}\n- Head: ${headRef}\n- mergeable_state: ${mergeableState}\n- mergeable: ${mergeableFlag}\n\nTip: this usually means both branches changed overlapping lines. Open the conflict worktree, pull latest ${settings.defaultBranch}, resolve markers, commit, and push.`;
                    } catch {
                        conflictContext = `\n\nTip: this usually means both branches changed overlapping lines. Open the conflict worktree, pull latest ${settings.defaultBranch}, resolve markers, commit, and push.`;
                    }

                    showAlertDialog(
                        'Merge Conflict Detected',
                        `PR #${task.prNumber} has conflicts with ${settings.defaultBranch}. Launch a conflict worktree to fix and push updates, then re-run review and merge.\n\nDetails: ${message}${conflictContext}`,
                        'warning',
                        {
                            label: 'Resolve in Worktree',
                            tone: 'warning',
                            run: async () => {
                                await handleResolveMergeConflict(taskId);
                            }
                        }
                    );
                    return;
                }

                showAlertDialog('Merge Failed', `Failed to merge PR: ${e.message}`, 'error');
                return;
            }
        }

        setTasks(prev => prev.map(t =>
            t.id === taskId ? { ...t, status: TaskStatus.PR_MERGED, mergeConflict: false } : t
        ));
    };

    const handleFetchMerged = async () => {
        if (!hasGithubToken) {
            setIsSettingsOpen(true);
            showToast("Set GitHub Token in Settings to fetch PRs.", 'warning');
            return;
        }

        try {
            // Fetch both merged and open PRs to sync the view
            const [mergedPRs, openPRs] = await Promise.all([
                fetchMergedPRs(settings),
                fetchOpenPRs(settings)
            ]);
            const mergedPrNumbers = new Set<number>(mergedPRs.map((pr: any) => pr.number));

            setTasks(prev => {
                const newTasks = [...prev];

                const processPR = (pr: any, status: TaskStatus) => {
                    const idx = newTasks.findIndex(t => t.prNumber === pr.number);

                    if (idx !== -1) {
                        if (newTasks[idx].status === TaskStatus.PR_MERGED && status === TaskStatus.PR_CREATED) {
                            return;
                        }

                        const existingTask = newTasks[idx];
                        const localWorktreeStatus = new Set<TaskStatus>([
                            TaskStatus.WORKTREE_INITIALIZING,
                            TaskStatus.WORKTREE_ACTIVE,
                            TaskStatus.IMPLEMENTED
                        ]);
                        const keepLocalStatus = status === TaskStatus.PR_CREATED && (localWorktreeStatus.has(existingTask.status) || Boolean(existingTask.mergeConflict));
                        const nextStatus = keepLocalStatus ? existingTask.status : status;
                        const nextMergeConflict = status === TaskStatus.PR_MERGED ? false : existingTask.mergeConflict;

                        if (
                            existingTask.status !== nextStatus ||
                            existingTask.issueUrl !== pr.html_url ||
                            existingTask.branchName !== pr.head?.ref ||
                            existingTask.mergeConflict !== nextMergeConflict
                        ) {
                            newTasks[idx] = {
                                ...existingTask,
                                status: nextStatus,
                                issueUrl: pr.html_url,
                                branchName: existingTask.branchName || pr.head?.ref,
                                mergeConflict: nextMergeConflict
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
                                vercelStatus: 'pending', // Default for new open PRs
                                mergeConflict: false
                            });
                        }
                    }
                };

                openPRs.forEach((pr: any) => {
                    if (!mergedPrNumbers.has(pr.number)) {
                        processPR(pr, TaskStatus.PR_CREATED);
                    }
                });
                mergedPRs.forEach((pr: any) => processPR(pr, TaskStatus.PR_MERGED));

                return newTasks;
            });
        } catch (e: any) {
            console.error("Fetch PRs Failed", e);
            showAlertDialog('Fetch Pull Requests Failed', `Failed to fetch PRs: ${e.message}`, 'error');
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
            case 4: return <Step5_Review tasks={tasks} onApprovePR={handleApprovePR} onRequestChanges={handleRequestChanges} onCheckStatus={handleCheckCIStatus} />;
            case 5: return <Step6_Merge tasks={tasks} onMerge={handleMerge} onResolveConflict={handleResolveMergeConflict} onFetchMerged={handleFetchMerged} settings={settings} />;
            default: return <div>Unknown Step</div>;
        }
    };

    const activeWorktrees = slots.filter(s => s.taskId).length;
    const progressPercent = tasks.length > 0
        ? Math.round((tasks.filter(t => t.status === TaskStatus.PR_MERGED).length / tasks.length) * 100)
        : 0;

    const hasApiKey = Boolean(envApiKey);
    const bridgeLabel = bridgeHealth.status === 'healthy'
        ? 'HEALTHY'
        : bridgeHealth.status === 'checking'
            ? 'CHECKING'
            : 'OFFLINE';
    const bridgeBadgeClass = bridgeHealth.status === 'healthy'
        ? 'bg-emerald-500/10 text-emerald-500'
        : bridgeHealth.status === 'checking'
            ? 'bg-indigo-500/10 text-indigo-400'
            : 'bg-red-500/10 text-red-500';

    const activeStepIndex = STEPS.findIndex((step) => step.id === currentStep);
    const activeStep = activeStepIndex >= 0 ? STEPS[activeStepIndex] : null;
    const canGoToPreviousStep = activeStepIndex > 0;
    const canGoToNextStep = activeStepIndex >= 0 && activeStepIndex < STEPS.length - 1;

    const moveStep = (direction: -1 | 1) => {
        if (activeStepIndex < 0) return;
        const targetStep = STEPS[activeStepIndex + direction];
        if (!targetStep) return;
        setCurrentStep(targetStep.id);
        setIsMobileMenuOpen(false);
    };

    return (
        <div className="min-h-screen flex bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                currentSettings={settings}
                onSave={handleSaveSettings}
                onReset={handleResetSettings}
                onClearLocalSession={handleClearLocalSession}
                hasApiKey={hasApiKey}
            />

            <AlertDialog
                dialog={alertDialog}
                onClose={closeAlertDialog}
                onAction={alertDialog?.actionLabel ? handleAlertAction : undefined}
                actionBusy={alertActionBusy}
            />
            <ConfirmDialog
                dialog={confirmDialog}
                onCancel={() => closeConfirmDialog(false)}
                onConfirm={() => closeConfirmDialog(true)}
            />
            <ToastStack toasts={toasts} />

            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-[60] lg:hidden">
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
                    <div className="absolute inset-y-0 left-0 w-[20.5rem] max-w-[90vw] bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-700/80 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
                        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-800/80">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-500/10 p-2 rounded-lg text-indigo-400">
                                    <GitGraph className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="font-bold text-lg text-slate-100 leading-tight">Flowize</p>
                                    <p className="text-[11px] text-slate-500">Workflow Navigator</p>
                                </div>
                            </div>
                            <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-white rounded-lg p-1 hover:bg-slate-800/80 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
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
                                        className={`relative w-full flex items-center min-h-[56px] px-4 py-3 rounded-xl border transition-all ${isActive
                                            ? `${step.bg} ${step.color} ${step.border}`
                                            : 'border-transparent text-slate-500 hover:bg-slate-800/80 hover:border-slate-700/70 hover:text-slate-300'
                                            }`}
                                    >
                                        <Icon className={`w-5 h-5 ${isActive ? step.color : 'text-slate-500'}`} />
                                        <span className="ml-3 text-sm font-semibold tracking-wide">{step.label}</span>
                                        {isActive && <span className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-slate-300/80">Current</span>}
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="p-4 border-t border-slate-800">
                            <div className="bg-slate-900/80 rounded-xl border border-slate-700/80 p-3 text-xs space-y-2">
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
                                <div className="pt-2 border-t border-slate-700/50 flex justify-between items-center text-slate-500">
                                    <span className="flex items-center gap-1.5"><Server className="w-3 h-3" /> Bridge</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${bridgeBadgeClass}`} title={bridgeHealth.endpoint || settings.antiGravityAgentEndpoint}>
                                        {bridgeLabel}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Desktop Sidebar Navigation */}
            <aside className="w-80 flex-shrink-0 border-r border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950/80 backdrop-blur-xl flex flex-col justify-between hidden lg:flex sticky top-0 h-screen">
                <div>
                    <div className="h-20 flex items-center justify-start px-6 border-b border-slate-800/80">
                        <div className="bg-indigo-500/10 p-2 rounded-lg text-indigo-400">
                            <GitGraph className="w-6 h-6" />
                        </div>
                        <div className="ml-3">
                            <p className="font-bold text-lg tracking-tight text-slate-100">Flowize</p>
                            <p className="text-[11px] text-slate-500">Workflow Navigator</p>
                        </div>
                    </div>

                    <nav className="p-4 space-y-2">
                        {STEPS.map((step) => {
                            const isActive = currentStep === step.id;
                            const Icon = step.icon;

                            return (
                                <button
                                    key={step.id}
                                    onClick={() => setCurrentStep(step.id)}
                                    className={`relative w-full flex items-center min-h-[52px] px-4 py-3 rounded-xl border transition-all duration-200 group ${isActive
                                        ? `${step.bg} ${step.color} ${step.border}`
                                        : 'border-transparent text-slate-500 hover:bg-slate-800/80 hover:border-slate-700/70 hover:text-slate-300'
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
                        <div className="pt-2 border-t border-slate-700/50 flex justify-between items-center text-slate-500">
                            <span className="flex items-center gap-1.5"><Server className="w-3 h-3" /> Bridge</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${bridgeBadgeClass}`} title={bridgeHealth.endpoint || settings.antiGravityAgentEndpoint}>
                                {bridgeLabel}
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
                        <span className="hidden xl:flex font-bold text-slate-100">Flowize</span>
                    </button>

                    {/* Workfolder */}
                    <div className="hidden lg:flex items-center text-sm text-slate-400">
                        <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-xs">
                            <Terminal className="w-3.5 h-3.5" />
                            <span className="text-slate-500">{settings.worktreeRoot}</span>
                            <span className="font-mono text-slate-300">/{settings.repoName}</span>
                        </span>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
                        <div className="flex flex-col items-end">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hidden sm:inline">Pipeline</span>
                                <span className="text-xs font-bold text-indigo-400">{progressPercent}%</span>
                            </div>
                            <div className="hidden xl:flex w-24 md:w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-700"
                                    style={{ width: `${progressPercent}%` }}
                                ></div>
                            </div>
                        </div>

                        <div className="h-8 w-px bg-slate-800 mx-1 md:mx-2"></div>

                        <div className="flex items-center gap-3">
                            {settings.githubToken && (
                                <button
                                    type="button"
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-800/70 transition-colors"
                                    title="Open Settings"
                                >
                                    <div className="flex flex-col items-end">
                                        <span className="text-xs font-medium text-slate-200">
                                            {githubLogin ? `@${githubLogin}` : 'GitHub Connected'}
                                        </span>
                                        <span className="text-[10px] text-slate-500">{settings.repoOwner}/{settings.repoName}</span>
                                    </div>
                                    <img height="16" width="16" src="https://cdn.simpleicons.org/github/fff" />
                                </button>
                            )}
                            <div className="hidden md:flex flex-col items-end">
                                <span className="text-xs font-medium text-slate-200">Worktrees</span>
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

                <main className="flex-1 p-4 pb-24 md:p-8 md:pb-28 lg:pb-8 overflow-y-auto overflow-x-hidden">
                    <div className="mx-auto h-full flex flex-col">
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
                <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent px-3 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <div className="mx-auto flex max-w-xl items-center justify-between gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-2 shadow-[0_-10px_30px_rgba(2,6,23,0.65)] backdrop-blur-xl">
                        <button
                            type="button"
                            onClick={() => moveStep(-1)}
                            disabled={!canGoToPreviousStep}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Previous step"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-3 text-sm font-semibold text-indigo-100 transition-colors hover:bg-indigo-500/20"
                        >
                            <span className="block w-full truncate text-center">
                                {activeStep ? `${activeStepIndex + 1}/${STEPS.length} - ${activeStep.label}` : 'Open Steps'}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => moveStep(1)}
                            disabled={!canGoToNextStep}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Next step"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
}
