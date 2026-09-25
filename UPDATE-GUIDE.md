# TempChat v5 — group receipts, shared appearance & capture consent

Built from `mayadandapath123-dotcom/temp-chat`, main commit `dbd5e5ab0639ea44abae9aed94b90df1de12c63e` (September 2, 2026). At inspection, the original four frontend files exactly matched https://temp-chat-rztd.onrender.com/. The deployed backend/source repository cannot be authenticated from the public URL; check Render Settings before pushing.

## What changed

- Text: Sending → Sent → Delivered N/total → Seen N/total; tap a status for recipient names and session IDs. A send not confirmed within 12 seconds is marked uncertain, not falsely marked delivered. Its text can be restored to the composer.
- Photos and voice notes: Sent, Delivered, and Seen status for the message tile. Seen does NOT mean a photo was opened or a recording was played. Existing photo-open notification remains separate.
- Same display names do not confuse ownership or receipt identity. Recipients are snapshotted at send time. Later arrivals do not count; leavers remain in the original denominator. Reconnected sessions are new identities; old messages/receipts are not replayed.
- Incoming receipts are batched and contain IDs only. Visibility checks require a focused, visible document and an actually visible, unobscured message in the main chat or in-call drawer.
- Six shared themes: Midnight gold, Ocean, Forest, Rose, Violet, Daylight. Any member can change the room appearance for everybody.
- Photo wallpapers: compressed in-browser to JPEG, max 1280 px long edge and 220 KiB output. Input max 12 MiB. Shared on change and when a member joins; palette/overlay-only changes do not resend the photo. Server validates type marker, byte limit, palette, overlay, and change frequency. Upload uses binary Socket.IO, not base64.
- Wallpaper overlay adjusts from 20–85%. Palette selection shows a local preview before Apply for everyone.
- Capture permission: one advisory room-wide request at a time; all other CURRENT members must approve. Pending request expires after 60 seconds. Approval lasts 30 seconds, belongs only to the requester, and can be revoked by any member. A join/leave, new message, reset, or theme change invalidates approval. Denial blocks agreement immediately. This does not authorize capture on behalf of members who already left.
- No automatic screenshots, recording, or chat exports. No unreliable keyboard blocking or fake screenshot detection.
- Fixed group view-once handling: one recipient opening a photo does not expire other recipients' copies. Photo-open notification now happens on opening, rather than closing.
- Reconnection rejoins the active room. Reset clears local photo references and new room metadata.
- Existing server-relayed calls, VAD/downsampling, video throttling, voice notes, screen sharing, camera controls, presence, and room isolation are retained.
- Updated vulnerable transitive dependencies within existing compatible ranges; `npm audit` reported zero vulnerabilities at packaging. No new production dependency. `socket.io-client` is a development-only integration-test dependency.

## Privacy and limitations — read before sharing the app

A browser website CANNOT reliably prevent or detect operating-system screenshots, screen recordings, or another camera. Consent is an explicit social agreement, not a technical lock. No watermark or UI restriction can make it screenshot-proof.

Messages/media still travel through the server. HTTPS provides transport protection, not end-to-end encryption. Do not market the service as screenshot-proof or E2EE. The new features add no database, disk uploads, or analytics. Existing server/hosting infrastructure may log connections/requests.

The server temporarily keeps receipt metadata (not message bodies) for at most 1 hour of valid tracking, capped at the latest 1,000 messages per room; stale records are pruned on message activity. All new metadata and wallpaper bytes are cleared when the last member leaves or the room is reset. Restart clears all memory. Existing clients can still display earlier content until closed/reset; disconnect does not erase someone else's screen.

Wallpaper is NOT view-once. Everyone can see/capture it. On Render free-tier spin-down/restart, in-memory appearance is lost.

Calls remain server-relayed and can exhaust Render bandwidth, especially multi-person video. These features do not remove Render's quota. Limit group/video testing and check your dashboard Usage.

## Download and apply to your existing project (Linux)

Save the ZIP as `~/Downloads/TempChat-Update.zip`.

```bash
cd ~/Downloads
unzip -o TempChat-Update.zip -d "$HOME/Downloads"
bash "$HOME/Downloads/temp-chat-update/deploy-existing.sh"
```

If `unzip` is missing on Ubuntu/Debian: `sudo apt install unzip`.

