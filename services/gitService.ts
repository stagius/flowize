import { AppSettings, TaskItem, WorktreeSlot } from '../types';

/**
 * Simulates local git operations.
 * In a real Electron/Node environment, this would use `child_process.exec`.
 */

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const createWorktree = async (settings: AppSettings, task: TaskItem, slot: WorktreeSlot): Promise<void> => {
  console.log(`[GitService] Initializing worktree for ${task.branchName}`);

  // 1. Fetch latest refs
  console.log(`> git fetch origin`);
  await delay(600);

  // 2. Create directory (Simulated)
  console.log(`> mkdir -p ${slot.path}`);
  await delay(300);

  // 3. Create worktree and branch
  const cmd = `git worktree add -b ${task.branchName} ${slot.path} origin/${settings.defaultBranch}`;
  console.log(`> ${cmd}`);
  await delay(1500); // Simulate the work of checking out files

  console.log(`[GitService] Worktree ready at ${slot.path}`);
};

export const pruneWorktree = async (slot: WorktreeSlot, branchName?: string): Promise<void> => {
  console.log(`[GitService] Cleaning up worktree at ${slot.path}`);

  if (branchName) {
      console.log(`> git push origin ${branchName}`);
      await delay(1000);
  }

  console.log(`> git worktree remove ${slot.path}`);
  await delay(800);

  console.log(`> git worktree prune`);
  await delay(200);
};