<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1OzW1QGy296Io8ucHRlX8fYERfFdo7W8Q

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Local Worktree Bridge (required for real filesystem git worktrees)

The UI runs in the browser and cannot execute shell/git commands directly. Start the local bridge:

1. `npm run bridge:start`
2. In app settings, set `Agent Bridge Endpoint` to `http://127.0.0.1:4141/run`

Optional environment variables:

- `BRIDGE_PORT` (default: `4141`)
- `BRIDGE_HOST` (default: `0.0.0.0`)
- `BRIDGE_ALLOWED_ORIGIN` (default: `*`, or comma-separated origins like `http://localhost:3000,http://127.0.0.1:3000`)
- `BRIDGE_WORKDIR` (default: current directory)

### GitHub OAuth login (optional, local-only)

If you want to sign in with GitHub and pick repos from your account in Settings, configure the bridge with a GitHub OAuth App:

1. Create a GitHub OAuth App with callback URL:
   `http://127.0.0.1:4141/github/oauth/callback`
2. Set bridge env vars in your shell OR add them to `.env.local` before `npm run bridge:start`:
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
   - `GITHUB_OAUTH_SCOPE` (optional, default: `read:user repo`)
   - `GITHUB_OAUTH_CALLBACK_HOST` (optional, default: `127.0.0.1`)
   - `GITHUB_OAUTH_REDIRECT_URI` (optional override)
3. In Flowize settings, use **Connect with GitHub**.

No database is required. Token and selected repo remain local in app settings.
