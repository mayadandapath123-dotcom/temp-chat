# TempChat v11 — encrypted seven-day Neon archives

Base: GitHub main **22c73218ab5a2d7603025a539bdc4d664db5da79** (final refresh/settings update).

## Features

- Optional dedicated Neon/PostgreSQL archive for **text/replies, normal photos and voice notes**.
- **View-once photos and call streams excluded.**
- Brotli-compressed, AES-256-GCM-encrypted binary batches. No plaintext history file is written to the server filesystem.
- Owner-only chat-style viewer at `/admin` → **7-day archives**, with paginated sessions/messages and on-demand image/audio loading.
- Fixed seven-day expiry, manual archive deletion, expiry cleanup job and status/storage/failure reporting.
- As requested, **Reset Chat retains the admin archive**. The confirmation and retention notice say so clearly.
- Participants must acknowledge the retention policy before joining when the archive is enabled. Old clients must reload; silent retention through an obsolete no-retention client is not allowed.

Admin auth, announced live moderation, joined-page notifications (not closed-page Push), refresh/recovery, Settings-only themes, replies, links and camera features remain. Keep your existing ADMIN_KEY.

## Install this new ZIP

Save **TempChat-Neon-Archives.zip** to Downloads:

```bash
cd ~/Downloads &&
unzip -o TempChat-Neon-Archives.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-archives/deploy-existing.sh"
```

The script uses **`~/Documents/Projects/temp-chat`**, checks repository/base/cleanliness, makes a private backup, copies the release file allowlist and runs tests. Type **DEPLOY** to commit/push, or press Enter for local testing first.

This release includes a GitHub Actions workflow. If push authentication lacks workflow-write permission, fix that permission/SSH setup and push the already-created commit again. Do not force-push or reset your project.

## Required archive setup

Follow **NEON-ARCHIVE-SETUP.md**:
1. Create a NEW empty Neon project in your existing Free organization. Leave the typing project untouched.
2. Generate archive secrets locally; never paste the output or Neon connection string into chat.
3. Add ARCHIVE_DATABASE_URL, ARCHIVE_ENCRYPTION_KEY and ARCHIVE_CLEANUP_TOKEN in the **TempChat** Render service. Keep ADMIN_KEY unchanged.
4. Save/redeploy and verify archive status in the owner console.
5. Add the cleanup URL/token as GitHub Actions repository secrets, run the included cleanup workflow manually once, and leave the hourly schedule enabled.

Neon's current published Free database allowance is per project, not per database/branch. Confirm your plan in Neon Console. The application does not create provider resources, provision a paid plan or change billing automatically.

Before configuration, public chat works with archiving off. Do not assume data is retained until the archive status is ready and a test message appears. Archive errors/full capacity do not stop live messages; dropped-write warnings are visible to the admin.

## Privacy change

The old blanket no-retention wording is replaced. Eligible content can now be reviewed later by the admin for up to seven days; live Reset does not erase it. User acknowledgements are enforced at join. Media that was view-once is never archived, and encrypted batch lists contain no media bytes until an authenticated viewer requests them.

Read the setup guide's limits, cleanup scheduling, provider-backup retention, queue failure behavior and key-backup instructions. Compression does not guarantee huge media savings or unlimited free storage.

## Deployment details

Continue using the existing TempChat service/repo/branch:
- Site: https://temp-chat-5yum.onrender.com/
- Repo: `mayadandapath123-dotcom/temp-chat`, branch `main`
- Build: `npm ci` / `npm install`
- Start: `npm start` / `node server.js`

Auto-Deploy can deploy the push; otherwise Manual Deploy → Deploy latest commit. Environment changes require restart/redeploy. Close/reopen old chat windows afterward so the retention notice and new acknowledgement protocol load. Deployment does not update the typing website or its database.

## Safe push after local testing

```bash
cd ~/Documents/Projects/temp-chat &&
npm test &&
git add -- server.js package.json package-lock.json .gitignore .env.example UPDATE-GUIDE.md NEON-ARCHIVE-SETUP.md ADMIN-SETUP.md PUSH-SETUP.md TEST-REPORT.md public/admin-client.js public/app.js public/archive-notice.js public/camera-manager.js public/camera-zoom.js public/enhancements.css public/exit-room.js public/icons/apple-touch-icon.png public/icons/badge-96.png public/icons/icon-192.png public/icons/icon-512.png public/index.html public/links.js public/manifest.webmanifest public/notifications.js public/push-store.js public/push-worker-core.js public/refresh.js public/replies.js public/room-features.css public/room-features.js public/style.css public/sw.js public/zoom-ui.js admin/admin.css admin/admin.js admin/archive-viewer.css admin/archive-viewer.js admin/index.html lib/admin-control.js lib/archive-codec.js lib/archive-routes.js lib/chat-archive.js lib/push-service.js lib/room-features.js scripts/generate-admin-key.js scripts/generate-archive-secrets.js scripts/generate-push-keys.js tests/admin.test.js tests/archive-codec.test.js tests/archive-postgres.test.js tests/camera-manager.test.js tests/links.test.js tests/notifications.test.js tests/push-service.test.js tests/room-features.test.js tests/zoom.test.js .github/workflows/archive-cleanup.yml &&
git commit -m "Add encrypted Neon archives with seven-day retention" &&
git push origin main
```

Never stage actual key/env files or a private backup. If already committed, inspect git status/log before pushing again.

## Rollback and stopping retention

A code rollback can remove the archive UI/jobs but **does not erase data already stored in Neon**. Before permanently disabling the feature, delete retained archives or keep an authenticated expiry cleanup service operating until all records are purged. Review Neon restore/backup retention too.

If HEAD is exactly **Add encrypted Neon archives with seven-day retention**, inspect the change and, only if appropriate:

```bash
cd ~/Documents/Projects/temp-chat
git revert --no-edit HEAD && git push origin main
```

Never overwrite or discard the encryption key while retained archives still need to be read. Keep private source backups out of Git.

## Maintainer files

- `lib/chat-archive.js`: dedicated DB initialization, bounded capture queue, encrypted batch writes, quota guard, metadata listing, paginated decrypt/read/media, deletion and expiry cleanup.
- `lib/archive-codec.js`: bounded lossless compression, AES-GCM and strict eligible-content normalization.
- `lib/archive-routes.js`: existing admin-auth/CSRF protected APIs, with auth rechecked after asynchronous reads.
- `public/archive-notice.js`: visible retention policy and explicit join acknowledgement.
- `admin/archive-viewer.js` / `.css`: owner-only chat-style read-only viewer.
- `scripts/generate-archive-secrets.js`: separate encryption and cleanup secrets, restrictive local permissions, refuses overwrite.
- `.github/workflows/archive-cleanup.yml`: hourly authenticated expiration deletion; provider secrets must be configured.

New production dependency: `pg`. Normal `npm test` does not use real Neon credentials; the actual Postgres integration test requires an explicit localhost-only test URL and otherwise skips.
