---
name: pro-workflow-core
description: Battle-tested workflows from power users. Self-correcting memory, parallel sessions, wrap-up rituals, and the 80/20 AI coding ratio. Optimized for OpenCode.
tools: Read, Glob, Grep, Bash, Edit, Write, Task
---

# Pro Workflow - Core Patterns

Real-world OpenCode patterns from power users who ship production code daily. Not theory - workflows that compound over time.

## The Core Insight

> "80% of my code is written by AI, 20% is spent reviewing and correcting it." - Karpathy

This skill optimizes for that ratio. Every pattern here reduces correction cycles.

---

## 1. The Self-Correction Loop

**The single most powerful pattern.** Your memory trains itself through corrections.

### How It Works

When you correct OpenCode:
1. OpenCode acknowledges the mistake
2. Proposes a rule to prevent it
3. You approve → rule goes into project memory
4. Future sessions avoid the same mistake

### Implementation for OpenCode

Create a `.opencode/LEARNED.md` file in your project:

```markdown
# Learned Patterns

## Self-Correction Protocol

When the user corrects me or I make a mistake:
1. Acknowledge specifically what went wrong
2. Propose a concise rule: `[LEARN] Category: One-line rule`
3. Wait for approval before adding to this LEARNED section

## LEARNED Rules

### Navigation
<!-- Auto-populated through corrections -->

### Editing
<!-- Auto-populated through corrections -->

### Testing
<!-- Auto-populated through corrections -->

### Git
<!-- Auto-populated through corrections -->

### Quality
<!-- Auto-populated through corrections -->

### Architecture
<!-- Auto-populated through corrections -->
```

### Trigger Phrases

- "Add that to your rules"
- "Remember this"
- "Don't do that again"
- "Learn from this"

### Example Flow

```
User: You edited the wrong file
OpenCode: I edited src/utils.ts when you meant src/lib/utils.ts.

[LEARN] Navigation: Confirm full path before editing files with common names.

Should I add this to .opencode/LEARNED.md?
```

---

## 2. Parallel Sessions with Task Tool

**Zero dead time.** While one agent thinks, delegate to another.

### Setup with OpenCode Task Tool

```
# When blocked on long operations, delegate to subagents
# Use the Task tool for parallel exploration
# Use the explore agent for read-only research
# Use the general agent for independent work
```

### When to Parallelize

| Scenario | Action |
|----------|--------|
| Waiting on tests | Start new feature exploration with Task tool |
| Long build | Debug issue in parallel with explore agent |
| Exploring approaches | Try 2-3 simultaneously with multiple Task calls |

### Usage Pattern

```markdown
## Parallel Work
When blocked on long operations:
- Use Task tool with explore agent for read-only exploration
- Use Task tool with general agent for independent implementation
- Delegate background tasks while continuing main work
```

---

## 3. The Wrap-Up Ritual

End sessions with intention. Capture learnings, verify state.

### Checklist

1. **Changes Audit** - List modified files, uncommitted changes
2. **State Check** - Run `git status`, tests, lint
3. **Learning Capture** - What mistakes? What worked?
4. **Next Session** - What's next? Any blockers?
5. **Summary** - One paragraph of what was accomplished

**Use the `wrap-up-ritual` skill when ending sessions.**

---

## 4. Split Memory Architecture

For complex projects, modularize OpenCode memory.

### Structure

```
.opencode/
├── README.md           # Entry point (auto-loaded)
├── WORKFLOWS.md        # Workflow rules
├── STYLE.md           # Style preferences
└── LEARNED.md         # Auto-populated corrections
```

### WORKFLOWS.md

```markdown
# Workflow Rules

## Planning
Plan mode when: >3 files, architecture decisions, multiple approaches.

## Quality Gates
Before complete: lint, typecheck, test --related.

## Subagents
Use Task tool for: parallel exploration, background tasks.
Avoid for: tasks needing conversation context.
```

### STYLE.md

```markdown
# Style Preferences

- Concise over verbose
- Action over explanation
- Acknowledge mistakes directly
- No features beyond scope
- TypeScript strict mode always
```

