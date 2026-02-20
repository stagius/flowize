#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';

type IssueType = 'feature' | 'bug' | 'task';
type Priority = 'P0' | 'P1' | 'P2' | 'P3';

interface IntakeItem {
  id: string;
  raw: string;
  formattedTitle: string;
  formattedDescription: string;
  topic: string;
  type: IssueType;
  priority: Priority;
  priorityScore: number;
  createdIssueNumber?: number;
  createdIssueUrl?: string;
  branch?: string;
  worktreePath?: string;
  prUrl?: string;
  agentWorkspacePath?: string;
  agentLastRunAt?: string;
  agentLastRunStatus?: 'succeeded' | 'failed' | 'skipped';
  agentLastRunOutput?: string;
}

interface IntakeState {
  createdAt: string;
  sourceFile: string;
  repo: string;
  items: IntakeItem[];
}

interface BackfillResult {
  state: IntakeState;
  linkedCount: number;
  failedCount: number;
}

interface AgentLaunchConfig {
  enabled: boolean;
  subdir: string;
  skillFile: string;
  briefFileName: string;
  commandTemplate?: string;
  required: boolean;
}

const STATE_DIR = resolve(process.cwd(), '.specflow');
const DEFAULT_STATE_FILE = join(STATE_DIR, 'backlog.json');
const DEFAULT_PLAN_FILE = join(STATE_DIR, 'grouped-plan.md');
const DEFAULT_WORKTREE_ROOT = resolve(process.cwd(), '..', 'worktrees');
const DEFAULT_AGENT_SUBDIR = '.agent-workspace';
const DEFAULT_AGENT_ISSUE_DESCRIPTION_FILE = 'issue-description.md';
const DEFAULT_AGENT_SKILL_FILE = resolve(process.cwd(), '.opencode', 'skills', 'specflow-worktree-automation', 'SKILL.md');
const MAX_ACTIVE_WORKTREES = 3;

function run(command: string, options?: { cwd?: string; silent?: boolean }): string {
  return execSync(command, {
    cwd: options?.cwd,
    stdio: options?.silent ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8'
  }).trim();
}

function ensureDirectory(pathValue: string): void {
  if (!existsSync(pathValue)) {
    mkdirSync(pathValue, { recursive: true });
  }
}

function extractRunErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderrValue = String((error as { stderr?: string | Buffer }).stderr ?? '').trim();
    if (stderrValue) {
      return stderrValue;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

function resolveIssueDescription(issueNumber: number, item: IntakeItem): string {
  try {
    const issueBody = run(`gh issue view ${issueNumber} --json body --jq .body`, { silent: true });
    if (issueBody.trim().length > 0) {
      return issueBody;
    }
  } catch (error) {
    const message = extractRunErrorMessage(error);
    console.error(`Failed to fetch body for issue #${issueNumber}: ${message}`);
  }

  return [
    '## Formatted Specification',
    `- Type: ${item.type}`,
    `- Priority: ${item.priority}`,
    `- Topic: ${item.topic}`,
    `- Description: ${item.formattedDescription}`,
    '',
    '## Raw Input',
    item.raw,
    ''
  ].join('\n');
}

function prepareAgentWorkspace(
  item: IntakeItem,
  issueNumber: number,
  worktreePath: string,
  config: AgentLaunchConfig
): { agentWorkspacePath: string; issueDescriptionFilePath: string; skillFilePathForAgent: string } {
  const agentWorkspacePath = resolve(worktreePath, config.subdir);
  ensureDirectory(agentWorkspacePath);

  const issueDescriptionFilePath = resolve(agentWorkspacePath, config.briefFileName);
  const issueDescription = resolveIssueDescription(issueNumber, item);
  writeFileSync(issueDescriptionFilePath, `${issueDescription}\n`, 'utf-8');

  let skillFilePathForAgent = resolve(config.skillFile);
  if (existsSync(skillFilePathForAgent)) {
    const skillContent = readFileSync(skillFilePathForAgent, 'utf-8');
    const copiedSkillPath = resolve(agentWorkspacePath, basename(skillFilePathForAgent));
    writeFileSync(copiedSkillPath, skillContent, 'utf-8');
    skillFilePathForAgent = copiedSkillPath;
  }

  return { agentWorkspacePath, issueDescriptionFilePath, skillFilePathForAgent };
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => values[key] ?? '');
}

