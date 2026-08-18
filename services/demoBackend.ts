/**
 * In-memory backend for demo mode.
 *
 * Every network-backed service (GitHub REST, the local bridge, the agent runner
 * and Gemini) routes here when `isDemoMode()` is true, so the demo never issues
 * a real request and never needs a token. State lives for the lifetime of the
 * page: creating an issue, opening a PR and merging it all stay consistent while
 * the visitor clicks through the workflow.
 */

import { AppSettings, TaskItem, TaskStatus, WorktreeSlot } from '../types';
import type {
    GithubAuthenticatedUser,
    GithubBranch,
    GithubPullRequestDetails,
    GithubRepository,
    TokenValidationResult
} from './githubService';
import {
    DEMO_DEFAULT_BRANCH,
    DEMO_REPO_NAME,
    DEMO_REPO_OWNER,
    DEMO_USER,
    createDemoTasks,
    demoIssueUrl,
    demoPullUrl
} from './demoData';
import { demoDelay } from '../utils/demoMode';

interface DemoIssue {
    number: number;
    title: string;
    body: string;
    labels: { name: string }[];
    html_url: string;
    created_at: string;
    state: 'open' | 'closed';
}

interface DemoPullRequest {
    number: number;
    title: string;
    body: string;
    html_url: string;
    head: { ref: string; sha: string };
    base: { ref: string; sha: string };
    created_at: string;
    merged_at: string | null;
    state: 'open' | 'closed';
}

export interface DemoAgentSession {
    sessionId: string;
    jobId: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
    done: boolean;
    success: boolean;
    exitCode?: number;
    pid: number | null;
    startedAt: number;
    updatedAt: number;
    command: string;
    branch?: string;
    title?: string;
    worktreePath?: string;
    stdout: string;
    stderr?: string;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const isoAgo = (ms: number): string => new Date(Date.now() - ms).toISOString();

const fakeSha = (seed: string): string => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0').repeat(5).slice(0, 40);
};

// --- Mutable demo state -----------------------------------------------------

// GitHub numbers issues and pull requests from the same sequence, so the demo
// hands out numbers from a single counter that starts above the seeded ones.
let nextNumber = 150;
let nextJobId = 1;

const issues = new Map<number, DemoIssue>();
const pullRequests = new Map<number, DemoPullRequest>();
const sessions = new Map<string, DemoAgentSession>();

const seedIssue = (issue: DemoIssue) => issues.set(issue.number, issue);
const seedPullRequest = (pr: DemoPullRequest) => pullRequests.set(pr.number, pr);

