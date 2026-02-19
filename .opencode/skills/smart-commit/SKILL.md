---
name: smart-commit
description: Create well-crafted commits with quality gates, code review, and conventional commit messages. Prevents common commit mistakes.
tools: Bash, Read, Grep, Glob
---

# Smart Commit - Quality-Gated Commits

Create professional commits after running comprehensive quality checks. This skill integrates with OpenCode's existing git-commit skill while adding pro-workflow quality gates.

## Process

### 1. Pre-Commit Checks

First, inspect what's about to be committed:

```bash
git status
git diff --stat
git diff --cached --stat
```

Review and verify:
- Any unstaged changes that should be included?
- Any files that shouldn't be committed?
  - `.env` files
  - `credentials.json` or API keys
  - Large binary files
  - `node_modules` or build artifacts
  - Personal configuration files

**If dangerous files detected, STOP and warn the user.**

### 2. Quality Gates

Run all project quality checks:

```bash
# Lint (show last 5 lines for summary)
npm run lint 2>&1 | tail -5

# Type check (show last 5 lines for summary)
npm run typecheck 2>&1 | tail -5

# Tests on changed files only (show last 10 lines)
npm test -- --changed --passWithNoTests 2>&1 | tail -10
```

**Quality gate rules:**
- ✓ All checks must pass before committing
- ⚠ Skip only if user explicitly says `--no-verify`
- ⚠ If checks fail, offer to fix issues first

### 3. Code Review Scan

Scan staged changes for common issues:

```bash
# Check for console.log/debugger in staged files
git diff --cached | grep -E "(console\.(log|error|warn|debug)|debugger)"

# Check for TODO/FIXME without ticket references
git diff --cached | grep -E "(TODO|FIXME|HACK)" | grep -v -E "(TODO-[0-9]+|FIXME-[0-9]+|#[0-9]+)"

# Check for potential secrets (basic patterns)
git diff --cached | grep -E "(api[_-]?key|secret|password|token)" -i
```

**If issues found:**
- Flag each issue with file and line number
- Explain why it's problematic
- Ask: "Fix these before committing? (yes/no)"
- Give option to proceed anyway with `--no-verify`

### 4. Craft Commit Message

Based on the staged diff, draft a conventional commit message:

```
<type>(<scope>): <short summary>

<body - what changed and why>

<footer - breaking changes, issues>
```

**Commit Types:**
- `feat` - New feature (user-facing)
- `fix` - Bug fix (user-facing)
- `refactor` - Code restructuring (no behavior change)
- `perf` - Performance improvement
- `test` - Adding or updating tests
- `docs` - Documentation changes
- `chore` - Maintenance (deps, configs)
- `ci` - CI/CD changes
- `style` - Code style/formatting only

**Commit Message Rules:**
- Summary line: under 72 characters
- Body: explain **why** not **what** (code shows what)
- Reference issue numbers: `Closes #123`, `Fixes #456`
- No generic messages: ❌ "fix bug", "update code", "changes"
- Be specific: ✓ "fix race condition in auth middleware"

**Analysis approach:**
1. Read the actual staged changes (use `git diff --cached`)
2. Identify the primary change type
3. Determine the scope (affected module/area)
4. Explain the motivation/context in body
5. Reference any related issues

### 5. Stage and Commit

After user approves the commit message:

```bash
# Stage specific files (avoid git add -A)
git add [specific files listed earlier]

# Commit with the crafted message
git commit -m "<message>"

# Show the commit for confirmation
git log -1 --stat
```

**Output:**
```
Committed: <hash>
<type>(<scope>): <summary>

Files changed: X
Insertions: +Y
Deletions: -Z
```

### 6. Learning Check

After successful commit, ask:

```
Any learnings from this change to capture?
- Patterns worth adding to .opencode/LEARNED.md?
- Mistakes that led to this fix?
- Better approaches discovered?
```

If user identifies learnings, use the `learning-capture` skill.

### 7. Push Check (Optional)

If changes are ready to push:

```bash
git push
```

**Push safety rules:**
- Never force push to main/master without explicit user request
- Warn if pushing to main/master branch
- Confirm before pushing if branch hasn't been pushed before

---

## Usage

```
smart-commit
smart-commit --no-verify
smart-commit --amend
smart-commit --push
```

## Options

- `--no-verify` - Skip quality gates (use sparingly for WIP commits)
- `--amend` - Amend the previous commit instead of creating new
- `--push` - Push to remote after commit

---

## Example Flow

```
> Use smart-commit skill

Pre-commit checks:
  Staged: 2 files
  - src/auth/login.ts (+45 -12)
  - src/auth/session.ts (+8 -3)
  
Quality gates:
  ✓ Lint: PASS
  ✓ Types: PASS
  ✓ Tests: 12/12 PASS

Code review:
  ⚠ Found TODO without ticket in src/auth/login.ts:42
    → "TODO: Add rate limiting"
  
Fix before committing? (y/n)

---

[After user fixes or approves]

Suggested commit message:

  feat(auth): add rate limiting to login endpoint
  
  Limit login attempts to 5 per IP per 15 minutes using
  Redis-backed sliding window. Returns 429 with Retry-After
  header when exceeded.
  
  Closes #142

Commit with this message? (y/n)

---

[After commit]

Committed: a1b2c3d
feat(auth): add rate limiting to login endpoint

Files changed: 2
Insertions: +53
Deletions: -15

Any learnings to capture? (y/n)
```

---

## Integration with OpenCode

This skill complements the existing `git-commit` skill:

- **Use `git-commit`** - When you want OpenCode's default git workflow
- **Use `smart-commit`** - When you want pro-workflow quality gates and code review

Can be used together with:
- `wrap-up-ritual` - Use after wrap-up when ready to commit
- `learning-capture` - Capture learnings after commit
- `tdd-workflow` - Quality gates align with TDD principles
- `security-review` - Additional security scanning for sensitive changes

---

## Safety Features

1. **Secret detection** - Prevents committing API keys, passwords
2. **Quality enforcement** - No commits with failing tests/lint
3. **Code smell detection** - Catches console.log, debugger, undocumented TODOs
4. **Conventional commits** - Enforces clear, searchable commit messages
5. **Specific staging** - Avoids accidental `git add -A`

---

## When to Use

Use this skill when:
- Ready to commit after completing work
- Want to ensure code quality before committing
- Need help crafting a good commit message
- Want to catch common commit mistakes

Trigger phrases:
- "commit these changes"
- "create a commit"
- "smart commit"
- "commit with quality checks"

---

*Part of pro-workflow adapted for OpenCode*
