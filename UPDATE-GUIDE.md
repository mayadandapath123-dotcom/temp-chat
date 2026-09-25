# TempChat v10 — Refresh, settings-only themes and manual cleanup

Base: latest GitHub main **96dd44963ae02240bcd1497f3f13749c9c997b33** (protected admin console release). This package contains the complete current source, not just a patch.

## Requested changes

### Refresh and reconnect

A visible **↻ Refresh** control is available next to Exit in chat, on the join screen, in the call header and in Settings.

It opens two choices:
- **Check / reconnect**: verifies the current Socket.IO session. Healthy connections and calls are left alone. A stale/disconnected connection is repaired, and the current room is rejoined if necessary. Visible messages and the composer stay on the page, but an obsolete call is stopped and must be joined again manually.
- **Reload page**: asks for confirmation, ends this tab's call/media and room connection, then loads a fresh page. Temporary chat, unsent draft, replies and local media are cleared. Only the room code, username and admin-mode flag are kept briefly in sessionStorage to prefill rejoining. No messages or media are saved. It does **not** automatically join or start a camera/microphone after reload.

Other members are not sent Reset Chat. If you were the last member, the existing empty-room cleanup can discard the room's temporary state, including appearance. A reconnect/reload is a new connection; old-session receipt/reply identities may no longer be usable. Locked rooms still require permission to re-enter, and admin authorization is not bypassed.

The page performs a bounded connection check on return after a long background pause, on network restoration, or on back/forward-cache restoration. Checks are debounced; it does not continuously ping at high frequency, automatically reload, replay messages or auto-join calls. Offline status is shown instead of starting an unnecessary reconnect loop. Failed checks remain recoverable through the visible controls.

A full reload uses a cache-busting document URL. It does not erase all browser data, unregister the current notification worker, log out the admin console, or force unsupported browser-cache behavior. Static release assets are versioned.

**If the browser's JavaScript thread is completely frozen, an in-page control cannot be guaranteed to respond. Use browser reload or close/reopen the app/tab.** A suspended phone can also stop session-only notifications until the page runs and reconnects again.

### Admin console refresh

The owner console keeps **Refresh data** (snapshot only) and adds **Reload panel** (fresh page). Reload is also available on its login page. Reloading an authenticated console keeps the normal admin session cookie; an expired/restarted server session still requires login. An unfinished moderation form prompts before it is discarded. Reload does not submit that form or log out unrelated chat tabs.

### Themes moved to Settings only

The front chat toolbar no longer has a Room theme button or “Shared with everyone” label. Use:

**⋯ Settings → Shared themes & wallpaper**

All palettes, compression, shared wallpaper behavior, overlays and existing room appearance remain working. The freed toolbar space is used for Refresh, connection status and Exit Room.

### User manual cleanup

The public manual's “Transparent moderation” / admin explanation section has been removed. Refresh guidance and the new theme location are documented there.

**Actual admin entry announcements, presence indicators, verified badges, access controls and the existing join-screen disclosure are retained.** This is manual text cleanup, not hidden admin access. The private owner console's ADMIN-SETUP.md remains available for owner setup.

## Install and deploy this final combined ZIP

Save **TempChat-Final-Refresh.zip** to Downloads. Use this filename, not an earlier ZIP:

```bash
cd ~/Downloads &&
unzip -o TempChat-Final-Refresh.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-refresh/deploy-existing.sh"
```

The installer uses **`~/Documents/Projects/temp-chat`**, verifies the exact repository/branch/base commit, refuses uncommitted/newer work, backs up the source, copies only release files and runs tests. Type **DEPLOY** to commit and push when it asks.

**Keep your existing Render ADMIN_KEY unchanged. No new key generation or notification-key setup is needed.** The installer does not copy or stage secret key files. It does not touch the typing website or change Render billing/workspaces.

Use the existing TempChat service for https://temp-chat-5yum.onrender.com/ with repository `mayadandapath123-dotcom/temp-chat`, branch `main`, build `npm ci`/`npm install`, start `npm start`/`node server.js`. Auto-Deploy can deploy the push; otherwise use Manual Deploy → Deploy latest commit.

After it is Live, close/reopen old mobile/Home Screen windows or hard-refresh desktop once to load the new scripts. Sign into `/admin` again if deployment restarted the server and expired the old in-memory admin session. Your existing key is still the correct key if you did not change it.

## Safe push after local testing

After the installer succeeded but you stopped at its DEPLOY prompt:

```bash
cd ~/Documents/Projects/temp-chat &&
npm test &&
git add -- server.js package.json package-lock.json .gitignore .env.example UPDATE-GUIDE.md ADMIN-SETUP.md PUSH-SETUP.md TEST-REPORT.md public/admin-client.js public/app.js public/camera-manager.js public/camera-zoom.js public/enhancements.css public/exit-room.js public/icons/apple-touch-icon.png public/icons/badge-96.png public/icons/icon-192.png public/icons/icon-512.png public/index.html public/links.js public/manifest.webmanifest public/notifications.js public/push-store.js public/push-worker-core.js public/refresh.js public/replies.js public/room-features.css public/room-features.js public/style.css public/sw.js public/zoom-ui.js admin/admin.css admin/admin.js admin/index.html lib/admin-control.js lib/push-service.js lib/room-features.js scripts/generate-admin-key.js scripts/generate-push-keys.js tests/admin.test.js tests/camera-manager.test.js tests/links.test.js tests/notifications.test.js tests/push-service.test.js tests/room-features.test.js tests/zoom.test.js &&
git commit -m "Add refresh recovery and move themes into settings" &&
git push origin main
```

Never stage `admin-key.env`, `push-keys.env`, real `.env` files or private backup archives.

## Rollback

If HEAD is exactly **Add refresh recovery and move themes into settings**, and no newer changes should be reverted:

```bash
cd ~/Documents/Projects/temp-chat
git revert --no-edit HEAD && git push origin main
```

Check `git log -3 --oneline` first. Your private pre-update source archive remains under `~/Documents/Projects/temp-chat-backups/`.

## Maintainer notes

- `public/refresh.js`: recovery dialog, checked reconnection, wake handling, explicit full reload and short-lived identity prefill.
- `public/exit-room.js`: shared safe cleanup for Exit, moderation exit and reload; existing Exit semantics remain unchanged.
- `server.js`: `session-health` ack contains only the requesting socket's own room/role/call membership. It never changes membership or resets a room.
- `public/room-features.js`: themes are accessible only through Settings; front toolbar becomes connection tools.
- `public/admin-client.js`: user-manual insertion removed; verified roles and announcements retained.
- `admin/`: separate data refresh/reload controls and mobile layout adjustment.

No new production dependency. Joined-page-only notifications, admin security, replies, receipts, camera flip/zoom, photo/voice handling and safe URLs are retained. See TEST-REPORT.md for tested behavior and real-device checks.
