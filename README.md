# Flowize
[![Vercel Deployment Status](https://therealsujitk-vercel-badge.vercel.app/?app=flowize)](https://flowize-git.vercel.app)

Flowize is a React + TypeScript interface for running a parallel GitHub workflow from raw task input to merged pull request. It helps you organize work across issue intake, worktree assignment, implementation, review, and merge tracking in one UI.

## Quick Start

```bash
# 1. Clone and install
git clone <your-fork-url>
cd flowize
npm install

# 2. Create .env.local
echo "VITE_API_KEY=your_gemini_api_key" > .env.local

# 3. Start the app (terminal 1)
npm run dev

# 4. Start the local bridge (terminal 2)
npm run bridge:start

# 5. Open http://localhost:3000
```

On first launch, you'll be prompted to log in with GitHub. Click "Connect with GitHub" or manually paste a Personal Access Token in Settings.

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
- A Gemini API key (required for AI generation)
- A GitHub Personal Access Token (required for GitHub sync actions)

## Platform Support

Flowize works on **Windows, macOS, and Linux**. The local bridge automatically detects your platform and opens the appropriate terminal:

| Platform | Terminal |
|----------|----------|
| Windows | Command Prompt (cmd.exe) |
| macOS | Terminal.app |
| Linux | gnome-terminal, konsole, xfce4-terminal, mate-terminal, or xterm |

## Getting started

1. Install dependencies:
   `npm install`
2. Create `.env.local` in the project root and set the required variables:

```env
VITE_API_KEY=your_gemini_api_key
GITHUB_OAUTH_CLIENT_ID=your_github_oauth_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_OAUTH_SCOPE=read:user repo
```

3. Start the app:
   `npm run dev`
4. Start the local bridge:
   `npm run bridge:start`
5. Open `http://localhost:3000`.

## Local Worktree Bridge (required for real filesystem git worktrees)

The UI runs in the browser and cannot execute shell/git commands directly. Start the local bridge and set `Agent Bridge Endpoint` in Settings to `http://127.0.0.1:4141/run`.

Optional bridge environment variables:

- `BRIDGE_PORT` (default: `4141`)
- `BRIDGE_HOST` (default: `0.0.0.0`)
- `BRIDGE_ALLOWED_ORIGIN` (default: `*`, or comma-separated origins like `http://localhost:3000,http://127.0.0.1:3000`)
- `BRIDGE_WORKDIR` (default: current directory)

### GitHub OAuth login (optional, local-only)

If you want to sign in with GitHub and pick repos from your account in Settings, configure a GitHub OAuth App:

1. Create the app with callback URL `http://127.0.0.1:4141/github/oauth/callback`.
2. Set bridge env vars in shell or in `.env.local` before `npm run bridge:start`:
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
   - `GITHUB_OAUTH_SCOPE` (default: `read:user repo`)
   - `GITHUB_OAUTH_CALLBACK_HOST` (optional, default: `127.0.0.1`)
   - `GITHUB_OAUTH_REDIRECT_URI` (optional override)
3. In Flowize settings, use **Connect with GitHub**.

No database is required. Token and selected repo remain local in app settings.

## Configuration

### Environment variables

- `VITE_API_KEY`: Gemini API key used for AI task analysis and implementation generation.
- `GITHUB_OAUTH_CLIENT_ID`: GitHub OAuth app client ID.
- `GITHUB_OAUTH_CLIENT_SECRET`: GitHub OAuth app client secret.
- `GITHUB_OAUTH_SCOPE`: OAuth scope requested during GitHub auth (for example, `read:user repo`).

AI generation requires `VITE_API_KEY`. If it is missing, AI actions fail with a configuration error.

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

- `npm run dev` - Start local dev server (port 3000)
- `npm run build` - Create production build
- `npm run preview` - Preview production build locally
- `npm run bridge:start` - Start the local bridge for filesystem/git operations

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
- Ensure `npm run bridge:start` is running in a separate terminal
- Check that the port 4141 is not blocked by firewall
- Verify the bridge endpoint in Settings matches `http://127.0.0.1:4141/run`

### Terminal doesn't open on Linux
- Install a supported terminal emulator:
  - Ubuntu/Debian: `sudo apt install gnome-terminal`
  - Fedora: `sudo dnf install gnome-terminal`
  - Arch: `sudo pacman -S gnome-terminal`
- Alternatively, install `konsole`, `xfce4-terminal`, or `xterm`

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
