---
name: wrap-up-ritual
description: End your OpenCode session with intention. Audit changes, capture learnings, verify state, and plan next steps.
tools: Bash, Read, Grep, Glob
---

# Wrap-Up Ritual

End your OpenCode session systematically. This ritual ensures nothing is forgotten and every session contributes to your knowledge base.

## Execute This Checklist

### 1. Changes Audit

Run git commands to see what changed:

```bash
git status
git diff --stat
```

Review:
- What files were modified?
- Any uncommitted changes?
- Any untracked files that should be committed?
- Any TODOs left in code?

### 2. Quality Check

Run project quality gates:

```bash
# Lint check (show only first 20 lines if errors)
npm run lint 2>&1 | head -20

# Type check (show only first 20 lines if errors)
npm run typecheck 2>&1 | head -20

# Tests (only changed files, pass with no tests)
npm test -- --changed --passWithNoTests
```

Verify:
- All checks passing?
- Any warnings to address now vs later?
- Any flaky tests to investigate?

### 3. Learning Capture

Reflect on the session:

**What mistakes were made?**
- File navigation errors?
- Wrong assumptions about code structure?
- Missed edge cases?
- Failed approaches?

**What patterns worked well?**
- Effective search strategies?
- Useful git workflows?
- Good testing approaches?

**Corrections to capture:**

Format each learning as:
```
[LEARN] Category: Rule
Mistake: What went wrong
Correction: How it was fixed
```

Categories:
- Navigation (file paths, finding code)
- Editing (code changes, patterns)
- Testing (test approaches)
- Git (commits, branches)
- Quality (lint, types, style)
- Context (when to clarify)
- Architecture (design decisions)
- Performance (optimization)
- OpenCode (workflows, skills, agents, tools)
- Prompting (scope, constraints, acceptance criteria)

**After identifying learnings, ask user:** "Should I add these to `.opencode/LEARNED.md`?"

### 4. Next Session Context

Plan for continuity:

**What's the next logical task?**
- Natural continuation of current work?
- Blocked items that need unblocking?
- Follow-up tasks from this session?

**Any blockers to document?**
- Missing information?
- External dependencies?
- Decisions needed from stakeholders?

**Context to preserve:**
- Key insights about the codebase?
- Important patterns discovered?
- Gotchas to remember?

### 5. Session Summary

Write one concise paragraph covering:
- **What was accomplished** - Key changes and additions
- **Current state** - Is the feature complete? Tests passing? Ready to commit?
- **What's next** - Immediate next steps for the next session

### 6. Commit Decision

Based on the audit above:

**If changes are complete and all quality gates pass:**
- Suggest using the `smart-commit` skill to create a quality-gated commit
- Or ask: "Ready to commit these changes?"

**If work is incomplete or quality gates fail:**
- Summarize what needs to be finished
- Document in session summary

**If there are uncommitted changes:**
- Warn the user so they don't lose work
- Suggest committing or stashing

---

## Output Template

After running all checks, output:

```markdown
## SESSION WRAP-UP

### Changes
- Modified: [list files]
- Uncommitted: [yes/no - what files]
- TODOs: [any found in code]

### Quality Gates
- ✓ Lint: PASS
- ✓ Types: PASS  
- ✓ Tests: 12/12 PASS

### Learnings
1. [LEARN] Category: Rule
   Mistake: ...
   Correction: ...

2. [LEARN] Category: Rule
   Mistake: ...
   Correction: ...

### Next Session
- Next task: [description]
- Blockers: [none/list]
- Context: [key points to remember]

### Summary
[One paragraph summary]

---
Ready to commit? [yes/no based on quality gates]
Add learnings to .opencode/LEARNED.md? [if any learnings captured]
```

---

## When to Use

Use this skill:
- At the end of every coding session
- Before switching to a different task domain
- After completing a major feature or bug fix
- When you want to ensure session continuity

Trigger phrases:
- "wrap up"
- "end session"
- "session summary"
- "what did we accomplish"

---

## Integration

This skill works with:
- `smart-commit` - Use after wrap-up if ready to commit
- `learning-capture` - Systematic alternative for just capturing learnings
- `pro-workflow-core` - Part of the complete pro-workflow system
- `persistent-memory` - Learnings feed into persistent memory

---

*Part of pro-workflow adapted for OpenCode*
