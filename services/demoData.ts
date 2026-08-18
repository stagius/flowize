/**
 * Seed data for demo mode.
 *
 * The seeds are laid out so every step of the workflow has something to look at:
 * unsynced drafts in Step 1/2, open issues and live worktrees in Step 3, pushed
 * branches and open PRs in Step 4, merged work in Step 5, and agent sessions in
 * Step 6.
 */

import { AppSettings, TaskItem, TaskStatus, WorktreeSlot } from '../types';

export const DEMO_REPO_OWNER = 'flowize-demo';
export const DEMO_REPO_NAME = 'storefront';
export const DEMO_DEFAULT_BRANCH = 'main';
export const DEMO_WORKTREE_ROOT = '/demo/workspace/storefront';
export const DEMO_MAX_WORKTREES = 3;

/** Placeholder credential so token-gated actions stay enabled in the demo. */
export const DEMO_GITHUB_TOKEN = 'demo-token';

export const DEMO_USER = {
    id: 424242,
    login: DEMO_REPO_OWNER,
    name: 'Flowize Demo',
    avatar_url: '',
    email: 'demo@flowize.local'
};

const repoUrl = `https://github.com/${DEMO_REPO_OWNER}/${DEMO_REPO_NAME}`;

export const demoIssueUrl = (issueNumber: number): string => `${repoUrl}/issues/${issueNumber}`;
export const demoPullUrl = (prNumber: number): string => `${repoUrl}/pull/${prNumber}`;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const DEMO_AGENT_LOGS = [
    '$ opencode run --model demo "Implement issue #141 on branch feat/core-141"',
    '[demo] resolving worktree /demo/workspace/storefront-wt-141',
    '[demo] reading .opencode/skills/specflow-worktree-automation/SKILL.md',
    '[demo] planning changes across 3 files',
    '[demo] editing src/state/slots.ts',
    '[demo] editing src/state/persistence.ts',
    '[demo] editing src/state/__tests__/slots.test.ts',
    '[demo] running: npm test -- slots',
    '[demo] 12 passing (1.4s)',
    '[demo] agent run finished with exit code 0'
].join('\n');

const DEMO_IMPLEMENTATION = [
    '### Persist worktree slots across reloads',
    '',
    '- Serialize slot assignments to storage on every mutation',
    '- Rehydrate and validate slot paths on boot, rebuilding invalid ones',
    '- Drop assignments whose task no longer exists',
    '- Added regression tests for the rehydrate path'
].join('\n');

/**
 * Builds the seeded task list. Timestamps are relative to load time so the
 * relative-time labels always look fresh.
 */
