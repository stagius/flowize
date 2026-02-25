# Pro-Workflow Skills for OpenCode

Battle-tested workflows adapted from [pro-workflow](https://github.com/rohitg00/pro-workflow) by rohitg00. Optimized for OpenCode to help you achieve the 80/20 AI coding ratio.

> "80% of my code is written by AI, 20% is spent reviewing and correcting it." - Karpathy

## What's Included

This adaptation brings pro-workflow's core patterns to OpenCode as a collection of skills:

| Skill | Purpose | Use When |
|-------|---------|----------|
| **pro-workflow-core** | Core patterns and philosophy | Learning the workflow system |
| **wrap-up-ritual** | End-of-session checklist | Ending coding sessions |
| **smart-commit** | Quality-gated commits | Creating commits |
| **learning-capture** | Document corrections systematically | After mistakes or discoveries |
| **session-replay** | Surface past learnings | Starting new tasks |

## Installation

These skills are already installed in `.opencode/skills/`. To use them:

```
Load the pro-workflow-core skill
```

Or load individual skills as needed:
```
Load the wrap-up-ritual skill
Load the smart-commit skill
```

## Quick Start

### 1. Set Up Project Memory

Create `.opencode/LEARNED.md` in your project:

```bash
cat > .opencode/LEARNED.md << 'EOF'
# Learned Patterns

Accumulated knowledge from OpenCode sessions. These patterns prevent recurring mistakes.

## Navigation

## Editing

## Testing

## Git

## Quality

## Context

## Architecture

## Performance

## OpenCode

## Prompting

## Security

## Dependencies
EOF
```

### 2. Start Using the Self-Correction Loop

When you correct OpenCode:
- OpenCode will propose a learning: `[LEARN] Category: Rule`
- Review and approve
- It gets added to `.opencode/LEARNED.md`
- Future sessions avoid the same mistake

### 3. Use Skills Throughout Your Workflow

**Starting work:**
```
session-replay authentication middleware
```

**During work:**
- OpenCode learns from corrections automatically
- Use Task tool for parallel exploration

**Ending work:**
```
wrap-up-ritual
smart-commit
```

## Core Patterns

### 1. Self-Correction Loop
Your `.opencode/LEARNED.md` trains itself through corrections. Every mistake becomes a rule.

### 2. Parallel Sessions
Use the Task tool to delegate exploration and background work while you focus on implementation.

### 3. Wrap-Up Ritual
End every session with intention: audit changes, capture learnings, verify state, plan next steps.

### 4. Split Memory
For complex projects, organize OpenCode memory:
- `.opencode/README.md` - Main entry point
- `.opencode/WORKFLOWS.md` - Workflow rules
- `.opencode/STYLE.md` - Style preferences
- `.opencode/LEARNED.md` - Learned patterns

### 5. Quality Gates
Never commit without running lint, typecheck, and tests. Catch console.log, TODOs, and secrets.

### 6. Learning Log
Document every insight. Build a knowledge base that compounds over time.

## Skills Reference

### pro-workflow-core

**Purpose:** Core patterns and philosophy of the pro-workflow system

**Contains:**
- Self-correction loop
- Parallel sessions pattern
- Context discipline
- Quality gates
- Split memory architecture
- 80/20 review pattern

**When to load:** When learning the system or needing philosophy reference

---

### wrap-up-ritual

**Purpose:** Systematic end-of-session checklist

**What it does:**
1. Audit changes (git status, diff)
2. Run quality checks (lint, typecheck, test)
3. Capture learnings from the session
4. Plan next session context
5. Generate session summary

**When to use:** At the end of every coding session

**Trigger phrases:**
- "wrap up"
- "end session"
- "session summary"

---

### smart-commit

**Purpose:** Create quality-gated commits with proper messages

**What it does:**
1. Pre-commit checks (staged files, dangerous files)
2. Run quality gates (lint, typecheck, tests)
3. Code review scan (console.log, TODOs, secrets)
4. Craft conventional commit message
5. Stage and commit
6. Offer to capture learnings

**When to use:** When ready to commit changes

**Options:**
- `--no-verify` - Skip quality gates
- `--amend` - Amend previous commit
- `--push` - Push after commit

**Trigger phrases:**
- "commit these changes"
- "smart commit"
- "create a commit"

---

### learning-capture

**Purpose:** Systematically document corrections and insights

**What it does:**
1. Identify the learning (correction, failure, discovery)
2. Format as structured learning
3. Categorize appropriately
4. Save to `.opencode/LEARNED.md`

**When to use:**
- After being corrected
- When discovering patterns
- During wrap-up
- When you say "remember this"

**Learning format:**
```
[LEARN] Category: One-line rule

Mistake: What went wrong
Correction: How to do it right
Context: When this applies
```

**Trigger phrases:**
- "remember this"
- "add that to your rules"
- "learn from this"
- "capture this learning"

---

### session-replay

**Purpose:** Surface relevant past learnings before starting tasks

**What it does:**
1. Extract keywords from task description
2. Search `.opencode/LEARNED.md` for relevant learnings
3. Check git history for similar work
4. Present replay briefing with suggestions

**When to use:**
- Before starting new tasks
- When working in unfamiliar areas
- When repeating similar past work

**Usage:**
```
session-replay <task description>
```

**Example:**
```
session-replay add authentication middleware
session-replay fix file path errors
```

---

## Workflow Example

Here's how these skills work together in a typical session:

### Starting the Session

```
User: I need to add rate limiting to our login endpoint

OpenCode: Let me use session-replay first to see what we know...

[Loads session-replay skill]

## REPLAY BRIEFING: add rate limiting to login endpoint

Found 2 relevant learnings:
1. Architecture - Middleware goes in src/middleware/
2. Testing - Always mock Redis in tests

Suggested approach:
- Create src/middleware/rateLimit.ts
- Use Redis for storage
- Return 429 with Retry-After header

Ready to proceed!
```

### During Work

```
User: You edited the wrong file again

OpenCode: I edited src/auth/middleware.ts when you meant src/middleware/rateLimit.ts

[LEARN] Navigation: Middleware always goes in src/middleware/ not src/auth/

Should I add this to .opencode/LEARNED.md?

User: yes

OpenCode: ✓ Learning captured. This will prevent similar mistakes in future sessions.
```

### Ending the Session

```
User: wrap up

OpenCode: [Loads wrap-up-ritual skill]

## SESSION WRAP-UP

### Changes
- Modified: src/middleware/rateLimit.ts (+85)
- Tests: src/middleware/rateLimit.test.ts (+120)
- Uncommitted: Yes (2 files)

### Quality Gates
- ✓ Lint: PASS
- ✓ Types: PASS
- ✓ Tests: 15/15 PASS

### Learnings
1. [LEARN] Navigation: Middleware lives in src/middleware/
2. [LEARN] Testing: Mock Redis with ioredis-mock

### Summary
Added rate limiting middleware using Redis with 5 attempts per 15 min window.
Returns 429 with Retry-After header. All tests passing. Ready to commit.

---
Ready to commit? yes

OpenCode: [Loads smart-commit skill]

Suggested commit:
  feat(auth): add rate limiting to login endpoint
  
  Prevent brute force attacks by limiting login attempts to 5 per
  IP per 15 minute window using Redis-backed sliding window.
  
  Returns 429 Too Many Requests with Retry-After header.

Commit with this message? yes

OpenCode: ✓ Committed a1b2c3d
```

## Differences from Original Pro-Workflow

This adaptation differs from the original pro-workflow repository:

### What's Adapted

✓ **Core patterns** - Self-correction, parallel work, wrap-up ritual  
✓ **Commands → Skills** - All commands converted to OpenCode skills  
✓ **OpenCode integration** - Uses Task tool instead of subagents/agent teams  
✓ **File-based storage** - Uses `.opencode/LEARNED.md` instead of SQLite  
✓ **Simplified** - Removed Claude Code-specific features (hooks, contexts, MCP)  

### What's Different

- **No SQLite database** - Uses plain markdown files for portability
- **No hooks system** - OpenCode doesn't have hooks (yet)
- **No agent teams** - Uses Task tool for parallel work
- **No /insights analytics** - Would require persistent database
- **Simpler learning capture** - File-based instead of FTS5 search

### What's Improved

- **Better OpenCode integration** - Uses native OpenCode patterns
- **More portable** - Plain text files, no database setup
- **Simpler setup** - Just create `.opencode/LEARNED.md`
- **Git-friendly** - All learnings are version controlled

## Integration with Existing Skills

Pro-workflow complements your existing OpenCode skills:

| Existing Skill | Pro-Workflow Enhancement |
|----------------|-------------------------|
| `tdd-workflow` | Quality gates align with TDD |
| `git-commit` | Smart-commit adds quality gates |
| `strategic-compact` | Context discipline reduces compaction needs |
| `persistent-memory` | Learning log enhances memory |
| `coding-standards` | Self-correction enforces standards |

## Philosophy

The pro-workflow system is built on four principles:

1. **Compound improvements** - Small corrections accumulate into big gains
2. **Trust but verify** - Let AI work, review at checkpoints
3. **Zero dead time** - Use Task tool for parallel work
4. **Memory is precious** - Manage both your memory and OpenCode's token budget

## Credits

Adapted from [pro-workflow](https://github.com/rohitg00/pro-workflow) by [@rohitg00](https://github.com/rohitg00).

For this OpenCode adaptation:
- Check `.opencode/skills/` for skill files
- Modify skills to fit your workflow
- Contribute improvements back

---

**Get started now:**
```
Load the pro-workflow-core skill
```
