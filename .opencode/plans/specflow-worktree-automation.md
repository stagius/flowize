# Specflow Worktree Automation

This workflow automates the path from raw task specifications to GitHub issues, worktree branches, pull requests, and merge.

## What It Covers

1. Parse your raw list of tasks/bugs/features.
2. Group and normalize items by topic (while preserving raw text).
3. Create GitHub issues with both normalized and raw sections.
4. Provision up to 3 concurrent worktrees for the most critical open items.
5. Push branch and create PR when you give the go-ahead.
6. Merge PR into `master` after preview/testing approval.

## Prerequisites

- GitHub CLI authenticated (`gh auth status`)
- Local branch `master` available
- Clean enough git state to create worktrees safely

## Commands

All commands are wrappers around `.opencode/scripts/specflow.ts`.

```bash
# 1) Intake and grouping from raw text file
npm run specflow:intake -- --input .opencode/plans/specflow-input-example.md

# 2) Create GitHub issues
npm run specflow:issues

# 2b) Backfill Development links for already-created issues in state
npm run specflow:backfill-branches

# 3) Create up to 3 priority worktrees
npm run specflow:worktrees

# 4) After implementation + your review approval, create PR (draft by default)
npm run specflow:pr -- --issue 123

# 4b) Create PR directly as ready-for-review
npm run specflow:pr -- --issue 123 --ready

# 5) After Vercel preview validation + merge approval
npm run specflow:merge -- --pr 456 --method squash

# 6) Manual cleanup helper (if needed)
npm run specflow:cleanup -- --pr 456
npm run specflow:cleanup -- --branch issue/456-my-branch
npm run specflow:cleanup -- --issue 456
```

`specflow:merge` now attempts local cleanup in order: close worktree first, then delete local branch.

## Generated State

- `.specflow/backlog.json`: persistent state of normalized items and links to issues/branches/PRs.
- `.specflow/grouped-plan.md`: grouped plan with normalized + raw input per item.

These files are ignored by git.

## Input Format

Use plain text or bullets. One item per line is recommended.

Examples:

- `P0 bug: provider cannot submit bid when commission is 0`
- `feature: add draft autosave to task creation form`
- `task: improve admin moderation filters`

The intake process auto-detects:

- Type: `bug`, `feature`, `task`
- Priority: `P0`, `P1`, `P2`, `P3`
- Topic: Auth, Payments, Tasks Marketplace, Notifications, Admin, Performance, UI/UX, Data, Infra, General

## Notes About Branch Association

When issues are created, the script now:

- Creates and links a GitHub development branch named `issue/<number>-<slug>` (fills the issue "Development" field)
- Stores that branch name in `.specflow/backlog.json`

When worktrees are provisioned, the script:

- Reuses that linked branch (local or remote)
- Posts an issue comment with branch and worktree path (`Development branch: ...`)

This keeps both the issue Development panel and issue comments in sync before PR creation.

If you created issues before this behavior existed, run `npm run specflow:backfill-branches` to link missing Development branches for backlog items that have an issue number but no stored branch.

## Typical Human-in-the-Loop Flow

1. You provide a raw backlog.
2. Run intake, inspect `.specflow/grouped-plan.md`, then run issue creation.
3. Run worktree provisioning and implement in each active worktree.
4. You review code locally.
5. On your go-ahead, run PR creation.
6. After Vercel preview checks pass and you approve, run merge command.