export const createDemoTasks = (): TaskItem[] => {
    const now = Date.now();

    return [
        {
            id: 'demo-task-1',
            rawText: 'Mobile nav overlay traps keyboard focus behind the backdrop',
            title: 'Fix focus trap in the mobile navigation overlay',
            description: 'Opening the mobile navigation moves focus into the drawer but Tab escapes to the page behind the backdrop. Restore focus containment while the drawer is open and return focus to the trigger on close.',
            group: 'UI',
            priority: 'High',
            status: TaskStatus.FORMATTED,
            createdAt: now - 40 * 60 * 1000
        },
        {
            id: 'demo-task-2',
            rawText: 'Add keyboard shortcuts to move between workflow steps',
            title: 'Add keyboard shortcuts for workflow navigation',
            description: 'Bind 1-6 to jump between workflow steps and add a discoverable shortcut sheet. Shortcuts must stay inert while a dialog or text input has focus.',
            group: 'UX',
            priority: 'Medium',
            status: TaskStatus.FORMATTED,
            createdAt: now - 35 * 60 * 1000
        },
        {
            id: 'demo-task-3',
            rawText: 'Issue list refetches on every step change',
            title: 'Cache GitHub issue fetches between step changes',
            description: 'The issue list re-requests the GitHub API each time Step 2 mounts, which burns rate limit. Cache results for the session and expose an explicit refresh control.',
            group: 'Backend',
            priority: 'Medium',
            status: TaskStatus.ISSUE_CREATED,
            issueNumber: 138,
            issueUrl: demoIssueUrl(138),
            createdAt: now - 6 * HOUR
        },
        {
            id: 'demo-task-4',
            rawText: 'Priority badges are unreadable in dark mode',
            title: 'Raise contrast of priority badges in dark mode',
            description: 'Low and Medium badges fall below 4.5:1 against the dark surface. Move them onto the tinted background tokens already used by the status pills.',
            group: 'UI',
            priority: 'Low',
            status: TaskStatus.ISSUE_CREATED,
            issueNumber: 139,
            issueUrl: demoIssueUrl(139),
            createdAt: now - 5 * HOUR
        },
        {
            id: 'demo-task-5',
            rawText: 'Agent logs only appear after the run finishes',
            title: 'Stream agent logs into the console panel',
            description: 'Poll the bridge job while it runs and append output incrementally so the console shows progress instead of a single dump at the end.',
            group: 'DevOps',
            priority: 'High',
            status: TaskStatus.WORKTREE_ACTIVE,
            branchName: 'feat/devops-140',
            issueNumber: 140,
            issueUrl: demoIssueUrl(140),
            agentRunState: 'idle',
            createdAt: now - 3 * HOUR
        },
        {
            id: 'demo-task-6',
            rawText: 'Worktree slots reset when the tab reloads',
            title: 'Persist worktree slots across reloads',
            description: 'Slot assignments live in memory only, so a refresh detaches running work. Persist assignments and rebuild slot paths from the issue number on boot.',
            group: 'Core',
            priority: 'High',
            status: TaskStatus.IMPLEMENTED,
            branchName: 'feat/core-141',
            issueNumber: 141,
            issueUrl: demoIssueUrl(141),
            implementationDetails: DEMO_IMPLEMENTATION,
            agentLogs: DEMO_AGENT_LOGS,
            agentLastCommand: 'opencode run --model demo "Implement issue #141 on branch feat/core-141"',
            agentSessionId: 'demo-session-141',
            agentJobId: 'demo-job-141',
            agentRunState: 'succeeded',
            createdAt: now - 2 * HOUR
        },
        {
            id: 'demo-task-7',
            rawText: 'Bridge requests fail hard on the first timeout',
            title: 'Retry bridge requests with backoff',
            description: 'A single dropped request marks the bridge offline. Retry idempotent calls three times with exponential backoff before flipping the status badge.',
            group: 'DevOps',
            priority: 'Medium',
            status: TaskStatus.PUSHED,
            branchName: 'feat/devops-142',
            issueNumber: 142,
            issueUrl: demoIssueUrl(142),
            agentRunState: 'succeeded',
            createdAt: now - 26 * HOUR
        },
        {
            id: 'demo-task-8',
            rawText: 'Surface bridge metrics in the status bar',
            title: 'Add bridge health metrics to the status bar',
            description: 'Show active jobs and running sessions next to the bridge badge, sourced from the health payload the bridge already returns.',
            group: 'DevOps',
            priority: 'Medium',
            status: TaskStatus.PR_CREATED,
            branchName: 'feat/devops-143',
            issueNumber: 143,
            issueUrl: demoPullUrl(144),
            prNumber: 144,
            vercelStatus: 'pending',
            mergeConflict: false,
            agentRunState: 'succeeded',
            createdAt: now - 30 * HOUR
        },
        {
            id: 'demo-task-9',
            rawText: 'Login page is hard to use with a screen reader',
            title: 'Improve login page accessibility',
            description: 'Label the token field, announce validation errors politely, and give the OAuth button a visible focus ring.',
            group: 'UI',
            priority: 'High',
            status: TaskStatus.PR_MERGED,
            branchName: 'feat/ui-135',
            issueNumber: 135,
            issueUrl: demoPullUrl(136),
            prNumber: 136,
            vercelStatus: 'success',
            mergeConflict: false,
            createdAt: now - 3 * DAY
        },
        {
            id: 'demo-task-10',
            rawText: 'Agent runs disappear after a refresh',
            title: 'Persist agent sessions on the bridge',
            description: 'Write session state to the bridge data directory so a reload can reattach to a running job instead of losing it.',
            group: 'Core',
            priority: 'High',
            status: TaskStatus.PR_MERGED,
            branchName: 'feat/core-130',
            issueNumber: 130,
            issueUrl: demoPullUrl(131),
            prNumber: 131,
            vercelStatus: 'success',
            mergeConflict: false,
            createdAt: now - 5 * DAY
        }
    ];
};

/** Slot layout matching the seeded tasks: two busy worktrees, one free. */
export const createDemoSlots = (root: string, count: number): WorktreeSlot[] => {
    const assignments: Record<number, { taskId: string; path: string }> = {
        1: { taskId: 'demo-task-5', path: `${root}-wt-140` },
        2: { taskId: 'demo-task-6', path: `${root}-wt-141` }
    };

    return Array.from({ length: count }, (_, index) => {
        const id = index + 1;
        const assigned = assignments[id];
        return {
            id,
            taskId: assigned ? assigned.taskId : null,
            path: assigned ? assigned.path : `${root}-wt-${id}`
        };
    });
};

/** Demo settings: a fake repo, a placeholder token, and no real endpoints. */
export const createDemoSettings = (defaults: AppSettings): AppSettings => ({
    ...defaults,
    repoOwner: DEMO_REPO_OWNER,
    repoName: DEMO_REPO_NAME,
    defaultBranch: DEMO_DEFAULT_BRANCH,
    worktreeRoot: DEMO_WORKTREE_ROOT,
    maxWorktrees: DEMO_MAX_WORKTREES,
    githubToken: DEMO_GITHUB_TOKEN,
    agentEndpoint: 'https://demo.flowize.local/run',
    bridgeAuthToken: '',
    agentName: 'demo-agent',
    geminiApiKey: 'demo-key'
});
