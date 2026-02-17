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