---

## 5. The 80/20 Review Pattern

Batch reviews at checkpoints, not every change.

### Review Points

1. After plan approval
2. After each milestone
3. Before destructive operations
4. At wrap-up

### Guidelines

```markdown
## Review Checkpoints
Pause for review at:
- Plan completion
- >5 file edits
- Git operations
- Auth/security code
- Database migrations

Between checkpoints: proceed with confidence.
```

---

## 6. Context Discipline

Token budget is precious. Manage it.

### Rules

1. Read before edit
2. Use Task tool to isolate high-volume operations
3. Use explore agent for read-only codebase exploration
4. Summarize explorations before returning
5. Delegate tests, logs, docs to subagents

### Good Delegation Points

- Before large file searches
- After planning, before execution
- When exploring multiple approaches
- Before switching task domains

### OpenCode-Specific Tips

- Use `glob` tool for file discovery instead of reading directories
- Use `grep` tool for content search instead of reading all files
- Use Task tool with explore agent for codebase exploration
- Keep main session focused on implementation

---

## 7. Learning Log

Auto-document insights from sessions.

### Pattern

After completing tasks, capture learnings to `.opencode/LEARNED.md`:

```markdown
## Learning Log

[2026-02-19] [Testing]: Always mock external APIs to avoid flaky tests
[2026-02-19] [Navigation]: Auth middleware lives in src/middleware/ not src/auth/
[2026-02-18] [Git]: Use conventional commits for better changelog generation
```

**Use the `learning-capture` skill to save learnings systematically.**

---

## 8. Quality Gates

Automated checks before commits.

### Pre-Commit Checklist

```bash
# Lint
npm run lint

# Type check
npm run typecheck

# Tests (changed files only)
npm test -- --changed --passWithNoTests

# Git status
git status
```

### Code Review Scan

Before committing, check for:
- `console.log` / `debugger` statements
- TODO/FIXME/HACK comments without tickets
- Hardcoded secrets or API keys
- Leftover test-only code

**Use the `smart-commit` skill for quality-gated commits.**

---

## Quick Setup

### Minimal

Create `.opencode/README.md`:

```markdown
# OpenCode Configuration

## Pro Workflow

### Self-Correction
When corrected, propose rule → add to LEARNED.md after approval.

### Planning
Multi-file tasks: plan first, wait for "proceed".

### Quality Gates
After edits: lint, typecheck, test.

### Parallel Work
Use Task tool for independent exploration and background work.

See `.opencode/LEARNED.md` for accumulated patterns.
```

### Full Setup

Create the split memory structure:
- `.opencode/README.md` - Main entry point
- `.opencode/WORKFLOWS.md` - Workflow rules
- `.opencode/STYLE.md` - Style preferences
- `.opencode/LEARNED.md` - Learned patterns (auto-populated)

---

## Available Skills

This pro-workflow adaptation includes:

| Skill | Purpose |
|-------|---------|
| `pro-workflow-core` | Core patterns and philosophy (this skill) |
| `wrap-up-ritual` | End-of-session checklist |
| `smart-commit` | Quality-gated commits with code review |
| `learning-capture` | Systematic learning documentation |
| `session-replay` | Surface past learnings for current task |

---

## Philosophy

1. **Compound improvements** - Small corrections → big gains over time
2. **Trust but verify** - Let AI work, review at checkpoints
3. **Zero dead time** - Parallel sessions with Task tool
4. **Memory is precious** - Both yours and OpenCode's token budget
5. **Learn continuously** - Every correction becomes a rule

---

## Integration with Existing OpenCode Skills

Pro-workflow complements existing OpenCode skills:

- **Use with `tdd-workflow`** - Quality gates align with TDD principles
- **Use with `git-commit`** - Smart commit enhances existing git workflow
- **Use with `strategic-compact`** - Context discipline fits compaction strategy
- **Use with `persistent-memory`** - Learning log enhances memory persistence
- **Use with `coding-standards`** - Self-correction enforces standards automatically

---

*Adapted from pro-workflow by rohitg00. Optimized for OpenCode workflows.*
