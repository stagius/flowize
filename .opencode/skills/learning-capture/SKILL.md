---
name: learning-capture
description: Systematically capture corrections and insights from your OpenCode sessions into persistent memory. Build a personal knowledge base that improves over time.
tools: Read, Write, Edit, Bash
---

# Learning Capture - Build Your Knowledge Base

Transform every mistake and insight into reusable knowledge. This skill helps you systematically document learnings that prevent future errors.

## The Power of Learning Capture

Every correction you make is a learning opportunity. By capturing these systematically, you create a personal knowledge base that:
- Prevents repeating the same mistakes
- Documents project-specific patterns
- Builds institutional knowledge
- Compounds over time

---

## How It Works

### 1. Identify a Learning

A learning comes from:
- **Corrections** - When you correct OpenCode's mistake
- **Failures** - When an approach didn't work
- **Discoveries** - When you find a better pattern
- **Gotchas** - When you encounter project-specific quirks

### 2. Format the Learning

Structure each learning as:

```
[LEARN] Category: One-line rule

Mistake: What went wrong or what was tried
Correction: How it was fixed or the right approach
Context: [Optional] Additional details or when this applies
```

### 3. Choose a Category

**Available categories:**
- **Navigation** - Finding files, understanding project structure
- **Editing** - Code changes, refactoring patterns
- **Testing** - Test strategies, mocking, coverage
- **Git** - Commit patterns, branching, workflows
- **Quality** - Lint rules, type safety, code style
- **Context** - When to ask for clarification vs proceed
- **Architecture** - Design decisions, patterns, trade-offs
- **Performance** - Optimization strategies, profiling
- **OpenCode** - Using OpenCode effectively (skills, tools, workflows)
- **Prompting** - How to write effective prompts for AI
- **Security** - Auth, validation, secrets management
- **Dependencies** - Package management, version conflicts

### 4. Save to Memory

The learning is saved to `.opencode/LEARNED.md` in your project:

```markdown
### [Category]

#### [Date] [Short description]
**Rule:** [One-line rule]

**Mistake:** [What went wrong]

**Correction:** [How to do it right]

**Context:** [When this applies]
```

---

## Usage Patterns

### Pattern 1: Immediate Capture (After Correction)

When you correct OpenCode:

```
User: "You edited the wrong file - it should be src/lib/utils.ts not src/utils.ts"

OpenCode: "I edited src/utils.ts when you meant src/lib/utils.ts.

[LEARN] Navigation: Always confirm full path before editing files with common names

Mistake: Edited src/utils.ts assuming it was the right file
Correction: Ask for full path confirmation when multiple files have similar names

Should I add this to .opencode/LEARNED.md?"
```

### Pattern 2: Session Reflection (During Wrap-Up)

At the end of a session:

```
User: "Use learning-capture skill"

OpenCode: "Let's reflect on this session. What learnings should we capture?

Looking at our conversation:
1. We had to retry the API integration twice because of auth headers
2. Tests were flaky due to shared state
3. Found that rate limiting config is in .env.local not .env

Should we capture these as learnings?"
```

### Pattern 3: Explicit Learning Request

When you want to remember something:

```
User: "Remember that our API always returns snake_case but our frontend uses camelCase"

OpenCode: "[LEARN] Architecture: API uses snake_case, frontend uses camelCase - transform at boundary

Context: All API responses need case transformation in the API client layer

Should I add this to .opencode/LEARNED.md?"
```

---

## Implementation

### Check if LEARNED.md Exists

```bash
test -f .opencode/LEARNED.md && echo "exists" || echo "create new"
```

### Create LEARNED.md Template (if needed)

If `.opencode/LEARNED.md` doesn't exist, create it:

```markdown
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
```

### Add a Learning

When adding a learning:

1. Read the current `.opencode/LEARNED.md`
2. Find the appropriate category section
3. Add the learning in chronological order (newest first)
4. Use Edit tool to insert the learning

Format:
```markdown
### [Category]

#### [YYYY-MM-DD] [Short description]
**Rule:** [One-line rule]

**Mistake:** [What went wrong]

**Correction:** [How to do it right]

**Context:** [Optional - when this applies]

---

[Previous learnings...]
```

---

## Example Learnings

### Navigation
```markdown
#### 2026-02-19 Confirm paths for common filenames
**Rule:** Always confirm full path before editing files with common names

**Mistake:** Edited src/utils.ts when src/lib/utils.ts was intended

**Correction:** Ask user "Did you mean src/lib/utils.ts or src/utils.ts?" when multiple matches exist

---
```

### Testing
```markdown
#### 2026-02-19 Mock external APIs in unit tests
**Rule:** Always mock external API calls in unit tests

**Mistake:** Tests called live API, causing flaky failures and rate limiting

**Correction:** Use jest.mock() or msw to mock all external HTTP requests in test setup

**Context:** Integration tests can call real APIs in dedicated test environment

---
```

### OpenCode
```markdown
#### 2026-02-19 Use explore agent for large codebases
**Rule:** Delegate codebase exploration to explore agent via Task tool

**Mistake:** Used grep directly in main session, consumed too much context

**Correction:** Use Task tool with explore agent for read-only codebase exploration

---
```

---

## Learning Categories Guide

### When to Use Each Category

**Navigation** - "Where is X?", "How do I find Y?", file structure
**Editing** - Code patterns, refactoring approaches, style choices
**Testing** - Test structure, mocking, assertions, coverage
**Git** - Commit messages, branching, merge strategies
**Quality** - Linting, type checking, code review findings
**Context** - When to clarify vs assume, scope boundaries
**Architecture** - Design patterns, module organization, data flow
**Performance** - Optimizations, profiling, bottlenecks
**OpenCode** - Using OpenCode tools and workflows effectively
**Prompting** - How to ask OpenCode to do things correctly
**Security** - Auth, validation, sanitization, secret management
**Dependencies** - Package issues, version conflicts, compatibility

---

## Output After Capture

After successfully adding a learning:

```markdown
✓ Learning captured to .opencode/LEARNED.md

[Category] - [Short description]
This will help prevent similar issues in future sessions.

Total learnings: [count from file]
```

---

## Integration

Works with:
- **wrap-up-ritual** - Capture learnings at session end
- **smart-commit** - Capture learnings after commits
- **pro-workflow-core** - Core self-correction loop
- **persistent-memory** - Learnings persist across sessions
- **session-management** - Part of session continuity

---

## Best Practices

### Good Learnings
✓ **Specific** - "Use snake_case for database columns"
✓ **Actionable** - "Run `npm test -- --changed` before committing"
✓ **Contextual** - "API rate limit is 100 req/min in production"

### Bad Learnings
✗ **Vague** - "Write better code"
✗ **Obvious** - "Fix bugs when found"
✗ **Too specific** - "Variable on line 42 should be called userData not data"

### When to Capture

**Do capture:**
- Repeated mistakes (3rd time is a pattern)
- Non-obvious project conventions
- Tricky debugging approaches that worked
- Configuration gotchas
- API quirks and undocumented behavior

**Don't capture:**
- One-time typos
- Standard language features
- Temporary workarounds
- Code that will change soon

---

## Trigger Phrases

Use this skill when user says:
- "Remember this"
- "Add that to your rules"
- "Don't do that again"
- "Learn from this"
- "Capture this learning"
- "Save that for next time"

Also use proactively:
- After being corrected
- At wrap-up when mistakes occurred
- When discovering important patterns

---

*Part of pro-workflow adapted for OpenCode*