const seedState = () => {
    // Open issues mirror the seeded tasks that already carry an issue number, so
    // "Fetch remote issues" in Step 2 returns something recognizable.
    createDemoTasks()
        .filter(task => task.issueNumber && task.status === TaskStatus.ISSUE_CREATED)
        .forEach(task => seedIssue({
            number: task.issueNumber as number,
            title: task.title,
            body: task.description,
            labels: [{ name: task.group }, { name: `Priority: ${task.priority}` }],
            html_url: demoIssueUrl(task.issueNumber as number),
            created_at: new Date(task.createdAt).toISOString(),
            state: 'open'
        }));

    seedIssue({
        number: 145,
        title: 'Empty state for the merged view',
        body: 'Step 5 renders a bare panel when nothing has merged yet. Add an empty state that points back to the review step.',
        labels: [{ name: 'UI' }, { name: 'Priority: Low' }],
        html_url: demoIssueUrl(145),
        created_at: isoAgo(9 * HOUR),
        state: 'open'
    });

    seedPullRequest({
        number: 144,
        title: 'Add bridge health metrics to the status bar',
        body: 'Surfaces active jobs and running sessions next to the bridge badge.',
        html_url: demoPullUrl(144),
        head: { ref: 'feat/devops-143', sha: fakeSha('feat/devops-143') },
        base: { ref: DEMO_DEFAULT_BRANCH, sha: fakeSha(DEMO_DEFAULT_BRANCH) },
        created_at: isoAgo(30 * HOUR),
        merged_at: null,
        state: 'open'
    });

    seedPullRequest({
        number: 136,
        title: 'Improve login page accessibility',
        body: 'Labels the token field and announces validation errors politely.',
        html_url: demoPullUrl(136),
        head: { ref: 'feat/ui-135', sha: fakeSha('feat/ui-135') },
        base: { ref: DEMO_DEFAULT_BRANCH, sha: fakeSha(DEMO_DEFAULT_BRANCH) },
        created_at: isoAgo(3 * 24 * HOUR),
        merged_at: isoAgo(2 * 24 * HOUR),
        state: 'closed'
    });

    seedPullRequest({
        number: 131,
        title: 'Persist agent sessions on the bridge',
        body: 'Writes session state to the bridge data directory so reloads can reattach.',
        html_url: demoPullUrl(131),
        head: { ref: 'feat/core-130', sha: fakeSha('feat/core-130') },
        base: { ref: DEMO_DEFAULT_BRANCH, sha: fakeSha(DEMO_DEFAULT_BRANCH) },
        created_at: isoAgo(5 * 24 * HOUR),
        merged_at: isoAgo(4 * 24 * HOUR),
        state: 'closed'
    });

    const now = Date.now();
    const seedSessions: DemoAgentSession[] = [
        {
            sessionId: 'demo-session-141',
            jobId: 'demo-job-141',
            status: 'completed',
            done: true,
            success: true,
            exitCode: 0,
            pid: 18422,
            startedAt: now - 2 * HOUR,
            updatedAt: now - 2 * HOUR + 4 * MINUTE,
            command: 'opencode run --model demo "Implement issue #141 on branch feat/core-141"',
            branch: 'feat/core-141',
            title: 'Persist worktree slots across reloads',
            worktreePath: '/demo/workspace/storefront-wt-141',
            stdout: '[demo] agent run finished with exit code 0'
        },
        {
            sessionId: 'demo-session-140',
            jobId: 'demo-job-140',
            status: 'running',
            done: false,
            success: false,
            pid: 18510,
            startedAt: now - 6 * MINUTE,
            updatedAt: now - 12 * 1000,
            command: 'opencode run --model demo "Implement issue #140 on branch feat/devops-140"',
            branch: 'feat/devops-140',
            title: 'Stream agent logs into the console panel',
            worktreePath: '/demo/workspace/storefront-wt-140',
            stdout: '[demo] editing services/agentService.ts'
        },
        {
            sessionId: 'demo-session-139',
            jobId: 'demo-job-139',
            status: 'failed',
            done: true,
            success: false,
            exitCode: 1,
            pid: 17988,
            startedAt: now - 5 * HOUR,
            updatedAt: now - 5 * HOUR + 2 * MINUTE,
            command: 'opencode run --model demo "Implement issue #139 on branch feat/ui-139"',
            branch: 'feat/ui-139',
            title: 'Raise contrast of priority badges in dark mode',
            worktreePath: '/demo/workspace/storefront-wt-139',
            stdout: '[demo] tests failed: 1 failing',
            stderr: 'AssertionError: expected contrast ratio >= 4.5, got 3.9'
        },
        {
            sessionId: 'demo-session-138',
            jobId: 'demo-job-138',
            status: 'cancelled',
            done: true,
            success: false,
            exitCode: 130,
            pid: null,
            startedAt: now - 7 * HOUR,
            updatedAt: now - 7 * HOUR + 40 * 1000,
            command: 'opencode run --model demo "Implement issue #138 on branch feat/backend-138"',
            branch: 'feat/backend-138',
            title: 'Cache GitHub issue fetches between step changes',
            worktreePath: '/demo/workspace/storefront-wt-138',
            stdout: '[demo] cancelled by user'
        }
    ];

    seedSessions.forEach(session => sessions.set(session.sessionId, session));
};

seedState();

// --- Simulated GitHub -------------------------------------------------------

