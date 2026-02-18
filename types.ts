export enum TaskStatus {
  RAW = 'RAW',
  FORMATTED = 'FORMATTED',
  ISSUE_CREATED = 'ISSUE_CREATED',
  WORKTREE_QUEUED = 'WORKTREE_QUEUED', // Ready to be picked up
  WORKTREE_INITIALIZING = 'WORKTREE_INITIALIZING', // Creating folder and git setup
  WORKTREE_ACTIVE = 'WORKTREE_ACTIVE', // Assigned to a slot
  IMPLEMENTED = 'IMPLEMENTED', // Code written
  PUSHED = 'PUSHED', // Branch pushed, awaiting PR creation
  PR_CREATED = 'PR_CREATED', // Pushed and PR open
  PR_MERGED = 'PR_MERGED', // Done
}

export interface TaskItem {
  id: string;
  rawText: string;
  title: string;
  description: string;
  group: string;
  priority: 'High' | 'Medium' | 'Low';
  status: TaskStatus;
  branchName?: string;
  prNumber?: number;
  issueNumber?: number;
  issueUrl?: string;
  implementationDetails?: string;
  agentLogs?: string;
  agentLastCommand?: string;
  agentRunState?: 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  vercelStatus?: 'pending' | 'success' | 'failed';
  mergeConflict?: boolean;
  reviewFeedback?: string;
  createdAt: number;
}

export interface WorktreeSlot {
  id: number;
  taskId: string | null; // ID of the task currently in this slot
  path: string;
}

export interface AppSettings {
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  worktreeRoot: string;
  maxWorktrees: number;
  githubToken?: string;
  antiGravityAgentCommand?: string;
  antiGravityAgentName?: string;
  antiGravityAgentEndpoint?: string;
  antiGravityAgentSubdir?: string;
  antiGravitySkillFile?: string;
  model?: string;
}

export type StepId = 1 | 2 | 3 | 4 | 5;