function launchLocalSubAgent(
  item: IntakeItem,
  issueNumber: number,
  branch: string,
  worktreePath: string,
  agentWorkspacePath: string,
  issueDescriptionFilePath: string,
  skillFilePath: string,
  config: AgentLaunchConfig
): { status: 'succeeded' | 'failed' | 'skipped'; output: string } {
  const commandTemplate = config.commandTemplate?.trim();
  if (!commandTemplate) {
    return {
      status: 'skipped',
      output: 'No --agent-command provided. Workspace prepared only.'
    };
  }

  const command = renderTemplate(commandTemplate, {
    issueNumber: String(issueNumber),
    branch,
    title: item.formattedTitle,
    worktreePath,
    agentWorkspace: agentWorkspacePath,
    issueDescriptionFile: issueDescriptionFilePath,
    briefFile: issueDescriptionFilePath,
    skillFile: skillFilePath
  });

  try {
    const output = run(command, { cwd: worktreePath, silent: true });
    return {
      status: 'succeeded',
      output: output.length > 0 ? output : 'Sub-agent command completed successfully.'
    };
  } catch (error) {
    const message = extractRunErrorMessage(error);
    return {
      status: 'failed',
      output: message
    };
  }
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    if (!current.startsWith('--')) {
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[current.slice(2)] = true;
      continue;
    }

    parsed[current.slice(2)] = next;
    i += 1;
  }

  return parsed;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

function toSentenceCase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return 'Untitled work item';
  }

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function detectType(raw: string): IssueType {
  const lower = raw.toLowerCase();
  if (/^\s*(task|chore)\s*[:\-]/.test(lower) || /\bp2\s+task\b/.test(lower)) {
    return 'task';
  }
  if (/\bbug\b|\bfix\b|erreur|failed|fails|broken|regression/.test(lower)) {
    return 'bug';
  }
  if (/^\s*feature\s*[:\-]/.test(lower) || /\bfeature\b|nouvelle fonctionnalite|enhancement|ajouter/.test(lower)) {
    return 'feature';
  }
  return 'task';
}

function detectPriority(raw: string): Priority {
  const lower = raw.toLowerCase();

  if (/\bp0\b|\bcritical\b|\bblocker\b|urgent|critique/.test(lower)) {
    return 'P0';
  }
  if (/\bp1\b|\bhigh\b|important/.test(lower)) {
    return 'P1';
  }
  if (/\bp3\b|\blow\b|nice to have/.test(lower)) {
    return 'P3';
  }
  return 'P2';
}

function priorityToScore(priority: Priority, type: IssueType): number {
  const base = priority === 'P0' ? 100 : priority === 'P1' ? 75 : priority === 'P2' ? 50 : 25;
  const typeBonus = type === 'bug' ? 10 : type === 'feature' ? 5 : 0;
  return base + typeBonus;
}

function detectTopic(raw: string): string {
  const lower = raw.toLowerCase();
  const topicRules: Array<{ topic: string; pattern: RegExp }> = [
    { topic: 'Auth', pattern: /auth|login|signin|signup|oauth|password|session/ },
    { topic: 'Payments', pattern: /payment|stripe|invoice|commission|payout|billing/ },
    { topic: 'Notifications', pattern: /email|notification|sms|alert|message/ },
    { topic: 'Tasks Marketplace', pattern: /task|quote|bid|provider|customer|workflow/ },
    { topic: 'Admin', pattern: /admin|moderation|dashboard|backoffice/ },
    { topic: 'Performance', pattern: /performance|speed|cache|optimization|latency/ },
    { topic: 'UI/UX', pattern: /ui|ux|design|layout|responsive|mobile|desktop/ },
    { topic: 'Data', pattern: /database|supabase|migration|sql|schema|rls/ },
    { topic: 'Infra', pattern: /deploy|vercel|ci|pipeline|build|lint|test|release/ }
  ];

  const matching = topicRules.find((rule) => rule.pattern.test(lower));
  return matching ? matching.topic : 'General';
}