The script uses exactly `~/Documents/Projects/temp-chat`. It:
1. Clones that repo only if the project directory is absent.
2. Checks repository, push remote, branch, working-tree cleanliness and GitHub base commit.
3. STOPS if your project has local changes or GitHub contains newer code. Do not discard those changes—compare them first.
4. Creates a private local backup under `~/Documents/Projects/temp-chat-backups/` (excluding `.git` and `node_modules`; `.env`, if present, stays in the local backup only).
5. Copies the release files without touching `.git`, `.env`, or unrelated files.
6. Installs exact dependencies and runs syntax/integration tests.
7. Asks you to type **DEPLOY** to commit and push `main`. Press Enter to stop after local installation.

The script has no Render token and does not create a new service. Do not paste access tokens into chat. You must have write access to the GitHub account/repo. If GitHub authentication fails, use your normal authenticated Git/SSH setup; no force-push is required.

## Verify the EXISTING Render service before choosing DEPLOY

Open your existing `temp-chat-rztd` service → Settings:
- Repository: `mayadandapath123-dotcom/temp-chat`
- Branch: `main`
- Runtime: Node
- Root directory: repo root (blank), unless your service explicitly requires another value
- Build: `npm ci` (existing `npm install` is also supported)
- Start: `npm start` (existing `node server.js` is supported)
- Auto-Deploy enabled to deploy after push

If Auto-Deploy is off, use **Manual Deploy → Deploy latest commit** after pushing. If your service is connected to a different repo, STOP and compare before changing the integration. Matching live frontend files alone does not prove which of your three repositories Render tracks.

The existing URL stays `https://temp-chat-rztd.onrender.com/`. Deployment/restart will end active calls and discard ephemeral server state. A bandwidth suspension is not fixed by a code push; check Render's current quota/billing status if deployment succeeds but service remains unavailable.

## Optional local check before pushing

After the installer finishes, press Enter at the DEPLOY prompt. Stop an old local Node server with Ctrl+C in its terminal, then:

```bash
cd ~/Documents/Projects/temp-chat
npm start
```

Second terminal, for HTTPS testing with another device:

```bash
cloudflared tunnel --url http://localhost:3000
```

Share the generated `https://...trycloudflare.com` URL. Keep both terminals open. This runs on your laptop, not on Render. Use two or three browsers/phones in one room and follow the manual checklist in TEST-REPORT.md.

## Push later, after local testing

Only use these commands after the installer reports success:

```bash
cd ~/Documents/Projects/temp-chat &&
node --check server.js &&
node --check lib/room-features.js &&
node --check public/app.js &&
node --check public/room-features.js &&
npm test &&
git add server.js package.json package-lock.json .gitignore public/index.html public/app.js public/style.css public/sw.js public/room-features.js public/room-features.css lib/room-features.js tests/room-features.test.js UPDATE-GUIDE.md TEST-REPORT.md &&
git commit -m "Add group receipts, shared room themes, and capture consent" &&
git push origin main
```

If `git commit` says “nothing to commit”, the update may already be committed. Check `git status` and `git log -1` before running `git push origin main`. Never use `git push --force` for this update.

After deploy, hard-refresh on desktop (Ctrl+Shift+R), and close/reopen mobile tabs so all participants load the matching frontend/backend version.

## Rollback

If this update is the latest commit and nobody has added other work:

```bash
cd ~/Documents/Projects/temp-chat
git log -3 --oneline
```

Confirm HEAD is **Add group receipts, shared room themes, and capture consent**, then:

```bash
git revert --no-edit HEAD && git push origin main
```

This makes a normal reverting commit; it does not rewrite history. Render can also deploy the previous working commit from its dashboard. Your pre-update source backup is in `~/Documents/Projects/temp-chat-backups/`; do not upload that archive because it may contain a local `.env`.

## Maintainer map

- `lib/room-features.js`: bounded room receipt metadata, wallpaper state/validation, capture consent state machine.
- `public/room-features.js`: additive UI, receipt batching/visibility, theme compression, consent dialogs, reconnect hook.
- `public/room-features.css`: scoped UI and theme variables.
- `server.js`: small integration hooks plus identity/receipt fields on relayed messages.
- `public/app.js`: small render/send hooks and group view-once fix. Existing v3/v4 call code is not rewritten.
- `tests/room-features.test.js`: real Socket.IO integration checks.

Run `npm ci --include=dev && npm test`. Node.js 18+ works; use a currently supported Node LTS for ongoing deployment. No secret environment variables are required by this update.
