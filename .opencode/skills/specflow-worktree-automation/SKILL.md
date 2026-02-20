---
name: specflow-worktree-automation
description: Run the specflow pipeline from intake to issue creation, development branch linking, worktree provisioning, PR creation, merge, and cleanup.
---

# Specflow Worktree Automation Skill

Use this skill when you want to execute the specflow workflow from the CLI.

## Script Location

- `.opencode/scripts/specflow.ts`

## Prerequisites

- Run commands from repo root (`Z:\handyman`)
- GitHub CLI authenticated: `gh auth status`
- Local git repository available with remote `origin`

## Standard Workflow

```bash
# 1) Parse raw input into grouped plan + state
npm run specflow:intake -- --input .opencode/plans/specflow-input-example.md

# 2) Create issues and auto-link Development branches
npm run specflow:issues

# 3) Optional: backfill Development links for older state issues
npm run specflow:backfill-branches

# 4) Provision up to 3 active worktrees by priority
npm run specflow:worktrees

# 4b) Provision worktrees + prepare an Anti-Gravity agent workspace
npm run specflow:worktrees -- --agent --agent-subdir .agent-workspace

# 4c) Provision worktrees + launch a local Anti-Gravity sub-agent per worktree
npm run specflow:worktrees -- --agent --agent-command "antigravity run --worktree {worktreePath} --skill {skillFile} --input {issueDescriptionFile}"

# 5) Create PR for one issue (draft by default)
npm run specflow:pr -- --issue 123

# 6) Mark PR ready at creation time
npm run specflow:pr -- --issue 123 --ready

# 7) Merge after checks + local cleanup
npm run specflow:merge -- --pr 456 --method squash

# 8) Manual local cleanup fallback
npm run specflow:cleanup -- --pr 456
```

## Command Reference

- `npm run specflow:intake -- --input <file> [--state <file>] [--plan <file>]`
- `npm run specflow:issues [-- --state <file>]`
- `npm run specflow:backfill-branches [-- --state <file>]`
- `npm run specflow:worktrees [-- --state <file>] [--worktree-root <path>] [--agent] [--agent-subdir <name>] [--agent-skill <path>] [--agent-command <template>] [--agent-required]`
- `npm run specflow:pr -- --issue <number> [--state <file>] [--base <branch>] [--ready]`
- `npm run specflow:merge -- --pr <number|url> [--method squash|merge|rebase] [--keep-branch]`
- `npm run specflow:cleanup -- --branch <name> | --pr <number|url> | --issue <number> [--state <file>]`

## Notes

- `specflow:issues` creates GitHub issues and links a development branch so the issue Development panel is populated.
- `specflow:worktrees` still comments on the issue with `Development branch: ...` and `Worktree: ...`.
- State is persisted in `.specflow/backlog.json`.
- With `--agent`, each created worktree gets an agent subfolder (default: `.agent-workspace`) plus an `issue-description.md` file sourced from the GitHub issue body.
- `--agent-command` runs once per newly created worktree using placeholders: `{issueNumber}`, `{branch}`, `{title}`, `{worktreePath}`, `{agentWorkspace}`, `{issueDescriptionFile}`, `{briefFile}`, `{skillFile}`.
- You can also set environment variables: `ANTI_GRAVITY_AGENT_COMMAND`, `ANTI_GRAVITY_AGENT_SUBDIR`, `ANTI_GRAVITY_SKILL_FILE`.
