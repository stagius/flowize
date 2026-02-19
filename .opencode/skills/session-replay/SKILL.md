---
name: session-replay
description: Surface relevant past learnings before starting a task. Like muscle memory for your coding sessions - automatically find patterns and mistakes from similar past work.
tools: Read, Grep, Glob, Bash
---

# Session Replay - Learn From Your Past

Before starting a task, surface relevant learnings from previous sessions. This prevents repeating mistakes and leverages accumulated knowledge.

## The Concept

Session replay answers: **"What do I already know about this type of work?"**

By reviewing past learnings before you start, you:
- Avoid repeating the same mistakes
- Apply proven patterns immediately
- Remember project-specific quirks
- Start with context instead of from scratch

---

## How It Works

### 1. Extract Keywords from Task

User provides a task description:
```
"Add authentication middleware to the API"
```

Extract key terms:
- authentication
- middleware  
- API

### 2. Search LEARNED.md

Search `.opencode/LEARNED.md` for relevant learnings:

```bash
# Check if LEARNED.md exists
if [ -f .opencode/LEARNED.md ]; then
  # Search for keywords (case-insensitive)
  grep -i -E "(authentication|middleware|api)" .opencode/LEARNED.md -A 3 -B 1
else
  echo "No learnings captured yet"
fi
```

### 3. Review Project History

Check git history for similar work:

```bash
# Search commit messages for keywords
git log --all --grep="auth" --grep="middleware" --oneline -10

# Search for related file changes
git log --all --oneline -- "*auth*" "*middleware*" -10
```

### 4. Analyze and Present

Output a replay briefing with:
- Relevant learnings ranked by match quality
- Past commit history showing similar work
- Suggested approach based on patterns
- Warnings about past mistakes to avoid

---

## Usage

```
session-replay <task description>
```

Examples:
```
session-replay authentication middleware
session-replay "fix file path errors"  
session-replay testing react components
session-replay database migration
```

---

## Output Format

```markdown
## REPLAY BRIEFING: [task]

### Past Learnings

Found [N] relevant learnings in .opencode/LEARNED.md:

1. [Category] - [Date] [Description]
   **Rule:** [Rule text]
   **Why:** [Mistake that led to this learning]
   **Match:** [Why this is relevant to current task]

2. [Category] - [Date] [Description]
   **Rule:** [Rule text]
   **Why:** [Mistake that led to this learning]
   **Match:** [Why this is relevant to current task]

### Similar Past Work

Git history shows related work:

- [hash] [date] - [commit message]
- [hash] [date] - [commit message]
  ^ Files changed: [relevant files]

### Suggested Approach

Based on past learnings:
- ✓ [Do this - from learning #1]
- ✓ [Remember this - from learning #2]
- ⚠ [Watch out for - from past mistake]
- ⚠ [Avoid - known pitfall]

### Confidence Assessment

- **Pattern familiarity:** [High/Medium/Low]
- **Similar work done:** [X times in git history]
- **Known issues:** [Y learnings captured about this area]

**Recommendation:** [Proceed directly / Use scout agent first / Review codebase first]

---

Ready to start? I'll apply these learnings as we work.
```

---

## Example Session