export const demoValidateToken = async (): Promise<TokenValidationResult> => {
    await demoDelay(200);
    return {
        valid: true,
        user: DEMO_USER,
        scopes: ['repo'],
        hasRequiredScopes: true,
        missingScopes: []
    };
};

export const demoFetchAuthenticatedUser = async (): Promise<GithubAuthenticatedUser> => {
    await demoDelay(120);
    return DEMO_USER;
};

export const demoFetchRepositories = async (): Promise<GithubRepository[]> => {
    await demoDelay(200);
    return [
        {
            id: 1,
            name: DEMO_REPO_NAME,
            full_name: `${DEMO_REPO_OWNER}/${DEMO_REPO_NAME}`,
            private: false,
            default_branch: DEMO_DEFAULT_BRANCH,
            owner: { login: DEMO_REPO_OWNER }
        },
        {
            id: 2,
            name: 'design-system',
            full_name: `${DEMO_REPO_OWNER}/design-system`,
            private: false,
            default_branch: DEMO_DEFAULT_BRANCH,
            owner: { login: DEMO_REPO_OWNER }
        }
    ];
};

export const demoFetchBranches = async (): Promise<GithubBranch[]> => {
    await demoDelay(180);
    return [
        { name: DEMO_DEFAULT_BRANCH },
        { name: 'develop' },
        { name: 'feat/devops-140' },
        { name: 'feat/core-141' }
    ];
};

export const demoCreateIssue = async (task: TaskItem) => {
    await demoDelay(450);
    const number = nextNumber++;
    const issue: DemoIssue = {
        number,
        title: task.title,
        body: `${task.description}\n\n**Group:** ${task.group}\n**Priority:** ${task.priority}\n\n*Generated by Flowize (demo)*`,
        labels: [{ name: task.group }, { name: `Priority: ${task.priority}` }],
        html_url: demoIssueUrl(number),
        created_at: new Date().toISOString(),
        state: 'open'
    };
    issues.set(number, issue);
    return issue;
};

export const demoFetchIssues = async (): Promise<DemoIssue[]> => {
    await demoDelay(350);
    return Array.from(issues.values())
        .filter(issue => issue.state === 'open')
        .sort((a, b) => b.number - a.number);
};

export const demoCloseIssue = async (issueNumber: number): Promise<void> => {
    await demoDelay(250);
    const issue = issues.get(issueNumber);
    if (issue) {
        issues.set(issueNumber, { ...issue, state: 'closed' });
    }
};

export const demoGetBaseSha = async (branch: string): Promise<string> => {
    await demoDelay(150);
    return fakeSha(branch);
};

export const demoCreateBranch = async (newBranch: string) => {
    await demoDelay(250);
    return { ref: `refs/heads/${newBranch}`, object: { sha: fakeSha(newBranch) } };
};

export const demoCommitFile = async (path: string, branch: string) => {
    await demoDelay(250);
    return { content: { path }, commit: { sha: fakeSha(`${branch}:${path}`) } };
};

export const demoCreatePullRequest = async (head: string, base: string, title: string, body: string) => {
    await demoDelay(600);

    const existing = Array.from(pullRequests.values())
        .find(pr => pr.head.ref === head && pr.state === 'open');
    if (existing) {
        return existing;
    }

    const number = nextNumber++;
    const pr: DemoPullRequest = {
        number,
        title,
        body,
        html_url: demoPullUrl(number),
        head: { ref: head, sha: fakeSha(head) },
        base: { ref: base, sha: fakeSha(base) },
        created_at: new Date().toISOString(),
        merged_at: null,
        state: 'open'
    };
    pullRequests.set(number, pr);
    return pr;
};

export const demoMergePullRequest = async (prNumber: number) => {
    await demoDelay(700);
    const pr = pullRequests.get(prNumber);
    if (pr) {
        pullRequests.set(prNumber, {
            ...pr,
            state: 'closed',
            merged_at: new Date().toISOString()
        });
    }
    return { merged: true, message: 'Pull Request successfully merged (demo)' };
};

