---
name: git-commit
description: Commit changes with conventional commit messages (feat/fix/chore) and push to remote repository.
---

# Git Commit Skill

Commit and push changes using Conventional Commits syntax with auto-generated relevant messages.

---

## Quick Reference

```bash
# Conventional Commit Format
<type>(<scope>): <description>

# Examples
feat(auth): add password reset flow
fix(api): handle null response from payment gateway
chore(deps): update vitest to v2.0
```

---

## Commit Types

| Type | When to Use | Example |
|------|-------------|---------|
| `feat` | New feature for the user | `feat(cart): add quantity selector` |
| `fix` | Bug fix | `fix(checkout): correct tax calculation` |
| `docs` | Documentation only | `docs(readme): add setup instructions` |
| `style` | Formatting, no code change | `style(components): fix indentation` |
| `refactor` | Code change, no new feature/fix | `refactor(auth): extract token logic` |
| `perf` | Performance improvement | `perf(api): cache database queries` |
| `test` | Adding/updating tests | `test(utils): add debounce hook tests` |
| `chore` | Build, tooling, dependencies | `chore(deps): bump next to 16.1` |
| `ci` | CI/CD changes | `ci(github): add deploy workflow` |
| `revert` | Reverting previous commit | `revert: feat(cart): add quantity selector` |

---

## Workflow

### Step 1: Analyze Changes

```bash
# Check what's changed
git status
git diff --staged
git diff
```

### Step 2: Determine Commit Type

Ask these questions:

1. **Is this a new capability for users?** → `feat`
2. **Does this fix broken behavior?** → `fix`
3. **Is this code restructuring without behavior change?** → `refactor`
4. **Is this only tests?** → `test`
5. **Is this dependencies/tooling?** → `chore`

### Step 3: Identify Scope

Scope = the area of the codebase affected:

| Changed Files | Scope |
|---------------|-------|
| `app/auth/*`, `lib/auth.ts` | `auth` |
| `components/ui/*` | `ui` |
| `lib/actions/task-*.ts` | `tasks` |
| `supabase/migrations/*` | `db` |
| `tests/*` | `test` |
| Multiple unrelated areas | omit scope |

### Step 4: Write Description

- Use imperative mood: "add" not "added" or "adds"
- Lowercase first letter
- No period at end
- Max 50 characters
- Focus on WHAT and WHY, not HOW

**Good:**
```
feat(auth): add email verification on signup
fix(api): prevent duplicate order submissions
```

**Bad:**
```
feat(auth): Added the email verification feature.
fix(api): Fixed the bug where orders were duplicated
```

### Step 5: Commit and Push

```bash
# Stage changes
git add .

# Or stage specific files
git add src/lib/auth.ts src/app/auth/

# Commit with message
git commit -m "feat(auth): add email verification on signup"

# Push to remote
git push origin HEAD
```

---

## Multi-Line Commits

For complex changes, use body and footer:

```bash
git commit -m "feat(payments): add Stripe subscription support

- Add subscription plans table and RLS policies
- Implement webhook handler for subscription events
- Add customer portal redirect endpoint

Closes #42"
```

### Body Guidelines

- Separate from subject with blank line
- Wrap at 72 characters
- Explain WHAT and WHY, not HOW
- Use bullet points for multiple changes

### Footer Keywords

| Keyword | Purpose |
|---------|---------|
| `Closes #123` | Auto-close issue on merge |
| `Fixes #123` | Auto-close bug issue |
| `Refs #123` | Reference without closing |
| `BREAKING CHANGE:` | Indicates breaking API change |

---

## Breaking Changes

For breaking changes, add `!` after type or use footer:

```bash
# Option 1: Bang notation
feat(api)!: change authentication to OAuth2

# Option 2: Footer
feat(api): change authentication to OAuth2

BREAKING CHANGE: API now requires OAuth2 tokens instead of API keys.
Migration guide: https://docs.example.com/migrate
```

---

## Decision Tree

```
START
  │
  ▼
┌─────────────────────────┐
│ What changed?           │
└───────────┬─────────────┘
            │
    ┌───────┴───────┐
    ▼               ▼
┌────────┐    ┌──────────┐
│ Single │    │ Multiple │
│ Area   │    │ Areas    │
└───┬────┘    └────┬─────┘
    │              │
    ▼              ▼
  scope        no scope
    │              │
    └──────┬───────┘
           │
           ▼
┌─────────────────────────┐
│ New user capability?    │
└───────────┬─────────────┘
            │
      Yes ──┴── No
       │        │
       ▼        ▼
     feat   ┌───────────────┐
            │ Fixes bug?    │
            └───────┬───────┘
                    │
              Yes ──┴── No
               │        │
               ▼        ▼
              fix   ┌───────────────┐
                    │ Tests only?   │
                    └───────┬───────┘
                            │
                      Yes ──┴── No
                       │        │
                       ▼        ▼
                     test   ┌───────────────┐
                            │ Restructure?  │
                            └───────┬───────┘
                                    │
                              Yes ──┴── No
                               │        │
                               ▼        ▼
                           refactor   chore
```

---

## Examples by Scenario

### Feature Implementation

```bash
# After implementing user profile editing
git add .
git commit -m "feat(profile): add user profile editing

- Add profile edit form with validation
- Implement updateProfile server action
- Add avatar upload to Supabase storage"
git push origin HEAD
```

### Bug Fix

```bash
# After fixing a payment calculation bug
git add lib/utils/pricing.ts tests/utils/pricing.test.ts
git commit -m "fix(pricing): correct discount calculation for bulk orders

Discounts were applied before tax instead of after.
Fixes #87"
git push origin HEAD
```

### Multiple Unrelated Changes

Split into separate commits:

```bash
git add lib/auth.ts
git commit -m "fix(auth): handle expired refresh tokens"

git add package.json package-lock.json
git commit -m "chore(deps): update next to 16.1.0"

git push origin HEAD
```

---

## Pre-Push Checklist

Before pushing, verify:

- [ ] All tests pass: `npm run test`
- [ ] Build succeeds: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] Commit message follows convention
- [ ] No sensitive data in commit (`.env`, secrets)
- [ ] Changes are on correct branch

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `feat: Add new feature` | `feat: add new feature` (lowercase) |
| `fix(auth): fixed bug.` | `fix(auth): handle null token` (no period, imperative) |
| `updated stuff` | `refactor(utils): extract date formatting` (be specific) |
| Giant commit with everything | Split into logical commits |
| `wip` or `temp` commits | Squash before push or use meaningful message |

---

## Integration with Session Management

After committing, update memory files:

```markdown
# In todos.md
- [x] Implement feature X - committed as feat(x): ...

# In decisions.md (if architectural)
## [DATE] Chose X approach for feature
**Decision:** Used server actions instead of API routes
```
