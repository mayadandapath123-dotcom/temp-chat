# TempChat v8 — notifications only while joined

Built from GitHub main **3a66de09dcbe57ed6a38373b8b652bdf7f085c9b** (the previous Exit/Web Push release).

This update prioritizes the notification behavior you clarified. **The admin panel is paused and is not part of this release.** Existing Exit, clickable URLs, direct room links, replies, receipts, themes, photo/video zoom and camera-flip fixes are retained.

## Exact notification rule

| Situation | New alerts |
|---|---|
| Joined and connected; TempChat running in another tab or behind another app | Allowed, subject to browser/phone support |
| Looking at the chat in the foreground | Suppressed; the message is already on screen |
| Explicit Exit Room | Stopped for that session |
| Closed tab/page or fully closed browser | Stopped |
| Connection lost | Paused until an actual room reconnection |
| Phone completely suspends the page | May stop; there is no offline Push fallback |
| Join screen only, even with notifications previously enabled | Stopped |

The new worker verifies the live page immediately before displaying a notification. Session generations invalidate delayed work on Exit, disconnect, room reset and preference changes. A late OS show completion is closed if it raced with Exit. Clicking an old alert never creates a new tab or silently re-enters an exited room.

## What was removed

- Server/provider Web Push dispatch and subscription storage.
- VAPID key requirements.
- The `web-push` production dependency.
- Persistent/24-hour notification room membership and offline alert delivery.

Compatibility API/event handlers remain only to reject old registration requests clearly and let obsolete clients clean up safely. Old environment keys do not enable remote push again. The worker attempts to remove the v7 browser subscription and old local binding database during migration; old remote payloads are ignored by the new worker.

## Install/deploy the NEW ZIP

Download **TempChat-Room-Notifications.zip**, not one of the older ZIPs.

```bash
cd ~/Downloads &&
unzip -o TempChat-Room-Notifications.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-room-notifications/deploy-existing.sh"
```

It targets **`~/Documents/Projects/temp-chat`**, verifies origin/main and the base commit, refuses uncommitted/newer work, backs up the source, copies the release and runs the tests. Type **DEPLOY** to commit/push. It never force-pushes, changes your remote, deletes local secret files or modifies the typing project.

Use the current **TempChat** Render service connected to `mayadandapath123-dotcom/temp-chat`, branch `main`, build `npm ci` or `npm install`, start `npm start` or `node server.js`. Auto-Deploy can deploy the push; otherwise select Manual Deploy → Deploy latest commit.

**No new keys or environment variables are needed.** Old VAPID/PUSH_STORE_PATH values are ignored; see PUSH-SETUP.md for optional cleanup of obsolete settings.

## Phone/browser update steps

1. Wait for Render to report the new deployment Live.
2. Close every old TempChat tab/Home Screen window.
3. Open https://temp-chat-5yum.onrender.com/ again (hard-refresh on desktop if needed).
4. Join a room and enable **⋯ → Joined-room notifications**. This new preference starts off until you turn it on; an existing browser permission may mean no additional permission prompt.
5. Test another tab/app while still joined, then test Exit and page closure.

If you still get alerts, check whether another tab is joined or whether the notification belongs to an older TempChat domain. OS notification history may still contain messages already delivered before the update; that is not a newly sent notification.

## Local checks

```bash
cd ~/Documents/Projects/temp-chat
npm ci --include=dev
npm test
npm start
```

Use `cloudflared tunnel --url http://localhost:3000` from another terminal for HTTPS phone testing. Stop any old local server with Ctrl+C first. Keys are not needed.

## Safe push after stopping at the installer's prompt

Use the explicit release file list in the command below; do not stage private `.env` or key files.

```bash
cd ~/Documents/Projects/temp-chat &&
npm test &&
git add -- server.js package.json package-lock.json .gitignore .env.example UPDATE-GUIDE.md PUSH-SETUP.md TEST-REPORT.md public/app.js public/camera-manager.js public/camera-zoom.js public/enhancements.css public/exit-room.js public/icons/apple-touch-icon.png public/icons/badge-96.png public/icons/icon-192.png public/icons/icon-512.png public/index.html public/links.js public/manifest.webmanifest public/notifications.js public/push-store.js public/push-worker-core.js public/replies.js public/room-features.css public/room-features.js public/style.css public/sw.js public/zoom-ui.js lib/push-service.js lib/room-features.js scripts/generate-push-keys.js tests/camera-manager.test.js tests/links.test.js tests/notifications.test.js tests/push-service.test.js tests/room-features.test.js tests/zoom.test.js &&
git commit -m "Limit notifications to live joined room sessions" &&
git push origin main
```

## Rollback

Inspect `git log -3 --oneline`. If HEAD is exactly **Limit notifications to live joined room sessions**, reverting it restores the previous behavior—including its closed-page Web Push behavior—so do so only intentionally:

```bash
cd ~/Documents/Projects/temp-chat
git revert --no-edit HEAD && git push origin main
```

Your local pre-update archive is in `~/Documents/Projects/temp-chat-backups/`. It may contain local secrets and must stay private.

## Maintainer notes

- `public/notifications.js`: live-page eligibility, explicit permission/settings, lifecycle cancellation and legacy cleanup.
- `public/push-worker-core.js`: despite the legacy filename, this is now the session-verifying local notification worker core. Its remote `push` method always ignores payloads.
- `public/sw.js`: session checks via a MessageChannel; old Push cleanup; no server Push delivery.
- `public/push-store.js`: migration-only deletion of the old database; no new room membership store.
- `lib/push-service.js`: disabled compatibility interface; no keys, disk reads or provider calls.
- Message/call events now include their originating room so notifications cannot be mislabeled as another room.

The previous privacy model of temporary chats/reply summaries remains. Notification preferences may be stored locally; active notification membership is not. Already shown previews can be retained by the operating system.