export const demoClosePullRequest = async (prNumber: number): Promise<void> => {
    await demoDelay(300);
    const pr = pullRequests.get(prNumber);
    if (pr) {
        pullRequests.set(prNumber, { ...pr, state: 'closed' });
    }
};

export const demoFetchOpenPRs = async (): Promise<DemoPullRequest[]> => {
    await demoDelay(300);
    return Array.from(pullRequests.values())
        .filter(pr => pr.state === 'open')
        .sort((a, b) => b.number - a.number);
};

export const demoFetchMergedPRs = async (): Promise<DemoPullRequest[]> => {
    await demoDelay(300);
    return Array.from(pullRequests.values())
        .filter(pr => Boolean(pr.merged_at))
        .sort((a, b) => b.number - a.number);
};

export const demoFetchPullRequestDetails = async (prNumber: number): Promise<GithubPullRequestDetails> => {
    await demoDelay(250);
    const pr = pullRequests.get(prNumber);
    if (!pr) {
        throw new Error(`Demo pull request #${prNumber} not found`);
    }

    return {
        number: pr.number,
        html_url: pr.html_url,
        title: pr.title,
        state: pr.state,
        mergeable: pr.state === 'open' ? true : null,
        mergeable_state: pr.state === 'open' ? 'clean' : 'merged',
        head: pr.head,
        base: pr.base
    };
};

export const demoFetchCommitStatus = async (ref: string) => {
    await demoDelay(400);
    return {
        state: 'success',
        sha: fakeSha(ref),
        total_count: 2,
        statuses: [
            { context: 'demo/build', state: 'success', description: 'Build succeeded' },
            { context: 'demo/tests', state: 'success', description: '128 passing' }
        ]
    };
};

// --- Simulated local bridge -------------------------------------------------

export const demoBridgeHealth = () => ({
    ok: true,
    authRequired: false,
    persistence: true,
    dataDir: '/demo/.flowize-bridge',
    typedActions: ['agent-run', 'git', 'open-terminal'],
    metrics: {
        activeJobs: 1,
        totalJobs: 14,
        runningSessions: 1,
        completedSessions: 9,
        interruptedSessions: 1,
        failedSessions: 2,
        cancelledSessions: 1,
        totalSessions: sessions.size
    },
    diagnostics: {
        startedAt: Date.now() - 3 * HOUR,
        uptimeMs: 3 * HOUR,
        host: 'demo.flowize.local',
        port: 4141,
        workdir: '/demo/workspace/storefront',
        dataDir: '/demo/.flowize-bridge',
        logLevel: 'info',
        authRequired: false,
        oauthEnabled: false
    }
});

export const demoRunBridgeCommand = async (command: string) => {
    await demoDelay(320);
    return {
        success: true,
        exitCode: 0,
        stdout: `[demo] ${command}`,
        stderr: ''
    };
};

export const demoCreateWorktree = async (task: TaskItem, slot: WorktreeSlot): Promise<void> => {
    await demoDelay(900);
    console.log(`[demo] created worktree ${slot.path} for ${task.branchName}`);
};

export const demoPruneWorktree = async (slot: WorktreeSlot): Promise<void> => {
    await demoDelay(600);
    console.log(`[demo] pruned worktree ${slot.path}`);
};

export const demoPushBranch = async (branchName: string): Promise<void> => {
    await demoDelay(800);
    console.log(`[demo] pushed ${branchName}`);
};

export const demoGetProcessesUsingPath = async () => {
    await demoDelay(150);
    return [];
};

// --- Simulated agent --------------------------------------------------------