function parseInputItems(rawInput: string): string[] {
  const normalized = rawInput.replace(/\r\n/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const bulletLike = lines.filter((line) => /^[-*]|^\d+[.)]/.test(line));
  const source = bulletLike.length >= 2 ? bulletLike : lines;

  return source.map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim());
}

function buildIntakeState(inputFile: string, repo: string): IntakeState {
  const sourceText = readFileSync(inputFile, 'utf-8');
  const parsedItems = parseInputItems(sourceText);

  const items: IntakeItem[] = parsedItems.map((raw, index) => {
    const type = detectType(raw);
    const priority = detectPriority(raw);
    const topic = detectTopic(raw);
    const formattedTitle = toSentenceCase(raw.replace(/\s+/g, ' ').slice(0, 120));

    return {
      id: `item-${index + 1}`,
      raw,
      formattedTitle,
      formattedDescription: `Type: ${type}. Priority: ${priority}. Topic: ${topic}.`,
      topic,
      type,
      priority,
      priorityScore: priorityToScore(priority, type)
    };
  });

  return {
    createdAt: new Date().toISOString(),
    sourceFile: inputFile,
    repo,
    items
  };
}

function writeGroupedPlanMarkdown(state: IntakeState, outputFile: string): void {
  const groups = new Map<string, IntakeItem[]>();

  for (const item of state.items) {
    const existing = groups.get(item.topic) ?? [];
    existing.push(item);
    groups.set(item.topic, existing);
  }

  const topics = Array.from(groups.keys()).sort();
  const lines: string[] = [];
  lines.push('# Specflow Grouped Plan');
  lines.push('');
  lines.push(`Generated: ${state.createdAt}`);
  lines.push(`Source: ${state.sourceFile}`);
  lines.push('');

  for (const topic of topics) {
    lines.push(`## ${topic}`);
    lines.push('');
    const items = groups.get(topic) ?? [];
    const sorted = [...items].sort((a, b) => b.priorityScore - a.priorityScore);

    for (const item of sorted) {
      lines.push(`- [${item.priority}] (${item.type}) ${item.formattedTitle}`);
      lines.push(`  - Raw input: "${item.raw}"`);
      lines.push(`  - Normalized: ${item.formattedDescription}`);
      lines.push('');
    }
  }

  writeFileSync(outputFile, `${lines.join('\n')}\n`, 'utf-8');
}

function saveState(stateFile: string, state: IntakeState): void {
  ensureDirectory(dirname(stateFile));
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}

function loadState(stateFile: string): IntakeState {
  if (!existsSync(stateFile)) {
    throw new Error(`State file not found: ${stateFile}`);
  }

  const raw = readFileSync(stateFile, 'utf-8');
  return JSON.parse(raw) as IntakeState;
}

function listExistingLabels(): Set<string> {
  const output = run('gh label list --limit 200 --json name --jq ".[].name"', { silent: true });
  const labels = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return new Set(labels);
}

