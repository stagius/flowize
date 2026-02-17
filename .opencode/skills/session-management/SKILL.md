---
name: session-management
description: Complete session continuity combining persistent memory, strategic compaction, iterative retrieval, and continuous learning for context preservation across sessions.
---

# Session Management Skill

A unified approach to session continuity that combines four complementary patterns:
- **Persistent Memory** - State tracking across sessions
- **Strategic Compact** - When to trigger context preservation  
- **Iterative Retrieval** - Context restoration on resume
- **Continuous Learning** - Pattern extraction for future sessions

---

## Quick Reference

| Phase | Action | Files |
|-------|--------|-------|
| Session Start | Read memory files, restore context | `checkpoints/latest.md`, `todos.md`, `decisions.md` |
| During Work | Update todos after each task | `todos.md` |
| Milestone | Save checkpoint | `checkpoints/latest.md` |
| Before Compact | Update all memory files, prune old entries | All memory files |
| Session End | Extract patterns for learning | `decisions.md` |

---

## 1. Session Start Protocol

**Always do this first:**

```
1. Read .opencode/memory/checkpoints/latest.md
2. Read .opencode/memory/todos.md  
3. Read .opencode/memory/decisions.md
4. Apply iterative retrieval if context gaps exist
5. Continue from last known state
```

### Iterative Retrieval (if needed)

When checkpoint references files you haven't read:

```
Cycle 1: DISPATCH
  - Search for files mentioned in checkpoint
  - Grep for keywords from current goal

Cycle 2: EVALUATE  
  - Score relevance (0-1) for each file
  - Identify missing context gaps

Cycle 3: REFINE
  - Add discovered terminology to search
  - Exclude low-relevance files
  - Stop when 3+ high-relevance files found
```

Max 3 cycles, then proceed with best available context.

---

## 2. During Work

### Update Todos Immediately

After completing ANY task, update `.opencode/memory/todos.md`:

```markdown
## Active
- [ ] Current task - brief status

## Done (Last 5 Only)
- [x] Completed task - outcome
```

### Log Decisions When Made

Append significant decisions to `.opencode/memory/decisions.md`:

```markdown
## [DATE] Decision Title
**Why:** One line context
**Decision:** What was decided
```

**Keep only the last 5 decisions** - prune older entries.

---

## 3. Checkpoint Triggers

Save a checkpoint to `.opencode/memory/checkpoints/latest.md` when:

| Trigger | Priority |
|---------|----------|
| Major todo completed | High |
| Architectural decision made | High |
| Before switching task areas | Medium |
| Before running `/compact` | Critical |
| Every ~10 file edits | Medium |

### Checkpoint Format (Max 50 lines)

```markdown
# Checkpoint: [DATE]

## Goal
[One sentence]

## Done
- [x] Task - outcome

## In Progress  
- [ ] Task - current state

## Next
- [ ] Task

## Context
- Only facts needed to continue
- File references: path/file.ts:line
```

---

## 4. Strategic Compaction

### When to Compact

| Signal | Action |
|--------|--------|
| After exploration, before execution | Compact research, keep plan |
| After completing a milestone | Fresh start for next phase |
| Context feels "heavy" | Review and compact |
| ~50+ tool calls in session | Consider compacting |

### Pre-Compact Checklist

Before running `/compact`:

1. [ ] `todos.md` reflects current state
2. [ ] `latest.md` checkpoint is fresh
3. [ ] `decisions.md` has recent decisions
4. [ ] All files pruned to line limits

### When NOT to Compact

- Mid-implementation of related changes
- During active debugging session
- Before completing current todo item

---

## 5. Continuous Learning

### Pattern Recognition

Watch for these patterns to extract:

| Pattern Type | Example |
|--------------|---------|
| Error resolution | "Jest mock hoisting requires specific import order" |
| User corrections | "Always use French for user-facing strings" |
| Workarounds | "Supabase RLS requires service client for admin ops" |
| Project conventions | "Use kebab-case for all file names" |

### Extraction Criteria

Promote to a learned skill when:
- Same pattern appears 3+ times
- Pattern is project-agnostic (reusable)
- Pattern has clear trigger conditions

### Log Candidates

In `decisions.md`, note skill candidates:

```markdown
## [DATE] Candidate Skill: test-isolation
**Pattern:** Always reset mocks in afterEach
**Occurrences:** 3 times this session
**Trigger:** When writing test files
```

---

## 6. File Locations & Limits

| File | Purpose | Max Lines |
|------|---------|-----------|
| `.opencode/memory/checkpoints/latest.md` | Current state | 50 |
| `.opencode/memory/todos.md` | Task tracking | 30 |
| `.opencode/memory/decisions.md` | Key decisions | 20 |

### Pruning Rules

1. **Todos**: Keep only last 5 completed items
2. **Decisions**: Keep only last 5 entries
3. **Checkpoint**: Remove facts no longer relevant
4. **Never accumulate**: Replace old content, don't append

---

## 7. Anti-Patterns

| Don't Do This | Do This Instead |
|---------------|-----------------|
| Dump full code snippets | Summarize: "Added auth check at auth.ts:45" |
| Keep all historical todos | Prune to last 5 completed |
| Write paragraphs | Use bullet points |
| Batch todo updates | Update immediately after each task |
| Compact mid-task | Finish current todo first |
| Guess context after restart | Use iterative retrieval |

---

## 8. Workflow Diagram

```
SESSION START
     │
     ▼
┌─────────────────┐
│ Read Memory     │ ◄── checkpoints/latest.md
│ Files           │     todos.md, decisions.md
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Context Gaps?   │─Yes─▶│ Iterative        │
│                 │      │ Retrieval        │
└────────┬────────┘      └────────┬─────────┘
         │No                      │
         ◄────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Work on Tasks   │ ──▶ Update todos.md after each
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Milestone?      │─Yes─▶│ Save Checkpoint  │
│                 │      │ Log Decisions    │
└────────┬────────┘      └──────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Context Heavy?  │─Yes─▶│ Strategic        │
│ (~50 tool calls)│      │ Compact          │
└────────┬────────┘      └────────┬─────────┘
         │No                      │
         │                        ▼
         │               ┌──────────────────┐
         │               │ Update All Memory│
         │               │ Before /compact  │
         │               └────────┬─────────┘
         │                        │
         ◄────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Session End     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Extract         │ ──▶ Identify recurring patterns
│ Patterns        │     Log candidates to decisions.md
└─────────────────┘
```

---

## Related Skills

- `persistent-memory` - Detailed memory file management
- `strategic-compact` - Compaction timing heuristics
- `continuous-learning` - Pattern extraction automation
- `iterative-retrieval` - Context retrieval algorithm