const buildAgentScript = (task: TaskItem, slot: WorktreeSlot): string[] => {
    const branch = task.branchName || `feat/${task.group.toLowerCase()}-${task.issueNumber}`;
    return [
        `[demo] attaching to worktree ${slot.path}`,
        `[demo] checked out ${branch}`,
        `[demo] reading issue #${task.issueNumber}: ${task.title}`,
        '[demo] loading skill: .opencode/skills/specflow-worktree-automation/SKILL.md',
        '[demo] planning changes',
        `[demo] editing src/features/${task.group.toLowerCase()}/index.ts`,
        `[demo] editing src/features/${task.group.toLowerCase()}/handlers.ts`,
        '[demo] editing tests/regression.spec.ts',
        '[demo] running: npm test',
        '[demo] 128 passing (3.2s)',
        '[demo] staging 3 files',
        `[demo] commit: ${task.title} (#${task.issueNumber})`,
        '[demo] agent run finished with exit code 0'
    ];
};

const buildImplementationSummary = (task: TaskItem): string => [
    `### ${task.title}`,
    '',
    task.description,
    '',
    '**Changes (simulated)**',
    `- Implemented the change behind issue #${task.issueNumber}`,
    '- Added a regression test covering the reported behaviour',
    '- Updated the feature README with the new flow',
    '',
    '_This output is generated locally by demo mode - no agent was executed._'
].join('\n');

export interface DemoAgentRunResult {
    success: boolean;
    cancelled?: boolean;
    implementation: string;
    logs: string;
    command: string;
    jobId: string;
    sessionId: string;
}

const createCancelledError = (): Error => {
    const error = new Error('Job cancelled');
    error.name = 'CancelledError';
    return error;
};

export const demoRunAgent = async (
    task: TaskItem,
    slot: WorktreeSlot,
    settings?: AppSettings,
    onProgress?: (progress: { logs: string; done: boolean; success: boolean; jobId?: string; sessionId?: string }) => void,
    signal?: AbortSignal
): Promise<DemoAgentRunResult> => {
    const suffix = `${task.issueNumber || task.id}-${nextJobId++}`;
    const jobId = `demo-job-${suffix}`;
    const sessionId = `demo-session-${suffix}`;
    const command = (settings?.agentCommand?.trim() || 'opencode run "{issueNumber}"')
        .replace('{worktreePath}', slot.path)
        .replace('{issueNumber}', String(task.issueNumber ?? ''))
        .replace('{branch}', task.branchName ?? '');

    const script = buildAgentScript(task, slot);
    const startedAt = Date.now();

    sessions.set(sessionId, {
        sessionId,
        jobId,
        status: 'running',
        done: false,
        success: false,
        pid: 19000 + Math.floor(Math.random() * 500),
        startedAt,
        updatedAt: startedAt,
        command,
        branch: task.branchName,
        title: task.title,
        worktreePath: slot.path,
        stdout: ''
    });

    const emitted: string[] = [];

    for (const line of script) {
        if (signal?.aborted) {
            const cancelledLogs = [...emitted, '[demo] cancelled by user'].join('\n');
            sessions.set(sessionId, {
                ...(sessions.get(sessionId) as DemoAgentSession),
                status: 'cancelled',
                done: true,
                success: false,
                exitCode: 130,
                pid: null,
                updatedAt: Date.now(),
                stdout: cancelledLogs
            });
            throw createCancelledError();
        }

        await demoDelay(320);
        emitted.push(line);
        const logs = emitted.join('\n');

        const current = sessions.get(sessionId);
        if (current) {
            sessions.set(sessionId, { ...current, stdout: logs, updatedAt: Date.now() });
        }

        onProgress?.({ logs, done: false, success: false, jobId, sessionId });
    }

    const logs = emitted.join('\n');
    const finished = sessions.get(sessionId);
    if (finished) {
        sessions.set(sessionId, {
            ...finished,
            status: 'completed',
            done: true,
            success: true,
            exitCode: 0,
            pid: null,
            updatedAt: Date.now(),
            stdout: logs
        });
    }

    onProgress?.({ logs, done: true, success: true, jobId, sessionId });

    return {
        success: true,
        implementation: buildImplementationSummary(task),
        logs,
        command,
        jobId,
        sessionId
    };
};

