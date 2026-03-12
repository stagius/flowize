# Remote Worktree Guide

This guide explains how to run Flowize worktrees remotely on your always-on Windows PC and control them from your phone.

## What works now

Flowize now supports a phone-first remote workflow:

- create worktrees on the PC
- run `opencode` headlessly inside a worktree
- reconnect to logs and sessions after refresh
- push the branch remotely
- create the PR remotely
- keep bridge jobs and sessions persisted on disk

## Recommended setup

- Windows PC stays on and signed in
- Flowize repo at `Z:\flowize`
- Tailscale installed on the PC and phone
- Git, Node.js, npm, and `opencode` installed on the PC

## 1. Configure `.env.local`

Create or update `Z:\flowize\.env.local`:

```env
BRIDGE_AUTH_TOKEN=your-long-random-secret
VITE_BRIDGE_AUTH_TOKEN=your-long-random-secret
BRIDGE_ALLOWED_ORIGIN=http://100.x.y.z:3000
BRIDGE_DATA_DIR=.flowize-bridge
BRIDGE_LOG_LEVEL=info
```

Notes:

- `BRIDGE_AUTH_TOKEN` and `VITE_BRIDGE_AUTH_TOKEN` must be the same value
- replace `http://100.x.y.z:3000` with your Tailscale IP or Tailnet hostname
- `BRIDGE_DATA_DIR` stores persisted remote runs

## 2. Start Flowize in 24/7 host mode

From `Z:\flowize`:

```powershell
npm run host:start
```

That starts:

- the built Flowize app on `0.0.0.0:3000`
- the local bridge on `0.0.0.0:4141`
- log files under `Z:\flowize\.flowize-host-logs`

For development only:

```powershell
npm run host:start:dev
```

## 3. Open Flowize from your phone

Open the app in your phone browser using your PC's Tailscale address:

```txt
http://<tailnet-ip-or-hostname>:3000
```

Then:

- log in to Flowize
- open Settings
- confirm `Agent Bridge Endpoint` points to the PC bridge, for example:

```txt
http://100.x.y.z:4141/run
```

- confirm the bridge shows healthy / host ready

## 4. Assign an issue to a worktree slot

In Step 3:

- drag an issue into a worktree slot
- Flowize creates or reuses the worktree remotely on the PC
- Flowize prepares the agent workspace automatically

## 5. Run the worktree remotely

In the active worktree card, click:

```txt
Run Remotely
```

Flowize will:

- prepare issue files in the worktree
- launch the typed remote agent run on the PC
- persist session and job state in the bridge
- stream logs back into Flowize

You do not need to open a local terminal for the normal remote workflow.

## 6. Reconnect to a run later

If you refresh or disconnect:

- go back to Step 3
- use the `Remote Sessions` panel
- click `Reconnect` or `Open Console`

Flowize can restore:

- running sessions
- completed sessions
- failed or interrupted sessions

## 7. Push the branch remotely

When the implementation looks good, click:

```txt
Push Remotely
```

Flowize will:

- stage changes
- create a sync commit if needed
- fetch/rebase when appropriate
- push the branch from the PC

## 8. Create the PR remotely

In Step 4, click:

```txt
Create PR Remotely
```

Flowize will:

- ensure the branch is pushed
- create the GitHub PR
- attempt worktree cleanup on the PC

## 9. Optional: open local tools on the PC

These are optional desktop-side helpers:

- `Open Local IDE`
- `Open local shell`

They are useful if you are physically at the PC, but they are not required for the remote phone workflow.

## 10. Make it start automatically on login

Use Windows Task Scheduler.

Command:

```powershell
powershell.exe -ExecutionPolicy Bypass -File Z:\flowize\scripts\start-remote-host.ps1
```

Recommended Task Scheduler settings:

- Trigger: `At log on`
- Start in: `Z:\flowize`
- Run with highest privileges: enabled

## Host health checks

In Flowize, Step 3 shows a `Host Status` card with:

- bridge connectivity
- persistence/data directory
- auth state
- active remote runs
- diagnostics like uptime and log level

## Troubleshooting

### Host offline

- verify the PC is on and signed in
- restart host mode:

```powershell
npm run host:start
```

### Bridge only needs restart

```powershell
npm run bridge:start
```

### Phone cannot connect

- verify Tailscale is connected on both devices
- verify `BRIDGE_ALLOWED_ORIGIN` matches the URL you are using
- verify Windows Firewall allowed ports `3000` and `4141`

### Remote session disappeared

- check `Z:\flowize\.flowize-bridge`
- bridge sessions/jobs are persisted there
- if the bridge restarted mid-run, the session may be restored as interrupted

### `opencode` does not run

- verify `opencode` is installed on the PC
- verify the Agent Command in Settings is valid
- verify the worktree host machine can run the command locally

## Normal remote flow summary

1. Start host: `npm run host:start`
2. Open Flowize from phone over Tailscale
3. Assign issue to worktree slot
4. Click `Run Remotely`
5. Reconnect from `Remote Sessions` if needed
6. Click `Push Remotely`
7. Click `Create PR Remotely`
