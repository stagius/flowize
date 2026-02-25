# Flowize
[![Vercel Deployment Status](https://therealsujitk-vercel-badge.vercel.app/?app=flowize)](https://flowize-git.vercel.app)

Flowize is a React + TypeScript interface for running a parallel GitHub workflow from raw task input to merged pull request. It helps you organize work across issue intake, worktree assignment, implementation, review, and merge tracking in one UI.

## Quick Start

```bash
npm run init
```

Open http://localhost:3000 and enter your repo details in Settings.

## Features

### Issue Creation

Parse raw requirements into structured GitHub issues using AI.

https://github.com/user-attachments/assets/c4f34639-26c5-4d7f-8955-a8bd215ba1c5


### Worktrees & Review

Assign issues to worktree slots, generate implementation drafts, and open PRs for review.

https://github.com/user-attachments/assets/6e185bd8-fd53-4fbc-93b6-929a3bdd355c


## What it does

Flowize guides you through the complete development workflow:

- **Task Input** — Paste raw specs and generate structured tasks with AI
- **Issues** — Create GitHub issues or import existing ones
- **Worktrees** — Assign issues to slots, generate implementation drafts, and push to review
- **Review** — Open PRs and monitor CI status
- **Merge** — Merge ready PRs and track history

## Tech stack

- React 19
- TypeScript
- Vite
- TailwindCSS (via CDN in `index.html`)
- `@google/genai` for task/implementation generation
- GitHub REST API for issues/branches/commits/PRs/merge actions

## Prerequisites

- Node.js 18+
- npm
- GitHub Personal Access Token (for repo sync)

## Configuration

The app works without environment variables. For OAuth login, create `.env.local` from `.env.example`.

### In-app settings

Use the Settings modal to configure:

- `repoOwner` and `repoName`
- `defaultBranch` (defaults to `master`)
- `worktreeRoot` and max worktree slots
- `githubToken` (PAT, optional if `VITE_GITHUB_TOKEN` is set)

Recommended GitHub token scopes:

- Classic PAT: `repo`
- Fine-grained PAT: `Contents (Read/Write)` and `Pull requests (Read/Write)`

## Available scripts

- `npm run init` - Install deps, create .env, start app (one command)
- `npm run setup` - Create `.env.local` from template
- `npm run start` - Start dev server + local bridge
- `npm run dev` - Dev server only
- `npm run bridge:start` - Local bridge only
- `npm run build` - Production build
- `npm run preview` - Preview production build

## Workflow steps in the UI

1. **Task Input** - Paste raw specs/bug notes and generate structured tasks.
2. **Issues** - Review and sync tasks to GitHub issues, or fetch existing remote issues.
3. **Worktrees** - Assign issues to slots, generate implementation drafts, and push to review.
4. **Review** - Open PRs and monitor commit/CI status.
5. **Merged** - Merge ready PRs and view merged history.

## Project structure

- `App.tsx` - Main application state and workflow orchestration
- `components/` - Step-based UI and settings modal
- `services/geminiService.ts` - Gemini integration for task analysis
- `services/githubService.ts` - GitHub API integration
- `services/gitService.ts` - Real worktree operations through the local bridge endpoint
- `types.ts` - Shared workflow types/status enums

## Troubleshooting

### Bridge shows "OFFLINE"
- The bridge should start automatically with `npm run start`
- Check that port 4141 is not blocked
- Verify bridge endpoint in Settings: `http://127.0.0.1:4141/run`

### Terminal doesn't open on Linux
- Install gnome-terminal, konsole, or xterm

### Worktree creation fails
- Ensure the worktree root path exists and is writable
- Check that the path doesn't contain special characters
- Verify git is installed and accessible from command line

### Session data lost on refresh
- Session data is auto-saved to localStorage
- Check if browser storage is disabled or full
- Try clearing browser data and refreshing

### GitHub token invalid
- Ensure token has `repo` scope (classic) or required permissions (fine-grained)
- Check if token has expired
- Re-authenticate using "Connect with GitHub" in Settings

## Contributing

1. Create a feature branch from `master`.
2. Make focused changes with clear commit messages.
3. Run build locally before opening a PR:

```bash
npm run build
```

4. Open a pull request with a concise summary and testing notes.

## Notes

- Git worktree operations run through the local bridge endpoint.
- GitHub actions are real API calls when a valid token is provided.
