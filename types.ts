export enum TaskStatus {
  RAW = 'RAW',
  FORMATTED = 'FORMATTED',
  ISSUE_CREATED = 'ISSUE_CREATED',
  WORKTREE_QUEUED = 'WORKTREE_QUEUED', // Ready to be picked up
  WORKTREE_INITIALIZING = 'WORKTREE_INITIALIZING', // Creating folder and git setup
  WORKTREE_ACTIVE = 'WORKTREE_ACTIVE', // Assigned to a slot
  IMPLEMENTED = 'IMPLEMENTED', // Code written
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
  implementationDetails?: string; // Mock code or summary
  vercelStatus?: 'pending' | 'success' | 'failed';
  createdAt: number;
}

export interface WorktreeSlot {
  id: number;
  taskId: string | null; // ID of the task currently in this slot
  path: string; // Mock path like /worktrees/wt-1
}

export interface AppSettings {
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  worktreeRoot: string;
  maxWorktrees: number;
  githubToken?: string;
}

export type StepId = 1 | 2 | 3 | 4 | 5;