function createIssues(state: IntakeState): IntakeState {
  const existingLabels = listExistingLabels();

  for (const item of state.items) {
    if (item.createdIssueNumber) {
      continue;
    }

    const labelCandidates = [item.type, `priority:${item.priority.toLowerCase()}`, `topic:${slugify(item.topic)}`];
    const labels = labelCandidates.filter((label) => existingLabels.has(label));

    const title = `[${item.priority}] ${item.formattedTitle}`;
    const issueBody = [
      '## Formatted Specification',
      `- Type: ${item.type}`,
      `- Priority: ${item.priority}`,
      `- Topic: ${item.topic}`,
      `- Description: ${item.formattedTitle}`,
      '',
      '## Raw Input',
      item.raw
    ].join('\n');

    const temporaryBodyFile = join(STATE_DIR, `${item.id}.issue.md`);
    writeFileSync(temporaryBodyFile, `${issueBody}\n`, 'utf-8');

    const labelArg = labels.length > 0 ? ` --label "${labels.join(',')}"` : '';
    const createCommand = `gh issue create --title "${title.replace(/"/g, '\\"')}" --body-file "${temporaryBodyFile}"${labelArg}`;
    const issueUrl = run(createCommand, { silent: true });
    const issueNumberText = issueUrl.split('/').pop();
    const issueNumber = issueNumberText ? Number(issueNumberText) : NaN;

    if (!Number.isFinite(issueNumber)) {
      throw new Error(`Unable to parse issue number from URL: ${issueUrl}`);
    }

    item.createdIssueNumber = issueNumber;
    item.createdIssueUrl = issueUrl;
  }

  return state;
}

function getDefaultBranchName(): string {
  return run('gh repo view --json defaultBranchRef --jq .defaultBranchRef.name', { silent: true });
}

function createAndLinkDevelopmentBranch(issueNumber: number, branchName: string, baseBranch: string): void {
  run(`gh issue develop ${issueNumber} --name "${branchName}" --base "${baseBranch}"`, { silent: true });
}

function createIssuesWithDevelopmentBranches(state: IntakeState, baseBranch: string): IntakeState {
  const updated = createIssues(state);

  for (const item of updated.items) {
    if (!item.createdIssueNumber || item.branch) {
      continue;
    }

    const branch = `issue/${item.createdIssueNumber}-${slugify(item.formattedTitle)}`;
    createAndLinkDevelopmentBranch(item.createdIssueNumber, branch, baseBranch);
    item.branch = branch;
  }

  return updated;
}

function backfillDevelopmentBranches(state: IntakeState, baseBranch: string): BackfillResult {
  let linkedCount = 0;
  let failedCount = 0;

  for (const item of state.items) {
    if (!item.createdIssueNumber || item.branch) {
      continue;
    }

    const branch = `issue/${item.createdIssueNumber}-${slugify(item.formattedTitle)}`;

    try {
      createAndLinkDevelopmentBranch(item.createdIssueNumber, branch, baseBranch);
      item.branch = branch;
      linkedCount += 1;
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to link development branch for issue #${item.createdIssueNumber}: ${message}`);
    }
  }

  return { state, linkedCount, failedCount };
}

function listManagedWorktrees(worktreeRoot: string): Set<string> {
  ensureDirectory(worktreeRoot);
  const output = run('git worktree list --porcelain', { silent: true });
  const lines = output.split('\n');
  const managed = new Set<string>();

  for (const line of lines) {
    if (!line.startsWith('worktree ')) {
      continue;
    }
    const pathValue = line.replace('worktree ', '').trim();
    if (pathValue.startsWith(worktreeRoot)) {
      managed.add(pathValue);
    }
  }

  return managed;
}

