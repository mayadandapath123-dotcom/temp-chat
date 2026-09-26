# TempChat v12 — remove the join checkbox

Base: GitHub main **0fdfd72d3cf849925b7a7f80180d9241c5350292**, the working Neon archive release.

## Changed

- The retention acknowledgement checkbox and its label are removed from the join screen, not merely hidden.
- Users enter a username/room and join normally. No extra checkbox or acceptance interaction is required.
- A short visible notice still explains that text, normal photos and voice notes may be retained for admin review for up to seven days; view-once photos/calls are excluded and Reset clears only live chat.
- When archiving is configured, eligible content continues to be archived by default. The notice becomes an archive-off message when the backend policy says archiving is disabled.
- Join, reconnect, background restore and Refresh recovery use an automatic `archiveNoticeVersion` compatibility marker. It is not recorded or described as explicit consent or proof that the user read the notice.
- Already-open v11 clients with a previously supplied acknowledgement remain compatible. Very old clients without a supported retention notice are told to reload.

Encryption, Neon schema/content, admin authentication, seven-day expiry, manual deletion, Reset semantics, capacity limits, the cleanup workflow and media exclusions are unchanged. The private archive codec/database/API modules are byte-for-byte unchanged from the previous release.

**Removing a checkbox does not turn retained data into zero-retention chat.** The retention notice remains accurate and visible. The site owner remains responsible for the appropriate privacy/legal basis and notices for their deployment; this compatibility marker is not a legal-consent record.

## Install and deploy

Save **TempChat-No-Checkbox.zip** to Downloads:

```bash
cd ~/Downloads &&
unzip -o TempChat-No-Checkbox.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-no-checkbox/deploy-existing.sh"
```

The script uses **`~/Documents/Projects/temp-chat`**, verifies the repo/base and clean working tree, creates a private source backup, copies the explicit release file list and runs tests. Type **DEPLOY** when prompted to commit/push.

**Keep all existing Render and GitHub secrets unchanged.** Do not generate replacement admin/archive keys, recreate the Neon project or change the database connection string for this update. The archive encryption key must stay the same to read existing data.

Use the existing TempChat Render service at https://temp-chat-5yum.onrender.com/. After its deploy finishes, close/reopen old chat tabs or hard-refresh once. The checkbox disappears once the new HTML/scripts are loaded.

If the safety script stops because GitHub changed or there is uncommitted work, share only the error—do not reset/delete files or bypass the check.

## Push after local testing

```bash
cd ~/Documents/Projects/temp-chat &&
npm test &&
git add -- server.js package.json package-lock.json .gitignore .env.example UPDATE-GUIDE.md NEON-ARCHIVE-SETUP.md ADMIN-SETUP.md PUSH-SETUP.md TEST-REPORT.md public/admin-client.js public/app.js public/archive-notice.js public/camera-manager.js public/camera-zoom.js public/enhancements.css public/exit-room.js public/icons/apple-touch-icon.png public/icons/badge-96.png public/icons/icon-192.png public/icons/icon-512.png public/index.html public/links.js public/manifest.webmanifest public/notifications.js public/push-store.js public/push-worker-core.js public/refresh.js public/replies.js public/room-features.css public/room-features.js public/style.css public/sw.js public/zoom-ui.js admin/admin.css admin/admin.js admin/archive-viewer.css admin/archive-viewer.js admin/index.html lib/admin-control.js lib/archive-codec.js lib/archive-routes.js lib/chat-archive.js lib/push-service.js lib/room-features.js scripts/generate-admin-key.js scripts/generate-archive-secrets.js scripts/generate-push-keys.js tests/admin.test.js tests/archive-codec.test.js tests/archive-notice.test.js tests/archive-postgres.test.js tests/camera-manager.test.js tests/links.test.js tests/notifications.test.js tests/push-service.test.js tests/room-features.test.js tests/zoom.test.js .github/workflows/archive-cleanup.yml &&
git commit -m "Remove join checkbox while keeping retention notice" &&
git push origin main
```

Do not use `git add -A` to stage private key/env files or backup archives. If the commit already exists, inspect `git status` and `git log -1` before pushing.

## Rollback

If HEAD is exactly **Remove join checkbox while keeping retention notice**, and you intend to undo just this release:

```bash
cd ~/Documents/Projects/temp-chat
git revert --no-edit HEAD && git push origin main
```

Check the log first. A rollback of this UI/protocol update does not delete Neon archives. Keep existing secrets and cleanup scheduling working.

## Unchanged setup references

NEON-ARCHIVE-SETUP.md still describes the storage, encryption and expiry job. ADMIN-SETUP.md describes the existing owner login. You do not need to repeat either setup if they are already working.
