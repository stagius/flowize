<img width="2548" height="949" alt="thumb_short" src="https://github.com/user-attachments/assets/6023f101-a227-4b97-8e50-b0efa5abbbdf" />

# Flowize
[![Vercel Deployment Status](https://therealsujitk-vercel-badge.vercel.app/?app=flowize)](https://flowize-git.vercel.app)
[![Version](https://img.shields.io/badge/version-v1.0.3-yellow.svg)](https://github.com/stagius/flowize/releases)
[![GitHub issues](https://img.shields.io/github/issues/stagius/flowize.svg)](https://github.com/stagius/flowize/issues)
[![GitHub pull-requests](https://img.shields.io/github/issues-pr/stagius/flowize.svg)](https://github.com/stagius/flowize/pulls)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/stagius/flowize/pulls)

Flowize is a React + TypeScript interface for running a parallel GitHub workflow from raw task input to merged pull request. It helps you organize work across issue intake, worktree assignment, implementation, review, and merge tracking in one UI.

## Quick Start

```bash
npm run init
```

Open http://localhost:3000 and log in with GitHub (OAuth or manual token).

> For OAuth login (optional), update `.env.local` with your GitHub OAuth app credentials.

> For GitHub Personal Access Token, get one from [GitHub Settings](https://github.com/settings/tokens).
*__Required scopes__: repo (Classic) or Contents:Read/Write, PullRequests:Read/Write (Fine-grained).*

## Quick Demo

https://github.com/user-attachments/assets/68ec9e44-896d-46ad-bb64-a8d44939b6c4


## What it does

Flowize guides you through the complete development workflow:

- **Task Input** - Paste raw specs and generate structured tasks with AI
- **Issues** - Create GitHub issues or import existing ones
- **Worktrees** - Assign issues to slots, generate implementation drafts, and push to review
- **Review** - Open PRs and monitor CI status
- **Merge** - Merge ready PRs and track history


### Multiple worktrees

https://github.com/user-attachments/assets/208da6f8-f412-42a5-a5a2-87afd4543edd

### Each worktree in a separate terminal

https://github.com/user-attachments/assets/69024d86-ab09-4412-bef5-6ea19ed3a05b


## Tech stack

- React 19
- TypeScript
- Vite
- TailwindCSS 4 with PostCSS
- @dnd-kit for drag-and-drop
- lucide-react for icons
- `@google/genai` for task/implementation generation
- GitHub REST API for issues/branches/commits/PRs/merge actions

## Prerequisites

- [Node.js 18+](https://nodejs.org/en/download/current)
- npm
- Git
- GitHub Personal Access Token (for repo sync)
- [Opencode](https://opencode.ai)
- [Antigravity](https://antigravity.google/download) (we're using the agent not the chat)

## Configuration

The app works without environment variables. For OAuth login, create `.env.local` from `.env.example`.

### In-app settings

Use the Settings modal to configure:

- `repoOwner` and `repoName`
- `defaultBranch` (defaults to `master`)
- `worktreeRoot` and max worktree slots
- `githubToken` (PAT, optional if `VITE_GITHUB_TOKEN` is set)
- `geminiApiKey` (your Gemini API key)

Recommended GitHub token scopes:

- Classic PAT: `repo`
- Fine-grained PAT: `Contents (Read/Write)` and `Pull requests (Read/Write)`

## Available scripts

- `npm run init` - Install deps, create `.env.local`, start app (one command)
- `npm run setup` - Create `.env.local` from template
- `npm run start` - Start dev server + local bridge
- `npm run dev` - Dev server only
- `npm run dev:host` - Dev server reachable from your network/Tailnet
- `npm run serve:dist` - Serve built `dist/` for long-running host mode
- `npm run bridge:start` - Local bridge only
- `npm run host:start` - Launch Windows production remote-host mode for app + bridge
- `npm run host:start:dev` - Launch Windows dev remote-host mode for app + bridge
- `npm run build` - Production build
- `npm run preview` - Preview production build

### Remote bridge hardening

- Set `BRIDGE_AUTH_TOKEN` in `.env.local` before exposing the bridge outside localhost/Tailscale-only trusted clients.
- Set `VITE_BRIDGE_AUTH_TOKEN` for the Flowize UI so browser requests include the bearer token.
- Keep `BRIDGE_ALLOWED_ORIGIN` restricted to your Flowize origin when possible. You can provide a comma-separated allowlist such as `http://localhost:3000,http://192.168.1.190:3000,http://100.x.y.z:3000`.
- Bridge jobs and agent sessions persist under `BRIDGE_DATA_DIR` (defaults to `.flowize-bridge` inside the repo/workdir) so remote runs can survive bridge restarts.
- Bridge actions cover remote agent runs, worktree create/cleanup, and remote branch push, reducing dependence on raw shell execution from the browser.
- `/health` reports live bridge metrics including active jobs and running sessions, surfaced in the remote host dashboards.

### 24/7 remote host setup

Recommended setup for an always-on Windows PC:

1. Install Tailscale and make sure your phone can reach the PC over the Tailnet.
2. Set the same secret in `BRIDGE_AUTH_TOKEN` and `VITE_BRIDGE_AUTH_TOKEN` in `Z:\flowize\.env.local`.
3. Start Flowize in production host mode:

```powershell
npm run host:start
```

This launches:

- the built app from `dist/` on `0.0.0.0:3000`
- the bridge on `0.0.0.0:4141`
- separate PowerShell windows with logs under `.flowize-host-logs/`

Use dev host mode only if you are actively changing the app:

```powershell
npm run host:start:dev
```

Suggested `.env.local` additions for always-on mode:

```env
BRIDGE_AUTH_TOKEN=your-long-random-secret
VITE_BRIDGE_AUTH_TOKEN=your-long-random-secret
BRIDGE_ALLOWED_ORIGIN=http://localhost:3000,http://192.168.1.190:3000,http://100.x.y.z:3000
BRIDGE_DATA_DIR=.flowize-bridge
BRIDGE_LOG_LEVEL=info
```

Replace the example origins with the actual desktop, LAN, and Tailscale URLs you use.

For startup on boot/logon, use Windows Task Scheduler:

- Trigger: `At log on`
- Action: `powershell.exe -ExecutionPolicy Bypass -File Z:\flowize\scripts\start-remote-host.ps1`
- Start in: `Z:\flowize`
- Enable: `Run with highest privileges`

Operational notes:

- keep the PC awake and signed in
- allow ports `3000` and `4141` locally if Windows Firewall prompts
- test from phone by loading the Flowize URL first, then verify the bridge shows `Host ready`
- prefer `npm run host:start` for 24/7 use; it builds once and serves static assets instead of relying on the Vite dev server

## Project structure

- `App.tsx` - Main application state, auth middleware, and workflow orchestration
- `components/` - Step-based UI, authentication flow, and settings modal
- `contexts/` - Global state providers including ThemeContext for dark mode and AuthContext for authentication
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

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
