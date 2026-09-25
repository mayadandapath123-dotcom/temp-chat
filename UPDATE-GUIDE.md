# TempChat v9 — protected owner admin panel

Built from latest GitHub main **7ebbce1e0e1c4c6834afc6d38e67d8b5650e7936**, the joined-room-notifications fix. That notification behavior is retained; server Web Push is not re-enabled.

## Included

- `/admin` owner login and responsive live dashboard.
- Current room/member lists, join times, approximate active/away durations and call status.
- Message/media counters, server uptime/memory, estimated relay payload and temporary activity metadata.
- Search/filter and approximately five-second refresh while the dashboard is visible.
- Verified, announced Admin entry through the normal chat page; no hidden observer or historical-content viewer.
- Remove a session, lock/unlock new entry, clear chat, end a call, or close and lock a room. Destructive room-wide actions require typing the exact room code.
- Server-side authorization, HttpOnly/SameSite cookies, HTTPS Secure cookies, CSRF/origin checks, login rate limiting, eight-hour session expiry, and logout revocation of that login's admin room sessions.
- Public disclosure of metadata visibility and verified admin visit badges.

All existing text/replies/receipts, links, themes/wallpaper, Exit, camera flip/zoom, voice notes and calls are retained. Public room entry accepts up to the backend's existing 24-character room-code limit, including admin links.

## Install the NEW release

Save **TempChat-Admin-Panel.zip** to Downloads:

```bash
cd ~/Downloads &&
unzip -o TempChat-Admin-Panel.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-admin-panel/deploy-existing.sh"
```

The script targets **`~/Documents/Projects/temp-chat`**, verifies repository/branch/base, refuses newer/uncommitted work, creates a private local source backup, applies an explicit release file list and runs the tests. Type **DEPLOY** when ready to commit/push, or press Enter to stop for local testing.

It does not force-push, change remotes, touch the typing website, provision a paid service, or upload a secret file.

## One-time admin setup

Follow **ADMIN-SETUP.md**:

```bash
cd ~/Documents/Projects/temp-chat
node scripts/generate-admin-key.js
cat admin-key.env
```

**Keep that output private.** Add only its key value to `ADMIN_KEY` in your active TempChat Render service → Environment, then save/redeploy.

After deployment, open **https://temp-chat-5yum.onrender.com/admin** and sign in with that value. There is no default password and no key is bundled in this ZIP. Missing/invalid ADMIN_KEY leaves the admin APIs locked while public chat still operates.

Keep the existing Render repo `mayadandapath123-dotcom/temp-chat`, branch `main`, build `npm ci` or `npm install`, and start `npm start` or `node server.js`. Auto-Deploy can deploy the push; otherwise select Manual Deploy → Deploy latest commit.

Close/reopen existing chat tabs after deployment so role badges and forced-exit handling load. Server restart ends active calls and resets temporary rooms, metrics, locks and admin sessions.

## Safe push after local testing

After a successful installation, use only these release files—not `git add -A`:

```bash
cd ~/Documents/Projects/temp-chat &&
npm test &&
git add -- server.js package.json package-lock.json .gitignore .env.example UPDATE-GUIDE.md ADMIN-SETUP.md PUSH-SETUP.md TEST-REPORT.md public/admin-client.js public/app.js public/camera-manager.js public/camera-zoom.js public/enhancements.css public/exit-room.js public/icons/apple-touch-icon.png public/icons/badge-96.png public/icons/icon-192.png public/icons/icon-512.png public/index.html public/links.js public/manifest.webmanifest public/notifications.js public/push-store.js public/push-worker-core.js public/replies.js public/room-features.css public/room-features.js public/style.css public/sw.js public/zoom-ui.js admin/admin.css admin/admin.js admin/index.html lib/admin-control.js lib/push-service.js lib/room-features.js scripts/generate-admin-key.js scripts/generate-push-keys.js tests/admin.test.js tests/camera-manager.test.js tests/links.test.js tests/notifications.test.js tests/push-service.test.js tests/room-features.test.js tests/zoom.test.js &&
git commit -m "Add protected admin console and visible room moderation" &&
git push origin main
```

Never add `admin-key.env`, `push-keys.env`, real `.env` files or backup archives. If already committed, inspect `git status` and `git log -1` before pushing.

## Important limits

- “Active” means the browser reported active; it does not prove human attention or keyboard use.
- Dashboard relay bytes are an estimate of selected app payload, not Render's billing/remaining quota.
- Remove ends one socket session, not a permanent anonymous-user ban. New-session re-entry is possible unless entry is locked.
- Locks last at most one hour and are lost on restart. Reconnection counts as new entry.
- The console doesn't expose message contents, old/deleted messages, view-once recovery, user IP/location or camera/audio recordings. An announced Admin joining the room sees only subsequent content as a regular room participant.
- Admin history is bounded, memory-only metadata, not a persistent compliance audit log.
- Notifications remain limited to running, joined, connected pages. See PUSH-SETUP.md for the v8 notification migration explanation, which still applies.

## Rollback

Inspect `git log -3 --oneline`. If HEAD is exactly **Add protected admin console and visible room moderation**, revert only that release with:

```bash
cd ~/Documents/Projects/temp-chat
git revert --no-edit HEAD && git push origin main
```

Backups are in `~/Documents/Projects/temp-chat-backups/`. They can include local secrets and must stay private. Removing ADMIN_KEY from TempChat's Render environment and restarting disables admin login without deleting the public chat project.

## Maintainer map

- `lib/admin-control.js`: auth/session/CSRF/rate limiting, metadata metrics, entry locks, API and moderation routing.
- `admin/index.html`, `admin/admin.js`, `admin/admin.css`: no external dependencies/assets, no embedded secrets.
- `public/admin-client.js`: verified badges, public announcements, join failures and forced Exit.
- `server.js`: small lifecycle, presence, counter and moderation hooks.
- `scripts/generate-admin-key.js`: local high-entropy key generation, restrictive file permissions.
- `tests/admin.test.js`: authorization, cookie/origin/CSRF, visibility, scoped moderation, expiry, setup and rate-limit regressions.

No new production dependency or database was added. Use `npm ci --include=dev && npm test` with Node 18+; use a supported Node LTS for hosting.