function createWorktrees(state: IntakeState, worktreeRoot: string, agentConfig: AgentLaunchConfig): IntakeState {
  ensureDirectory(worktreeRoot);
  const managed = listManagedWorktrees(worktreeRoot);
  let activeCount = managed.size;

  const candidates = [...state.items]
    .filter((item) => item.createdIssueNumber)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  for (const item of candidates) {
    if (activeCount >= MAX_ACTIVE_WORKTREES) {
      break;
    }

    if (item.worktreePath && managed.has(item.worktreePath)) {
      if (agentConfig.enabled && item.createdIssueNumber) {
        const issueNumber = item.createdIssueNumber;
        const branch = item.branch ?? `issue/${issueNumber}-${slugify(item.formattedTitle)}`;
        const prepared = prepareAgentWorkspace(item, issueNumber, item.worktreePath, agentConfig);
        const runResult = launchLocalSubAgent(
          item,
          issueNumber,
          branch,
          item.worktreePath,
          prepared.agentWorkspacePath,
          prepared.issueDescriptionFilePath,
          prepared.skillFilePathForAgent,
          agentConfig
        );

        if (agentConfig.required && runResult.status !== 'succeeded') {
          throw new Error(`Sub-agent launch failed for issue #${issueNumber}: ${runResult.output}`);
        }

        item.branch = branch;
        item.agentWorkspacePath = prepared.agentWorkspacePath;
        item.agentLastRunAt = new Date().toISOString();
        item.agentLastRunStatus = runResult.status;
        item.agentLastRunOutput = runResult.output;
      }
      continue;
    }

    const issueNumber = item.createdIssueNumber;
    if (!issueNumber) {
      continue;
    }

    const branch = item.branch ?? `issue/${issueNumber}-${slugify(item.formattedTitle)}`;
    const worktreePath = resolve(worktreeRoot, `${issueNumber}-${slugify(item.formattedTitle)}`);

    const localBranchExists = run(`git branch --list "${branch}"`, { silent: true }).length > 0;
    const remoteBranchExists = run(`git ls-remote --heads origin "${branch}"`, { silent: true }).length > 0;
    const defaultBranch = getDefaultBranchName();
    const worktreeCommand = localBranchExists
      ? `git worktree add "${worktreePath}" "${branch}"`
      : remoteBranchExists
        ? `git fetch origin "${branch}" && git worktree add "${worktreePath}" --track -b "${branch}" "origin/${branch}"`
        : `git fetch origin "${defaultBranch}" && git worktree add "${worktreePath}" -b "${branch}" "origin/${defaultBranch}"`;

    run(worktreeCommand, { silent: true });

    let agentStatus: 'succeeded' | 'failed' | 'skipped' = 'skipped';
    let agentOutput = 'Agent workflow not enabled.';
    let agentWorkspacePath = '';

    if (agentConfig.enabled) {
      const prepared = prepareAgentWorkspace(item, issueNumber, worktreePath, agentConfig);
      agentWorkspacePath = prepared.agentWorkspacePath;
      const runResult = launchLocalSubAgent(
        item,
        issueNumber,
        branch,
        worktreePath,
        prepared.agentWorkspacePath,
        prepared.issueDescriptionFilePath,
        prepared.skillFilePathForAgent,
        agentConfig
      );
      agentStatus = runResult.status;
      agentOutput = runResult.output;

      if (agentConfig.required && agentStatus !== 'succeeded') {
        throw new Error(`Sub-agent launch failed for issue #${issueNumber}: ${agentOutput}`);
      }
    }

    const issueCommentBody = [
      `Development branch: \`${branch}\``,
      `Worktree: \`${worktreePath}\``,
      agentConfig.enabled
        ? `Agent workspace: \`${agentWorkspacePath}\`\nAgent run: ${agentStatus}`
        : 'Agent run: skipped (disabled)'
    ].join('\n');
    run(`gh issue comment ${issueNumber} --body "${issueCommentBody.replace(/"/g, '\\"')}"`, { silent: true });

    item.branch = branch;
    item.worktreePath = worktreePath;
    item.agentWorkspacePath = agentWorkspacePath || undefined;
    item.agentLastRunAt = agentConfig.enabled ? new Date().toISOString() : undefined;
    item.agentLastRunStatus = agentConfig.enabled ? agentStatus : 'skipped';
    item.agentLastRunOutput = agentConfig.enabled ? agentOutput : undefined;
    activeCount += 1;
  }

  return state;
}