```
User: "session-replay add rate limiting to login endpoint"

OpenCode:

## REPLAY BRIEFING: add rate limiting to login endpoint

### Past Learnings

Found 3 relevant learnings in .opencode/LEARNED.md:

1. Testing - 2026-02-15 Mock external dependencies
   **Rule:** Always mock external APIs in unit tests
   **Why:** Tests called live Redis, causing flaky failures
   **Match:** Rate limiting will likely use Redis

2. Architecture - 2026-02-10 API uses middleware pattern
   **Rule:** Auth logic lives in src/middleware/ not src/auth/
   **Why:** Edited wrong directory, had to redo work
   **Match:** Rate limiting should follow same middleware pattern

3. Security - 2026-02-08 Return proper HTTP status codes
   **Rule:** Use 429 Too Many Requests with Retry-After header
   **Why:** Used 403 instead, confused clients
   **Match:** Rate limiting needs correct status codes

### Similar Past Work

Git history shows related work:

- a1b2c3d 2026-02-15 - feat(auth): add session middleware
  ^ Files changed: src/middleware/session.ts
- c3d4e5f 2026-02-10 - fix(auth): move auth logic to middleware/
  ^ Files changed: src/auth/* → src/middleware/
  
### Suggested Approach

Based on past learnings:
- ✓ Create middleware in src/middleware/rateLimit.ts (not src/auth/)
- ✓ Use Redis for rate limit storage (consistent with session)
- ✓ Return 429 status with Retry-After header
- ✓ Mock Redis in tests to avoid flaky failures
- ⚠ Don't forget to add middleware to app.use() chain
- ⚠ Watch out for file path - we've edited wrong directory before

### Confidence Assessment

- **Pattern familiarity:** High (3 related learnings)
- **Similar work done:** 2 times in past month
- **Known issues:** 1 navigation mistake to avoid

**Recommendation:** Proceed directly - strong pattern familiarity

---

Ready to start? I'll apply these learnings as we work.
```

---

## When No Learnings Exist

If `.opencode/LEARNED.md` doesn't exist or has no matches:

```markdown
## REPLAY BRIEFING: [task]

### Past Learnings

No learnings captured yet for this type of work.

This is a good opportunity to build knowledge! After completing this task:
- Use `learning-capture` skill to document what you learn
- Use `wrap-up-ritual` to reflect on what worked

### Suggested Approach

Since this is new territory:
1. Consider using the explore agent to understand the codebase first
2. Start with a clear plan before implementation
3. Document learnings as you go

**Recommendation:** Use explore agent or read relevant files before starting

---

Ready to explore?
```

---

## Advanced: Multi-Source Learning

For projects with additional documentation:

```bash
# Search other project docs
grep -i "keyword" docs/**/*.md
grep -i "keyword" README.md
grep -i "keyword" CONTRIBUTING.md

# Search inline code comments
grep -r "// TODO.*keyword" src/
grep -r "// NOTE.*keyword" src/
```

Include findings in the briefing under "Project Documentation" section.

---

## Integration

Works with:
- **learning-capture** - Replay leverages captured learnings
- **wrap-up-ritual** - Use replay before starting, wrap-up after ending
- **pro-workflow-core** - Core pattern of learning from past work
- **persistent-memory** - Learnings persist across sessions
- **explore agent** - If replay shows low confidence, use explore first

---

## Best Practices

### When to Use Replay

**Always use before:**
- Starting work in an unfamiliar area
- Repeating similar work from past sessions
- Working on areas where mistakes were made before

**Skip replay for:**
- Continuation of current work (context already loaded)
- Trivial one-line changes
- Areas you just worked on

### How to Improve Replay Quality

Better learnings = better replays:
- Capture specific, actionable learnings (see `learning-capture`)
- Include context about when rules apply
- Document both what went wrong AND what worked
- Use clear categories for easier searching

### Combining with Scout

If replay shows **low confidence**:
1. Replay surfaces what you know
2. Scout assesses what's missing
3. Scout gathers additional context
4. Then proceed with implementation

---

## Trigger Phrases

Use this skill when:
- Starting a new task
- "What do I know about..."
- "Remind me about..."
- "Past learnings for..."
- "Before I start..."
- "Replay session for..."

---

## Implementation Notes

### Search Strategy

1. **Exact match** - Search for exact task keywords first
2. **Related terms** - Expand to related categories
3. **File patterns** - Check git history for file paths
4. **Recency** - Weight recent learnings higher

### Relevance Ranking

Rank learnings by:
- Keyword match count (more matches = more relevant)
- Recency (recent learnings more likely relevant)
- Category overlap (if task mentions "testing", prioritize Testing category)
- Applied count (frequently-applied learnings are proven patterns)

---

*Part of pro-workflow adapted for OpenCode*
