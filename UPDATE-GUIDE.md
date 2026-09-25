# TempChat camera fix — v5.1

Based on your current GitHub main at **9ea76daae5a83bf5cb7af3bf1d62feed8d24bdca**, which already includes the previous receipts/themes update. This release does not use the stale pre-update code.

## Changes

### Camera switching
- Fixes both video-call Flip and photo-camera Flip.
- Stops the old **video** track before acquiring another. Mobile hardware often rejects opening two cameras concurrently.
- Requests the desired front/rear facing mode with `exact`, then tries appropriate alternate camera device IDs when browsers do not honor/support facing selection.
- Detects a browser returning the old or wrong camera when settings identify it, instead of simply changing the preview mirror and claiming success.
- Restores the previous camera if no alternate camera is accessible. A device with only one accessible camera cannot genuinely flip; the app now reports recovery instead of pretending it changed.
- Locks camera controls while switching to prevent overlapping requests from rapid taps.
- Stops late-returned camera tracks if you close the photo camera or leave the call while camera access is pending.
- Keeps the call microphone track and its mute state unchanged during a flip. Video may pause briefly while the hardware changes.
- Blocks camera flipping during screen sharing with an explanatory toast. Stop screen sharing first.
- Recovers from an ended call-camera track when you turn the camera back on.
- The photo-camera modal is unavailable while in a call to avoid competing for the call camera. Gallery selection remains available outside the call overlay.

### Removed
The screenshot/capture-permission feature is completely removed: toolbar button, settings entry, dialogs, votes, timers, Socket.IO handlers, and server state. There is no replacement screenshot restriction. Ordinary websites cannot reliably block operating-system screenshots.

### Kept
Group Sent/Delivered/Seen statuses, per-person details, all six themes, shared compressed photo wallpapers, text chat, voice notes, group view-once photos, presence, invitations, reset, server-relayed calls, VAD, and video bandwidth throttling.

## Download, install and deploy

Save the new ZIP as `~/Downloads/TempChat-Camera-Fix.zip`. Run:

```bash
cd ~/Downloads &&
unzip -o TempChat-Camera-Fix.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-camera-fix/deploy-existing.sh"
```

This script targets your existing project at **`~/Documents/Projects/temp-chat`**. It checks origin/main against the base above, refuses uncommitted changes or newer GitHub work, backs up your source under `~/Documents/Projects/temp-chat-backups/`, installs release files, and runs tests. It never changes remotes or force-pushes.

When asked, type **DEPLOY** to commit and push to your existing GitHub `main`. Press Enter instead to keep the update local for testing. If the script stops, share the error; do not delete/reset your work.

Your existing Render service should track:
- Repository: `mayadandapath123-dotcom/temp-chat`
- Branch: `main`
- Build: `npm ci` or the existing `npm install`
- Start: `npm start` or the existing `node server.js`

With Auto-Deploy enabled, the push triggers deployment. Otherwise use **Manual Deploy → Deploy latest commit**. No new service is needed. No GitHub/Render credentials are included in the ZIP; use your normal Git authentication.

Existing URL: **https://temp-chat-rztd.onrender.com/**

**After deployment, close and reopen all phone/browser tabs**, or hard-refresh desktop with Ctrl+Shift+R. The camera helper and changed app files are versioned in the HTML to avoid stale cached code. Deployment restarts end active calls and discard temporary room state. A code push does not bypass Render bandwidth suspension.

## Optional local test before pushing

Press Enter instead of DEPLOY, then:

```bash
cd ~/Documents/Projects/temp-chat
npm start
```

Stop an older local server with Ctrl+C in its terminal first if port 3000 is occupied. For HTTPS on a phone, in a second terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

Keep both terminals open. Use the generated HTTPS URL; plain HTTP on a LAN IP normally cannot access the camera. Test using the checklist in TEST-REPORT.md, particularly Android Chrome/iPhone Safari as applicable.

## Push later after a successful installation

```bash
cd ~/Documents/Projects/temp-chat &&
npm test &&
git add server.js package.json package-lock.json .gitignore public/index.html public/app.js public/style.css public/sw.js public/room-features.js public/room-features.css public/camera-manager.js lib/room-features.js tests/room-features.test.js tests/camera-manager.test.js UPDATE-GUIDE.md TEST-REPORT.md &&
git commit -m "Fix camera switching and remove capture permission" &&
git push origin main
```

If the commit already exists, inspect `git status` and `git log -1` before pushing; don't force-push.

## Rollback

Check `git log -3 --oneline`. Only if the latest commit is **Fix camera switching and remove capture permission**, and you want to undo precisely that release:

```bash
cd ~/Documents/Projects/temp-chat
git revert --no-edit HEAD && git push origin main
```

Render can also redeploy the previous working commit. The local backup contains your pre-update source, including any local `.env`; don't upload/share that backup.

## Data and bandwidth

These fixes add no new production dependencies, database, uploads, recording, or extra call streams. Audio/video still pass through the server and use outbound bandwidth. Shorten video tests on Render's allowance. Wallpapers remain compressed to a maximum 220 KiB.

Group receipt semantics are unchanged: Sent means server-accepted; Delivered means received by a participant's app; Seen means visible in a focused chat, not proof of reading. For media it refers to the tile, not playing/opening the contents. Receipt metadata is bounded per room and transient; wallpaper/metadata clear when the room empties, resets, or the server restarts. Content is not end-to-end encrypted, and recipients can capture or retain it.

## Maintainer files

- `public/camera-manager.js`: shared camera-only acquisition, validation, recovery, and cancellation helper; loaded before `app.js`.
- `public/app.js`: call and photo flip integrations, control locks, race cleanup. Both existing v3/v4 photo-camera blocks use the helper because the later block replaces earlier UI.
- `public/room-features.js`, `.css`, `lib/room-features.js`: capture-permission code removed; receipts/themes retained.
- `tests/camera-manager.test.js`: isolated camera regression tests and permission-feature removal check.
- `tests/room-features.test.js`: retained room/receipt/theme/media regression tests.

Use `npm ci --include=dev && npm test` with Node.js 18+; a supported Node LTS is recommended for deployment.
