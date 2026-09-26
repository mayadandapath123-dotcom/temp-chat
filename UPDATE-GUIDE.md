# TempChat — rooms, private approval, member removal and temporary history

Base: GitHub main **1b10f5551d3d01ecba1d82ff25e62e28133b0f25** (the no-checkbox release).

This release adds, per your request:

## 1. Public / private rooms and room naming
- When you create a room (first person for that code), optional name + **Public / Private** choice. Default is Public.
- **Public:** anyone who types the code joins directly.
- **Private:** typing the code sends a join request to every current member; all must approve. A **private invite link** (contains an unguessable token) joins without approval.
- The first creator's choice stays until the room closes. The **room code and name are always visible** in the header (including mobile).

## 2. Member removal by vote (3+ members)
- In the **Room members** list, when 3 or more people are present, each member gets a **Remove** button (not for yourself, not for a verified Admin).
- The requester explains why (visible to members), then everyone **except the person being removed** must approve (the requester already counts).
- On unanimous approval the person is removed and **blocked from rejoining from that browser/device for one hour**, under any username.
- A website cannot reliably block a SIM card, Wi-Fi, location or physical device. The block uses a persistent browser identifier; incognito windows, another browser, clearing site data, or a different device can bypass it. This limitation is stated in the manual.

## 3. Temporary in-room history (late joiners see context)
- While a room is open, text messages, reply references and regular photos are held in memory.
- A person joining later receives these so they can see the earlier topic.
- **Cleared when the room is Reset**, and when the room closes (the last member leaves). No voice notes, view-once photos or call streams are retained.
- This is the only storage for the new features. The retired seven-day admin archive is removed in this release (see below).

## 4. Retiring the old seven-day admin archive
- The 7-day Neon chat archive, its admin viewer and the retention notice are removed.
- New chat is temporary again ("nothing stored after reset/close").
- **Keep** `ARCHIVE_DATABASE_URL`, `ARCHIVE_CLEANUP_TOKEN` and the GitHub cleanup workflow **until the old rows expire and the cleanup endpoint reports `remaining: 0`**, then remove them. The cleanup module deletes only already-expired rows; it can never read content or add new data.
- Keep `ADMIN_KEY` for the private live-moderation console (live rooms/members only; no chat-history viewer).

## Install and deploy
Save **TempChat-Rooms-v2.zip** to Downloads, then:

```bash
cd ~/Downloads &&
unzip -o TempChat-Rooms-v2.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-rooms/deploy-existing.sh"
```

If the installer stops with *"uncommitted/untracked changes"*, your local folder still holds files from an earlier update that was never pushed (for example the temporary-mode retirement, which this release already includes). Save them into a Git stash — nothing is deleted — and run the installer again:

```bash
cd ~/Documents/Projects/temp-chat &&
git stash push --include-untracked -m "pre-rooms leftovers" &&
git status --short --untracked-files=all
```

An empty result means the folder is clean. The stash stays available via `git stash list`.

The installer uses `~/Documents/Projects/temp-chat`, verifies repo/base/clean tree, backs up your source, copies release files, deletes the retired archive files, and runs tests. Type **DEPLOY** to commit/push. It never force-pushes or deletes secret files/databases.

Existing Render service/repo/branch stay the same (build `npm ci`, start `npm start`). After it goes Live, close/reopen old tabs once.

## Safe push after local testing
```bash
cd ~/Documents/Projects/temp-chat &&
npm test &&
git add -- server.js package.json package-lock.json .gitignore .env.example UPDATE-GUIDE.md TEST-REPORT.md public/admin-client.js public/app.js public/camera-manager.js public/camera-zoom.js public/enhancements.css public/exit-room.js public/icons/apple-touch-icon.png public/icons/badge-96.png public/icons/icon-192.png public/icons/icon-512.png public/index.html public/links.js public/manifest.webmanifest public/notifications.js public/push-store.js public/push-worker-core.js public/refresh.js public/replies.js public/room-controls.js public/room-features.css public/room-features.js public/style.css public/sw.js public/zoom-ui.js admin/admin.css admin/admin.js admin/index.html lib/admin-control.js lib/push-service.js lib/retired-archive-cleanup.js lib/room-features.js lib/room-lifecycle.js scripts/generate-admin-key.js scripts/generate-archive-secrets.js scripts/generate-push-keys.js tests/admin.test.js tests/camera-manager.test.js tests/links.test.js tests/notifications.test.js tests/push-service.test.js tests/room-features.test.js tests/room-lifecycle.test.js tests/temporary-mode.test.js tests/zoom.test.js .github/workflows/archive-cleanup.yml lib/chat-archive.js lib/archive-codec.js lib/archive-routes.js public/archive-notice.js admin/archive-viewer.js admin/archive-viewer.css tests/archive-codec.test.js tests/archive-notice.test.js tests/archive-postgres.test.js &&
git commit -m "Add rooms, private approval, member removal and temporary history" &&
git push origin main
```

## Rollback warning
If HEAD is exactly **Add rooms, private approval, member removal and temporary history**, a revert restores the old archive-capable code — which, with old archive environment values still set, could start storing again. Don't roll back casually. Inspect the commit and ask if unsure.

## Notes / limitations
- Removal ban and room identity/visibility/history are memory-only and reset when the room closes or the server restarts (Render free tier can restart). A closed room is a fresh room when recreated.
- History is capped and is best-effort, not a durable transcript. It is not end-to-end encrypted and members can still screenshot.
- These features are documented in the user manual only, as requested.
