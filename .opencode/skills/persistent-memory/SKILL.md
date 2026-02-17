---
name: persistent-memory
description: Saves session context to local files, surviving compaction and session restarts via checkpoints, todos, and decision logs.
---

# Persistent Memory Skill

Saves context to local files, surviving compaction and session restarts.

## How It Works

1. **Checkpoints** - Compact summaries of session state saved to `.opencode/memory/checkpoints/`
2. **Persistent Todos** - Todo list in `.opencode/memory/todos.md` survives compaction
3. **Decisions Log** - Key decisions tracked in `.opencode/memory/decisions.md`
4. **Auto-save Hook** - Saves checkpoint every 20 file edits

## On Session Start

**Always do this first:**

1. Read `.opencode/memory/checkpoints/latest.md` to restore context
2. Read `.opencode/memory/todos.md` to see pending tasks
3. Read `.opencode/memory/decisions.md` for key decisions made
4. Continue from last known state

```
Agent: Let me check the persistent memory for context...
[Reads latest.md, todos.md, decisions.md]
Agent: I see we were working on X. Continuing from there.
```

## During Work

### Update Todos
After completing tasks, update `.opencode/memory/todos.md`:

```markdown
## Active
- [ ] Current task - status note

## Completed  
- [x] Finished task - outcome
```

### Update Checkpoint
After milestones, update `.opencode/memory/checkpoints/latest.md`:

```markdown
# Checkpoint: 2025-01-30 12:00

## Current Goal
[One-liner objective]

## Completed
- [x] What was done - brief outcome

## In Progress  
- [ ] Current task - current state

## Pending
- [ ] Next tasks

## Key Context
- Important facts the agent needs to remember
- File changes made
- Decisions taken

## Files Modified
- path/to/file.ts:line - what changed
```

### Log Decisions
When making significant decisions, append to `.opencode/memory/decisions.md`:

```markdown
## [Date] Decision Title
**Context:** Why this came up
**Decision:** What was decided  
**Rationale:** Why this approach
```

## Before Compaction

**Critical:** Before running `/compact`, ensure:

1. `todos.md` is up to date
2. `latest.md` checkpoint reflects current state
3. Any important context is written to files

## Checkpoint Triggers

Save a checkpoint when:
- Completing a major todo item
- Making a key architectural decision
- Before switching to a different task area
- Before running `/compact`
- Every ~20 file edits (auto-triggered by hook)

## File Locations

| File | Purpose |
|------|---------|
| `.opencode/memory/todos.md` | Persistent todo list |
| `.opencode/memory/checkpoints/latest.md` | Current state checkpoint |
| `.opencode/memory/checkpoints/[timestamp].md` | Historical checkpoints |
| `.opencode/memory/decisions.md` | Decision log |
| `.opencode/memory/session.json` | Session metadata |

## Efficiency Guidelines

- Keep checkpoints under 100 lines
- Summarize, don't dump raw content
- Only track essential context
- Prune old checkpoints (keep last 5)
- Use bullet points, not prose

## Commands

- `checkpoint` - Manually save a checkpoint
- `restore` - Restore from a specific checkpoint
