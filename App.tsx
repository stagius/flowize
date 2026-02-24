import React, { useState, useEffect, useRef } from 'react';
import { STEPS } from './constants';
import { TaskItem, TaskStatus, WorktreeSlot, AppSettings } from './types';
import { Step1_Input } from './components/Step1_Input';
import { Step2_Issues } from './components/Step2_Issues';
import { Step3_Worktrees } from './components/Step3_Worktrees';
import { Step5_Review } from './components/Step5_Review';
import { Step6_Merge } from './components/Step6_Merge';
import { SettingsModal } from './components/SettingsModal';
import { LoginPage } from './components/LoginPage';
import { AlertDialog, AlertDialogState, ConfirmDialog, ConfirmDialogState, DialogTone } from './components/ui/Dialogs';
import { ToastItem, ToastStack, ToastTone } from './components/ui/ToastStack';
import { createGithubIssue, fetchGithubIssues, createBranch, getBSHA, commitFile, createPullRequest, mergePullRequest, fetchMergedPRs, fetchOpenPRs, fetchCommitStatus, fetchAuthenticatedUser, fetchPullRequestDetails } from './services/githubService';
import { createWorktree, pruneWorktree, pushWorktreeBranch, forcePushWorktreeBranchWithLease } from './services/gitService';
import { getProcessesUsingPath, formatProcessList } from './services/processDetection';
import { GitGraph, Settings, LayoutDashboard, Terminal, Activity, Key, Menu, X, Server, Github, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { useTheme } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';

type BridgeHealthState = {
    status: 'checking' | 'healthy' | 'unhealthy';
    endpoint?: string;
};

const SETTINGS_STORAGE_KEY = 'flowize.settings.v1';
const TASKS_STORAGE_KEY = 'flowize.tasks.v1';
const SLOTS_STORAGE_KEY = 'flowize.slots.v1';
const STEP_STORAGE_KEY = 'flowize.current-step.v1';
const SIDEBAR_COLLAPSED_KEY = 'flowize.sidebar-collapsed.v1';

const createDefaultSettings = (envGithubToken: string, envBridgeEndpoint?: string, envApiKey?: string): AppSettings => ({
    repoOwner: 'stagius',
    repoName: 'flowize',
    defaultBranch: 'master',
    worktreeRoot: 'z:/flowize',
    maxWorktrees: 3,
    githubToken: '', // Force user to login on launch
    agentCommand: 'cd "{worktreePath}" && opencode run {agentFlag} "Implement issue #{issueNumber} on branch {branch}. Use {issueDescriptionFile} as requirements and follow {skillFile}. Return code/output for this task." --print-logs',
    agentName: '',
    agentEndpoint: envBridgeEndpoint || 'http://127.0.0.1:4141/run',
    agentSubdir: '.agent-workspace',
    agentSkillFile: '.opencode/skills/specflow-worktree-automation/SKILL.md',
    model: 'gemini-3-flash-preview',
    geminiApiKey: envApiKey || ''
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
    const { theme } = useTheme();
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const envGithubToken = env?.VITE_GITHUB_TOKEN || env?.GITHUB_TOKEN || '';
    const envApiKey = env?.VITE_API_KEY || env?.API_KEY || '';
    const envBridgeEndpoint = env?.VITE_BRIDGE_ENDPOINT;
    const defaultSettings = createDefaultSettings(envGithubToken, envBridgeEndpoint, envApiKey);

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
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        try {
            const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
            return stored === 'true';
        } catch {
            return false;
        }
    });
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

    const isValidSlotPath = (path: string): boolean => {
        // Check for common Windows drive patterns (e.g., z:/ or z:\)
        const windowsDrivePattern = /^[a-zA-Z]:[/\\]/;
        // Check for Unix absolute path
        const unixAbsolutePattern = /^\//;
        
        return windowsDrivePattern.test(path) || unixAbsolutePattern.test(path);
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
            const normalized = normalizeSettings(parsed, defaultSettings);

            // Check if this is a new session (browser/tab just opened)
            const hasActiveSession = window.sessionStorage.getItem('flowize.session.active');
            if (!hasActiveSession) {
                // New session - clear token to force login
                window.sessionStorage.setItem('flowize.session.active', 'true');
                return { ...normalized, githubToken: '' };
            }

            // Existing session - keep token (user already logged in this session)
            return normalized;
        } catch {
            return defaultSettings;
        }
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
    }, [isSidebarCollapsed]);

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
                    
                    // Rebuild path if it's missing or invalid
                    let slotPath = typeof value.path === 'string' ? value.path : '';
                    if (!slotPath || !isValidSlotPath(slotPath)) {
                        console.warn(`Invalid slot path detected for slot ${id}: "${slotPath}". Rebuilding from worktreeRoot.`);
                        slotPath = buildWorktreeSlotPath(settings.worktreeRoot, id);
                    }
                    
                    return {
                        id,
                        taskId: typeof value.taskId === 'string' ? value.taskId : null,
                        path: slotPath
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
        const endpoint = settings.agentEndpoint?.trim();
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
    }, [settings.agentEndpoint]);

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

    // Only check settings.githubToken, not environment variable (force login on launch)
    const hasGithubToken = Boolean(settings.githubToken);

    const handleLoginSuccess = async (token: string) => {
        setSettings(prev => ({ ...prev, githubToken: token }));
        try {
            const user = await fetchAuthenticatedUser(token);
            showToast(`Logged in as @${user.login}`, 'success');
        } catch {
            showToast('Successfully authenticated with GitHub!', 'success');
        }
    };

    const handleLogout = () => {
        setSettings(prev => ({ ...prev, githubToken: '' }));
        setGithubLogin('');
        // Clear session storage to ensure fresh login on next session
        if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem('flowize.session.active');
            // Remove githubToken from localStorage settings
            const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (stored) {
                try {
                    const settings = JSON.parse(stored);
                    delete settings.githubToken;
                    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
                } catch {
                    // If parsing fails, continue with logout
                }
            }
            // Remove auth token from localStorage
            window.localStorage.removeItem('flowize.auth.token.v1');
        }
        showToast('Logged out successfully', 'info');
        // Refresh page to clear in-memory data and reset UI state
        window.location.href = '/';
    };

    const handleTasksGenerated = (newTasks: TaskItem[]) => {
        setTasks(prev => [...prev, ...newTasks]);
        if (tasks.length === 0) setCurrentStep(2);
    };

    const handleEditTask = (taskId: string, updates: Partial<Pick<TaskItem, 'title' | 'description' | 'group' | 'priority'>>) => {
        setTasks(prev => prev.map(task => {
            if (task.id !== taskId) return task;
            if (task.status !== TaskStatus.FORMATTED) return task;
            return {
                ...task,
                ...updates
            };
        }));
    };

    const handleDeleteTask = (taskId: string) => {
        setTasks(prev => prev.filter(task => !(task.id === taskId && task.status === TaskStatus.FORMATTED)));
    };

    const handleSaveSettings = (next: AppSettings) => {
        setSettings(normalizeSettings(next, defaultSettings));
        showToast('Settings saved successfully.', 'success');
    };

    const handleResetSettings = () => {
        // Preserve the GitHub token when resetting to defaults
        const preservedToken = settings.githubToken;
        const newSettings = { ...defaultSettings, githubToken: preservedToken };
        setSettings(newSettings);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
        }
        showToast('Settings reset to defaults.', 'info');
    };

    const handleClearLocalSession = async () => {
        const confirmed = await askConfirmation({
            title: 'Clear Session Data',
            message: 'Are you sure you want to clear all session data? This will remove all tasks, worktree assignments, and reset the workflow step. This action cannot be undone.',
            confirmLabel: 'Clear Data',
            cancelLabel: 'Cancel',
            tone: 'warning'
        });

        if (!confirmed) return;

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

        const taskItem = tasks.find(t => t.id === taskId);
        const branchId = taskItem?.issueNumber ?? taskId;
        const branchName = `feat/${taskItem?.group.toLowerCase().replace(/\s+/g, '-')}-${branchId}`;

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

        if (slot) {
            const confirmed = await askConfirmation({
                title: 'Ready to Approve?',
                message: `Please close any IDEs or terminals that have files open in:\n\n${slot.path}\n\nThis ensures the worktree can be cleaned up after PR creation.`,
                confirmLabel: 'Continue',
                cancelLabel: 'Cancel',
                tone: 'info'
            });
            if (!confirmed) return;
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
                let cleanupSucceeded = false;
                try {
                    await pruneWorktree(slot, task.branchName, settings);
                    cleanupSucceeded = true;
                    setSlots(prev => prev.map(s => s.taskId === taskId ? { ...s, taskId: null } : s));
                } catch (e: any) {
                    console.error('Worktree cleanup after PR approval failed', e);
                    
                    const blockingProcesses = await getProcessesUsingPath(slot.path, settings);
                    const processList = formatProcessList(blockingProcesses);
                    
                    showAlertDialog(
                        'PR Created, Cleanup Failed',
                        `PR #${prNumber} was created, but worktree cleanup failed.${processList}\n\nClose the processes above, then click "Retry Cleanup".\n\nError: ${e.message}`,
                        'warning',
                        {
                            label: 'Retry Cleanup',
                            tone: 'warning',
                            run: async () => {
                                await pruneWorktree(slot, task.branchName, settings);
                                setSlots(prev => prev.map(s => s.taskId === taskId ? { ...s, taskId: null } : s));
                                showToast('Worktree cleanup succeeded', 'success');
                            }
                        }
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
            case 1: return <Step1_Input onTasksGenerated={handleTasksGenerated} existingTasks={tasks} model={settings.model} geminiApiKey={settings.geminiApiKey} />;
            case 2: return <Step2_Issues tasks={tasks} onPromoteToIssue={handlePromoteToIssue} onPromoteAll={handlePromoteAllIssues} syncingTaskIds={syncingTaskIds} onFetchRemote={handleFetchRemote} onEditTask={handleEditTask} onDeleteTask={handleDeleteTask} />;
            case 3: return <Step3_Worktrees
                tasks={tasks}
                slots={slots}
                onAssignToSlot={handleAssignToSlot}
                onImplement={handleImplement}
                onFinishImplementation={handleFinishImplementation}
                onCleanup={handleCleanupSlot}
                settings={settings}
                bridgeHealth={bridgeHealth}
                showToast={showToast}
            />;
            case 4: return <Step5_Review tasks={tasks} onApprovePR={handleApprovePR} onRequestChanges={handleRequestChanges} onCheckStatus={handleCheckCIStatus} bridgeHealth={bridgeHealth} />;
            case 5: return <Step6_Merge tasks={tasks} onMerge={handleMerge} onResolveConflict={handleResolveMergeConflict} onFetchMerged={handleFetchMerged} settings={settings} />;
            default: return <div>Unknown Step</div>;
        }
    };

    const activeWorktrees = slots.filter(s => s.taskId).length;

    const getTaskProgressWeight = (status: TaskStatus): number => {
        const weights: Record<TaskStatus, number> = {
            [TaskStatus.RAW]: 0,
            [TaskStatus.FORMATTED]: 0.1,
            [TaskStatus.ISSUE_CREATED]: 0.2,
            [TaskStatus.WORKTREE_QUEUED]: 0.3,
            [TaskStatus.WORKTREE_INITIALIZING]: 0.4,
            [TaskStatus.WORKTREE_ACTIVE]: 0.5,
            [TaskStatus.IMPLEMENTED]: 0.65,
            [TaskStatus.PUSHED]: 0.75,
            [TaskStatus.PR_CREATED]: 0.85,
            [TaskStatus.PR_MERGED]: 1,
        };
        return weights[status] ?? 0;
    };

    const progressPercent = tasks.length > 0
        ? Math.round((tasks.reduce((sum, t) => sum + getTaskProgressWeight(t.status), 0) / tasks.length) * 100)
        : 0;

    const isMergeStep = currentStep === 5;

    const hasApiKey = Boolean(settings.geminiApiKey);
    const bridgeLabel = bridgeHealth.status === 'healthy'
        ? 'HEALTHY'
        : bridgeHealth.status === 'checking'
            ? 'CHECKING'
            : 'OFFLINE';
    const bridgeBadgeClass = bridgeHealth.status === 'healthy'
        ? 'bg-emerald-500/10 text-emerald-500'
        : bridgeHealth.status === 'checking'
            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
            : 'bg-red-500/10 text-red-500';

    const activeStep = STEPS.find((step) => step.id === currentStep);

    return (
        <AuthProvider
            initialToken={settings.githubToken}
            onLoginSuccess={handleLoginSuccess}
            onLogout={handleLogout}
        >
            <AuthGuard
                bridgeEndpoint={settings.agentEndpoint}
                toasts={<ToastStack toasts={toasts} />}
            >
                <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 font-sans selection:bg-indigo-500/30">
                    {/* Skip to main content link for keyboard users */}
                    <a
                        href="#main-content"
                        className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                        Skip to main content
                    </a>

                    <SettingsModal
                        isOpen={isSettingsOpen}
                        onClose={() => setIsSettingsOpen(false)}
                        currentSettings={settings}
                        onSave={handleSaveSettings}
                        onReset={handleResetSettings}
                        onClearLocalSession={handleClearLocalSession}
                        onLogout={handleLogout}
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
                        <div
                            id="mobile-navigation"
                            className="fixed inset-0 z-[60] lg:hidden"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Navigation menu"
                        >
                            <div
                                className="absolute inset-0 bg-slate-950/30 dark:bg-slate-950/40 backdrop-blur-sm"
                                onClick={() => setIsMobileMenuOpen(false)}
                                aria-hidden="true"
                            />
                            <div className="absolute inset-y-0 left-0 w-[20.5rem] max-w-[90vw] bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 border-r border-slate-200 dark:border-slate-700/80 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
                                <div className="h-20 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800/80">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-indigo-500/10 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                                            <GitGraph className="w-6 h-6" aria-hidden="true" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-lg text-slate-900 dark:text-slate-100 leading-tight">Flowize</p>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Workflow Navigator</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                                        aria-label="Close navigation menu"
                                    >
                                        <X className="w-5 h-5" aria-hidden="true" />
                                    </button>
                                </div>

                                <nav className="p-4 space-y-2 flex-1 overflow-y-auto" aria-label="Workflow steps">
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
                                                aria-current={isActive ? 'step' : undefined}
                                                aria-label={`${step.label}${isActive ? ', current step' : ''}`}
                                                className={`relative w-full flex items-center min-h-[56px] px-4 py-3 rounded-xl border transition-all ${isActive
                                                    ? `${step.bg} ${step.color} ${step.border}`
                                                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700/70 hover:text-slate-900 dark:hover:text-slate-300'
                                                    }`}
                                            >
                                                <Icon className={`w-5 h-5 ${isActive ? step.color : 'text-slate-600 dark:text-slate-400'}`} aria-hidden="true" />
                                                <span className="ml-3 text-sm font-semibold tracking-wide">{step.label}</span>
                                                {isActive && <span className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300/80" aria-hidden="true">Current</span>}
                                            </button>
                                        );
                                    })}
                                </nav>

                                <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                                    <div className="bg-slate-100 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-700/80 p-3 text-xs space-y-2">
                                        <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                                            <span>System Status</span>
                                            <Activity className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                            <span className="text-emerald-500 font-medium">Online</span>
                                        </div>
                                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700/50 flex justify-between items-center text-slate-600 dark:text-slate-400">
                                            <span className="flex items-center gap-1.5"><Key className="w-3 h-3" /> API Key</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${hasApiKey ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                {hasApiKey ? 'CONFIGURED' : 'MISSING'}
                                            </span>
                                        </div>
                                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700/50 flex justify-between items-center text-slate-600 dark:text-slate-400">
                                            <span className="flex items-center gap-1.5"><Server className="w-3 h-3" /> Bridge</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${bridgeBadgeClass}`} title={bridgeHealth.endpoint || settings.agentEndpoint}>
                                                {bridgeLabel}
                                            </span>
                                        </div>
                                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700/50">
                                            <button
                                                onClick={handleLogout}
                                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors border border-red-200 dark:border-red-500/20"
                                            >
                                                <LogOut className="w-3 h-3" />
                                                <span>Logout</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Desktop Sidebar Navigation */}
                    <aside className={`flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-gradient-to-b from-white/80 to-slate-50/80 dark:from-slate-900/80 dark:to-slate-950/80 backdrop-blur-xl flex flex-col justify-between hidden lg:flex sticky top-0 h-screen transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-20' : 'w-80'}`}>
                        <div className="flex-1 overflow-y-auto overflow-x-hidden">
                            <div className="h-16 flex items-center justify-start px-6 border-b border-slate-200 dark:border-slate-800/80">
                                <div className={`bg-indigo-500/10 p-2 rounded-lg text-indigo-600 dark:text-indigo-400 ${isSidebarCollapsed ? 'mx-auto' : ''}`}>
                                    <GitGraph className={`${isSidebarCollapsed ? 'w-5 h-5' : 'w-6 h-6'}`} />
                                </div>
                                <div className={`ml-3 transition-opacity duration-200 ${isSidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                                    <p className="font-bold text-lg tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">Flowize</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">Workflow Navigator</p>
                                </div>
                            </div>

                            <nav className="p-4 space-y-2" aria-label="Workflow steps">
                                {STEPS.map((step) => {
                                    const isActive = currentStep === step.id;
                                    const Icon = step.icon;

                                    return (
                                        <button
                                            key={step.id}
                                            onClick={() => setCurrentStep(step.id)}
                                            aria-current={isActive ? 'step' : undefined}
                                            aria-label={`${step.label}${isActive ? ', current step' : ''}`}
                                            className={`relative w-full flex items-center px-4 py-3 rounded-xl border transition-all duration-200 group ${isSidebarCollapsed ? 'justify-center h-[48px]' : 'min-h-[52px]'
                                                } ${isActive
                                                    ? `${step.bg} ${step.color} ${step.border}`
                                                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700/70 hover:text-slate-900 dark:hover:text-slate-300'
                                                }`}
                                            title={isSidebarCollapsed ? step.label : undefined}
                                        >
                                            <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? step.color : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-300'}`} aria-hidden="true" />
                                            <span className={`font-medium text-sm transition-all duration-200 ${isSidebarCollapsed ? 'opacity-0 w-0 overflow-hidden ml-0' : 'opacity-100 ml-3'}`}>{step.label}</span>
                                            {isActive && !isSidebarCollapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" aria-hidden="true"></div>}
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>

                        {/* Toggle Button */}
                        <div className="px-4 pb-2">
                            <button
                                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                                className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 ${isSidebarCollapsed ? 'justify-center' : ''}`}
                                aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            >
                                {isSidebarCollapsed ? (
                                    <ChevronRight className="w-4 h-4" />
                                ) : (
                                    <>
                                        <ChevronLeft className="w-4 h-4" />
                                        <span className="text-sm font-medium">Collapse</span>
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                            {isSidebarCollapsed ? (
                                <div className="bg-slate-100 dark:bg-slate-800/50 rounded-lg p-3 flex flex-col items-center gap-2">
                                    <Activity className={`w-4 h-4 ${hasApiKey ? 'text-emerald-600 dark:text-emerald-400' : 'text-yellow-600 dark:text-yellow-400'}`} title={hasApiKey ? 'System Status: Ready' : 'System Status: API Key Missing'} />
                                    <Key
                                        className={`w-4 h-4 ${hasApiKey ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                                        title={hasApiKey ? 'API Key: Configured' : 'API Key: Missing'}
                                    />
                                    <Server
                                        className={`w-4 h-4 ${bridgeHealth.status === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' : bridgeHealth.status === 'unhealthy' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}
                                        title={`Bridge: ${bridgeLabel}`}
                                    />
                                    <button
                                        onClick={handleLogout}
                                        className="w-11 h-11 flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors border border-red-200 dark:border-red-500/20 mt-1"
                                        title="Logout"
                                    >
                                        <LogOut className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-slate-100 dark:bg-slate-800/50 rounded-lg p-3 text-xs space-y-2">
                                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                                        <span>System Status</span>
                                        <Activity className={`w-3 h-3 ${hasApiKey ? 'text-emerald-600 dark:text-emerald-400' : 'text-yellow-600 dark:text-yellow-400'}`} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-emerald-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                                        <span className={`font-medium ${hasApiKey ? 'text-emerald-500' : 'text-yellow-500'}`}>
                                            {hasApiKey ? 'Ready' : 'API Key Missing'}
                                        </span>
                                    </div>
                                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700/50 flex justify-between items-center text-slate-600 dark:text-slate-400">
                                        <span className="flex items-center gap-1.5"><Key className="w-3 h-3" /> API Key</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${hasApiKey ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                            {hasApiKey ? 'CONFIGURED' : 'MISSING'}
                                        </span>
                                    </div>
                                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700/50 flex justify-between items-center text-slate-600 dark:text-slate-400">
                                        <span className="flex items-center gap-1.5"><Server className="w-3 h-3" /> Bridge</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${bridgeBadgeClass}`} title={bridgeHealth.endpoint || settings.agentEndpoint}>
                                            {bridgeLabel}
                                        </span>
                                    </div>
                                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700/50">
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors border border-red-200 dark:border-red-500/20"
                                        >
                                            <LogOut className="w-3 h-3" />
                                            <span>Logout</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </aside>

                    {/* Main Content */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {/* Top Bar */}
                        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/30 dark:bg-slate-900/30 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between px-4 md:px-6">
                            <button
                                onClick={() => setIsMobileMenuOpen(true)}
                                className="flex items-center gap-3 lg:hidden p-1 -ml-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white min-w-[44px] min-h-[44px]"
                                aria-label="Open navigation menu"
                                aria-expanded={isMobileMenuOpen}
                                aria-controls="mobile-navigation"
                            >
                                <Menu className="w-6 h-6" aria-hidden="true" />
                                <span className="hidden xl:flex font-bold text-slate-900 dark:text-slate-100">Flowize</span>
                            </button>

                            {/* Workfolder */}
                            <div className="hidden lg:flex items-center text-sm text-slate-600 dark:text-slate-400">
                                <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 text-xs">
                                    <Terminal className="w-3.5 h-3.5" />
                                    <span className="text-slate-600 dark:text-slate-400">{settings.worktreeRoot}</span>
                                    <span className="font-mono text-slate-900 dark:text-slate-300">/{settings.repoName}</span>
                                </span>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
                                <div className="flex flex-col items-end">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 hidden sm:inline">Pipeline</span>
                                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{progressPercent}%</span>
                                    </div>
                                    <div className="hidden xl:flex w-24 md:w-32 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-700"
                                            style={{ width: `${progressPercent}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1 md:mx-2"></div>

                                <div className="flex items-center gap-3">
                                    {settings.githubToken && (
                                        <button
                                            type="button"
                                            onClick={() => setIsSettingsOpen(true)}
                                            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors min-h-[44px]"
                                            title="Open Settings"
                                        >
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs font-medium text-slate-900 dark:text-slate-200">
                                                    {githubLogin ? `@${githubLogin}` : 'GitHub Connected'}
                                                </span>
                                                <span className="text-[10px] text-slate-500 dark:text-slate-400">{settings.repoOwner}/{settings.repoName}</span>
                                            </div>
                                            <img
                                                height="16"
                                                width="16"
                                                src={theme === 'light'
                                                    ? "https://cdn.simpleicons.org/github"
                                                    : "https://cdn.simpleicons.org/github/fff"
                                                }
                                                alt="GitHub"
                                            />
                                        </button>
                                    )}
                                    <div className="hidden md:flex flex-col items-end">
                                        <span className="text-xs font-medium text-slate-900 dark:text-slate-200">Worktrees</span>
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{activeWorktrees}/{settings.maxWorktrees} Active</span>
                                    </div>
                                    <ThemeToggle />
                                    <button
                                        onClick={() => setIsSettingsOpen(true)}
                                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                                        aria-label="Open settings"
                                    >
                                        <Settings className="w-5 h-5" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        </header>

                        <main
                            id="main-content"
                            className={`flex-1 min-h-0 p-4 md:p-8 md:pt-4 overflow-x-hidden ${isMergeStep ? 'overflow-hidden' : 'overflow-y-auto'}`}
                        >
                            <div className="mx-auto h-full min-h-0 flex flex-col">
                                {/* Page Header */}
                                <div className="mb-6 flex items-center justify-between">
                                    <div>
                                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                                            {STEPS.find(s => s.id === currentStep)?.label || 'Dashboard'}
                                        </h1>
                                        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Manage your development lifecycle.</p>
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
            </AuthGuard>
        </AuthProvider>
    );
}