function createPullRequest(
  state: IntakeState,
  issueNumber: number,
  baseBranch: string,
  isDraft: boolean
): IntakeState {
  const item = state.items.find((candidate) => candidate.createdIssueNumber === issueNumber);

  if (!item) {
    throw new Error(`No backlog item found for issue #${issueNumber}`);
  }
  if (!item.branch || !item.worktreePath) {
    throw new Error(`Issue #${issueNumber} has no managed branch/worktree yet.`);
  }

  run(`git push -u origin "${item.branch}"`, { cwd: item.worktreePath, silent: true });

  const prBody = [
    '## Summary',
    `- Implements #${issueNumber} from specflow pipeline`,
    `- Source raw request: ${item.raw}`,
    '',
    `Closes #${issueNumber}`
  ].join('\n');

  const temporaryBodyFile = join(STATE_DIR, `issue-${issueNumber}.pr.md`);
  writeFileSync(temporaryBodyFile, `${prBody}\n`, 'utf-8');

  const draftArg = isDraft ? ' --draft' : '';
  const prCommand = `gh pr create --base "${baseBranch}" --head "${item.branch}" --title "${item.formattedTitle.replace(/"/g, '\\"')}" --body-file "${temporaryBodyFile}"${draftArg}`;
  const prUrl = run(prCommand, { cwd: item.worktreePath, silent: true });
  item.prUrl = prUrl;

  return state;
}

interface MergeResult {
  branch: string;
  worktreeClosed: boolean;
  branchDeleted: boolean;
}

function resolvePrHeadBranch(prRef: string): string {
  return run(`gh pr view "${prRef}" --json headRefName --jq .headRefName`, { silent: true });
}

function getWorktreePathForBranch(branchName: string): string | null {
  const output = run('git worktree list --porcelain', { silent: true });
  const blocks = output.split('\n\n');

  for (const block of blocks) {
    const lines = block.split('\n');
    const worktreeLine = lines.find((line) => line.startsWith('worktree '));
    const branchLine = lines.find((line) => line.startsWith('branch refs/heads/'));

    if (!worktreeLine || !branchLine) {
      continue;
    }

    const worktreePath = worktreeLine.replace('worktree ', '').trim();
    const listedBranch = branchLine.replace('branch refs/heads/', '').trim();
    if (listedBranch === branchName) {
      return worktreePath;
    }
  }

  return null;
}

function closeWorktreeAndDeleteBranch(branchName: string): { worktreeClosed: boolean; branchDeleted: boolean } {
  let worktreeClosed = false;
  let branchDeleted = false;

  const worktreePath = getWorktreePathForBranch(branchName);
  if (worktreePath) {
    const currentPath = resolve(process.cwd());
    const targetPath = resolve(worktreePath);

    if (targetPath !== currentPath) {
      run(`git worktree remove --force "${worktreePath}"`, { silent: true });
      run('git worktree prune', { silent: true });
      worktreeClosed = true;
    }
  }

  const hasLocalBranch = run(`git branch --list "${branchName}"`, { silent: true }).length > 0;
  if (hasLocalBranch) {
    run(`git branch -d "${branchName}"`, { silent: true });
    branchDeleted = true;
  }

  return { worktreeClosed, branchDeleted };
}

function cleanupBranchArtifacts(branchName: string): MergeResult {
  const { worktreeClosed, branchDeleted } = closeWorktreeAndDeleteBranch(branchName);
  return {
    branch: branchName,
    worktreeClosed,
    branchDeleted,
  };
}

function mergePullRequest(prRef: string, method: 'merge' | 'squash' | 'rebase', deleteBranch: boolean): MergeResult {
  const headBranch = resolvePrHeadBranch(prRef);
  const deleteArg = deleteBranch ? ' --delete-branch' : '';
  run(`gh pr checks "${prRef}"`, { silent: true });
  run(`gh pr merge "${prRef}" --${method}${deleteArg}`, { silent: true });

  if (!deleteBranch) {
    return {
      branch: headBranch,
      worktreeClosed: false,
      branchDeleted: false,
    };
  }

  const { worktreeClosed, branchDeleted } = closeWorktreeAndDeleteBranch(headBranch);
  return {
    branch: headBranch,
    worktreeClosed,
    branchDeleted,
  };
}

function printUsage(): void {
  console.log('specflow commands:');
  console.log('  intake --input <file> [--state <file>] [--plan <file>]');
  console.log('  create-issues [--state <file>]');
  console.log('  backfill-development-branches [--state <file>]');
  console.log('  provision-worktrees [--state <file>] [--worktree-root <path>] [--agent] [--agent-subdir <name>] [--agent-skill <path>] [--agent-command <template>] [--agent-required]');
  console.log('  create-pr --issue <number> [--state <file>] [--base master] [--ready]');
  console.log('  merge-pr --pr <number|url> [--method squash] [--keep-branch]');
  console.log('  cleanup --branch <name> | --pr <number|url> | --issue <number> [--state <file>]');
}