export const demoCancelAgentJob = async (jobId: string): Promise<void> => {
    await demoDelay(200);
    const session = Array.from(sessions.values()).find(item => item.jobId === jobId);
    if (session) {
        sessions.set(session.sessionId, {
            ...session,
            status: 'cancelled',
            done: true,
            success: false,
            exitCode: 130,
            pid: null,
            updatedAt: Date.now()
        });
    }
};

export const demoFetchAllSessions = async (): Promise<DemoAgentSession[]> => {
    await demoDelay(300);
    return Array.from(sessions.values()).sort((a, b) => b.startedAt - a.startedAt);
};

export const demoFetchSession = async (sessionId: string): Promise<DemoAgentSession> => {
    await demoDelay(200);
    const session = sessions.get(sessionId);
    if (!session) {
        throw new Error(`Demo session ${sessionId} not found`);
    }
    return session;
};

// --- Simulated task extraction (stands in for Gemini) -----------------------

// Ordered most specific first: the first pattern that matches wins.
const GROUP_KEYWORDS: { group: string; patterns: RegExp }[] = [
    { group: 'Docs', patterns: /\b(docs?|readme|documentation|changelog)\b/i },
    { group: 'Testing', patterns: /\b(tests?|spec|coverage|flaky|regression)\b/i },
    { group: 'Refactor', patterns: /\b(refactor|cleanup|rename|extract|simplify|dedupe)\b/i },
    { group: 'Auth', patterns: /\b(login|logout|auth|token|oauth|password|sign[- ]?in)\b/i },
    { group: 'UI', patterns: /\b(ui|button|layout|css|style|dark mode|theme|responsive|modal|badge|icon|focus|navigation)\b/i },
    { group: 'DevOps', patterns: /\b(ci|pipeline|deploy|docker|build|bridge|worktree|agent)\b/i },
    { group: 'Backend', patterns: /\b(api|endpoint|server|database|db|query|cache|migration|session)\b/i }
];

const inferGroup = (text: string): string => {
    const match = GROUP_KEYWORDS.find(entry => entry.patterns.test(text));
    return match ? match.group : 'General';
};

const inferPriority = (text: string): 'High' | 'Medium' | 'Low' => {
    if (/\b(crash|broken|fix|bug|urgent|critical|blocker|fails?|error|regression|security)\b/i.test(text)) {
        return 'High';
    }
    if (/\b(nice to have|polish|someday|minor|cosmetic|typo|later)\b/i.test(text)) {
        return 'Low';
    }
    return 'Medium';
};

const toTitle = (text: string): string => {
    const cleaned = text.replace(/^[-*>\d.)\s]+/, '').trim();
    const firstSentence = cleaned.split(/(?<=[.!?])\s/)[0] || cleaned;
    const title = firstSentence.length > 72 ? `${firstSentence.slice(0, 69).trimEnd()}...` : firstSentence;
    return title.charAt(0).toUpperCase() + title.slice(1);
};

/**
 * Rule-based stand-in for the Gemini call: splits raw input into items and
 * derives a title, group and priority from keywords. Deterministic and offline.
 */
export const demoAnalyzeTasks = async (rawInput: string): Promise<TaskItem[]> => {
    await demoDelay(900);

    const chunks = rawInput
        .split(/\r?\n+/)
        .map(line => line.trim())
        .filter(Boolean);

    const items = (chunks.length > 0 ? chunks : [rawInput.trim()]).filter(Boolean);

    return items.map((item, index) => {
        const cleaned = item.replace(/^[-*>\d.)\s]+/, '').trim();
        return {
            id: `demo-generated-${Date.now()}-${index}`,
            rawText: item,
            title: toTitle(cleaned),
            description: `${cleaned}\n\nAcceptance criteria (drafted in demo mode):\n- Reproduce the described behaviour and capture the current result\n- Implement the change and keep existing behaviour intact\n- Cover the change with a test before opening the pull request`,
            group: inferGroup(cleaned),
            priority: inferPriority(cleaned),
            status: TaskStatus.FORMATTED,
            createdAt: Date.now() + index
        } as TaskItem;
    });
};