function ensureRepoContext(): string {
  return run('gh repo view --json nameWithOwner --jq .nameWithOwner', { silent: true });
}

function main() {
  ensureDirectory(STATE_DIR);

  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!command) {
    printUsage();
    process.exit(1);
  }

  if (command === 'intake') {
    const inputPathArg = args.input;
    if (typeof inputPathArg !== 'string') {
      throw new Error('Missing required --input path.');
    }

    const inputPath = resolve(process.cwd(), inputPathArg);
    const stateFile = resolve(process.cwd(), typeof args.state === 'string' ? args.state : DEFAULT_STATE_FILE);
    const planFile = resolve(process.cwd(), typeof args.plan === 'string' ? args.plan : DEFAULT_PLAN_FILE);

    const repo = ensureRepoContext();
    const state = buildIntakeState(inputPath, repo);
    writeGroupedPlanMarkdown(state, planFile);
    saveState(stateFile, state);

    console.log(`Grouped plan saved to ${planFile}`);
    console.log(`Backlog state saved to ${stateFile}`);
    console.log(`Parsed ${state.items.length} items.`);
    return;
  }

  if (command === 'create-issues') {
    const stateFile = resolve(process.cwd(), typeof args.state === 'string' ? args.state : DEFAULT_STATE_FILE);
    const state = loadState(stateFile);
    const defaultBranch = getDefaultBranchName();
    const updated = createIssuesWithDevelopmentBranches(state, defaultBranch);
    saveState(stateFile, updated);

    const createdCount = updated.items.filter((item) => item.createdIssueNumber).length;
    console.log(`Issues linked in state: ${createdCount}`);
    return;
  }

  if (command === 'provision-worktrees') {
    const stateFile = resolve(process.cwd(), typeof args.state === 'string' ? args.state : DEFAULT_STATE_FILE);
    const worktreeRoot = resolve(
      process.cwd(),
      typeof args['worktree-root'] === 'string' ? args['worktree-root'] : DEFAULT_WORKTREE_ROOT
    );
    const agentCommand =
      typeof args['agent-command'] === 'string'
        ? args['agent-command']
        : process.env.ANTI_GRAVITY_AGENT_COMMAND;
    const enableAgentWorkspace = args.agent === true || typeof agentCommand === 'string';
    const agentConfig: AgentLaunchConfig = {
      enabled: enableAgentWorkspace,
      subdir:
        typeof args['agent-subdir'] === 'string'
          ? args['agent-subdir']
          : process.env.ANTI_GRAVITY_AGENT_SUBDIR ?? DEFAULT_AGENT_SUBDIR,
      skillFile: resolve(
        process.cwd(),
        typeof args['agent-skill'] === 'string'
          ? args['agent-skill']
          : process.env.ANTI_GRAVITY_SKILL_FILE ?? DEFAULT_AGENT_SKILL_FILE
      ),
      briefFileName: DEFAULT_AGENT_ISSUE_DESCRIPTION_FILE,
      commandTemplate: typeof agentCommand === 'string' ? agentCommand : undefined,
      required: args['agent-required'] === true
    };
    const state = loadState(stateFile);
    const updated = createWorktrees(state, worktreeRoot, agentConfig);
    saveState(stateFile, updated);

    const provisioned = updated.items.filter((item) => item.worktreePath).slice(0, MAX_ACTIVE_WORKTREES);
    console.log('Active managed worktrees:');
    for (const item of provisioned) {
      console.log(`- #${item.createdIssueNumber}: ${item.worktreePath} (${item.branch})`);
    }
    return;
  }

  if (command === 'backfill-development-branches') {
    const stateFile = resolve(process.cwd(), typeof args.state === 'string' ? args.state : DEFAULT_STATE_FILE);
    const defaultBranch = getDefaultBranchName();
    const state = loadState(stateFile);
    const { state: updated, linkedCount, failedCount } = backfillDevelopmentBranches(state, defaultBranch);
    saveState(stateFile, updated);

    console.log(`Backfilled development branches: ${linkedCount}`);
    if (failedCount > 0) {
      console.log(`Failed to backfill: ${failedCount}`);
    }
    return;
  }

  if (command === 'create-pr') {
    const issueArg = args.issue;
    if (typeof issueArg !== 'string') {
      throw new Error('Missing required --issue <number>.');
    }

    const issueNumber = Number(issueArg);
    if (!Number.isFinite(issueNumber)) {
      throw new Error(`Invalid issue number: ${issueArg}`);
    }

    const stateFile = resolve(process.cwd(), typeof args.state === 'string' ? args.state : DEFAULT_STATE_FILE);
    const baseBranch = typeof args.base === 'string' ? args.base : 'master';
    const draft = args.ready !== true;

    const state = loadState(stateFile);
    const updated = createPullRequest(state, issueNumber, baseBranch, draft);
    saveState(stateFile, updated);

    const item = updated.items.find((candidate) => candidate.createdIssueNumber === issueNumber);
    console.log(`Created PR for issue #${issueNumber}: ${item?.prUrl ?? 'unknown URL'}`);
    return;
  }

  if (command === 'merge-pr') {
    const prArg = args.pr;
    if (typeof prArg !== 'string') {
      throw new Error('Missing required --pr <number|url>.');
    }

    const methodValue = typeof args.method === 'string' ? args.method : 'squash';
    const method = methodValue === 'merge' || methodValue === 'rebase' ? methodValue : 'squash';
    const deleteBranch = args['keep-branch'] !== true;

    const mergeResult = mergePullRequest(prArg, method, deleteBranch);
    console.log(`Merged PR ${prArg} with ${method}.`);
    if (deleteBranch) {
      console.log(`Local cleanup branch: ${mergeResult.branch}`);
      console.log(`- Worktree closed: ${mergeResult.worktreeClosed ? 'yes' : 'no'}`);
      console.log(`- Local branch deleted: ${mergeResult.branchDeleted ? 'yes' : 'no'}`);
    }
    return;
  }

  if (command === 'cleanup') {
    const branchArg = args.branch;
    const prArg = args.pr;
    const issueArg = args.issue;

    const providedCount = [branchArg, prArg, issueArg].filter((value) => typeof value === 'string').length;
    if (providedCount !== 1) {
      throw new Error('cleanup requires exactly one of --branch, --pr, or --issue.');
    }

    let targetBranch = '';

    if (typeof branchArg === 'string') {
      targetBranch = branchArg;
    } else if (typeof prArg === 'string') {
      targetBranch = resolvePrHeadBranch(prArg);
    } else if (typeof issueArg === 'string') {
      const issueNumber = Number(issueArg);
      if (!Number.isFinite(issueNumber)) {
        throw new Error(`Invalid issue number: ${issueArg}`);
      }

      const stateFile = resolve(process.cwd(), typeof args.state === 'string' ? args.state : DEFAULT_STATE_FILE);
      const state = loadState(stateFile);
      const item = state.items.find((candidate) => candidate.createdIssueNumber === issueNumber);

      if (!item) {
        throw new Error(`No backlog item found for issue #${issueNumber}`);
      }
      if (!item.branch) {
        throw new Error(`Issue #${issueNumber} has no linked branch in state.`);
      }

      targetBranch = item.branch;
    }

    const result = cleanupBranchArtifacts(targetBranch);
    console.log(`Cleanup branch: ${result.branch}`);
    console.log(`- Worktree closed: ${result.worktreeClosed ? 'yes' : 'no'}`);
    console.log(`- Local branch deleted: ${result.branchDeleted ? 'yes' : 'no'}`);
    return;
  }

  printUsage();
  process.exit(1);
}

main();
