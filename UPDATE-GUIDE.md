# TempChat v7 — Exit Room, Web Push and clickable URLs

Built from latest GitHub main **7ec0b253a196790511330716cfb00be17d4b1010** (replies/zoom release). Existing replies, read receipts, themes, wallpapers, camera flip/zoom, voice notes and calls are retained. Screenshot permission stays removed.

## What changed

### Clear Exit Room button

Visible in the chat toolbar and call header. A confirmation explains that only this session is leaving. It ends media, cancels recording, clears local chat/drafts/photos and returns to a fresh join screen. The server removes just that socket from the room/call and updates presence. It does not broadcast Reset Chat or delete other members' messages.

Explicit Exit also revokes this tab's room push binding. Closing the browser normally is different: it keeps an opted-in background registration until expiry, so closed-page notifications can work.

### Phone-style Web Push

In **⋯ → Phone notifications**, switching Background notifications ON requests browser permission from that user gesture. Once allowed, the browser subscribes to Push and the server binds that subscription to the joined room. Names and message previews are on by default, with an obvious opt-out.

The service worker handles push events even without an open page on supported devices. Server/worker safeguards prevent cross-room delivery, remove expired subscriptions, suppress queued content for revoked local bindings, and avoid duplicate alerts for multiple opted-in tabs on the same endpoint. Foreground recipients normally do not receive redundant system alerts. Tests/rate limits and a bounded send queue limit accidental flooding; under load queued alerts may coalesce to the latest message. Notification receipt does not count as chat Seen or Delivered—the existing receipt semantics are unchanged.

**This requires the three VAPID values in Render. Follow PUSH-SETUP.md.** No private keys are bundled in the ZIP. The default in-memory registry does not survive server restarts; the guide explains the optional durable store and its hosting requirements. Delivery is always subject to browser/OS support and policy; no WhatsApp-level delivery guarantee is claimed.

### Clickable URLs and direct invitations

- HTTP/HTTPS addresses, `www.example.com` and bare domains such as `example.com/path` in text messages become clickable.
- Links open in a new tab with `noopener noreferrer`. They are not auto-opened, fetched for previews, or treated as HTML.
- JavaScript/data schemes, credential-containing URLs and email fragments are not turned into links.
- Works in normal chat, in-call text and photo-caption rendering. Reply quotes remain one clickable jump-to-original block, not nested anchors.
- Both `https://temp-chat-5yum.onrender.com/?room=BLUE123` and `https://temp-chat-5yum.onrender.com/room/BLUE123` prefill the room. Users still explicitly join and grant camera/mic permission as needed. Joining updates the tab's URL to the canonical `/?room=...` format.

## Download and apply

Use this release specifically: **TempChat-Push-Exit.zip**. Do not run commands for the older ZIPs.

```bash
cd ~/Downloads &&
unzip -o TempChat-Push-Exit.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-push-exit/deploy-existing.sh"
```

The script targets **`~/Documents/Projects/temp-chat`**, verifies the exact repository/base commit, refuses uncommitted or newer work, backs up the source and runs tests. Type **DEPLOY** to commit and push; press Enter to stop after local installation. It does not alter remotes, force-push, log into Render or create/upgrade services.

Then follow **PUSH-SETUP.md** to generate your own keys and add them to your active TempChat Render service. Chat/Exit/links work even before push is configured; the notification panel clearly reports missing server setup rather than claiming notifications are enabled.

### Render settings

Use only your **TempChat** service (current public URL: https://temp-chat-5yum.onrender.com/):
- Repository: `mayadandapath123-dotcom/temp-chat`
- Branch: `main`
- Build: `npm ci` or the existing `npm install`
- Start: `npm start` or the existing `node server.js`

Push triggers deployment if Auto-Deploy is enabled; otherwise select Manual Deploy → Deploy latest commit. Environment changes require the service to restart/redeploy. Do not change the typing website, its database, billing plan or workspace.

After deployment, close/reopen all old TempChat tabs/Home Screen windows so the new page and service worker are both loaded. Use the new URL consistently; notification permission is per origin. Updates restart ephemeral room/call state.

## Testing and local run

Run `npm ci --include=dev && npm test` with Node 18+ (supported Node LTS recommended). Use `npm start` for local chat/Exit/link testing. For Web Push, load keys as described in PUSH-SETUP.md and use HTTPS.

See TEST-REPORT.md for automated checks and phone validation steps. Real push-provider/OS delivery was not verified on your personal phone from this workspace.

## Push later after local installation

After the installer succeeded and you have finished local testing, these commands stage only release files (not secrets):

```bash
cd ~/Documents/Projects/temp-chat &&
npm test &&
git add -- server.js package.json package-lock.json .gitignore .env.example UPDATE-GUIDE.md PUSH-SETUP.md TEST-REPORT.md public/app.js public/camera-manager.js public/camera-zoom.js public/enhancements.css public/exit-room.js public/icons/apple-touch-icon.png public/icons/badge-96.png public/icons/icon-192.png public/icons/icon-512.png public/index.html public/links.js public/manifest.webmanifest public/notifications.js public/push-store.js public/push-worker-core.js public/replies.js public/room-features.css public/room-features.js public/style.css public/sw.js public/zoom-ui.js lib/push-service.js lib/room-features.js scripts/generate-push-keys.js tests/camera-manager.test.js tests/links.test.js tests/notifications.test.js tests/push-service.test.js tests/room-features.test.js tests/zoom.test.js &&
git commit -m "Add Exit Room, real Web Push and clickable links" &&
git push origin main
```

If already committed, inspect `git status` and `git log -1` before pushing. Never force-push or add `push-keys.env`, a real `.env`, a subscription registry or a backup archive.

## Rollback

Inspect `git log -3 --oneline`. If HEAD is exactly **Add Exit Room, real Web Push and clickable links**, you can revert it with:

```bash
cd ~/Documents/Projects/temp-chat
git revert --no-edit HEAD && git push origin main
```

Do not revert unrelated newer work. The pre-update local source archive is under `~/Documents/Projects/temp-chat-backups/`. It may include local secrets and must stay private. Removing the code does not change OS notification permissions; users can turn notifications off in browser/site settings as needed.

## New modules and data handling

- `lib/push-service.js`: scoped subscription registry, VAPID configuration, provider validation, bounded dispatch, revocation/expiry, optional durable file.
- `public/notifications.js`: permission switch, subscribe/test, local binding activation, settings and presence.
- `public/sw.js`, `push-store.js`, `push-worker-core.js`: actual push handling, small IndexedDB permission records and safe click/Exit behavior.
- `public/exit-room.js`: only-self Exit, media cleanup and fresh join screen.
- `public/links.js`: safe link tokenizer and text-node renderer.
- `scripts/generate-push-keys.js`: private local key generation; no secrets in source.

Web Push adds the `web-push` production dependency. The server retains subscription endpoints/keys and room membership, optionally on disk if configured; browser IndexedDB retains local consent/binding metadata so closed-page pushes can be checked. No chat history database is added. Existing bounded reply summaries and receipt metadata remain temporary. System notification previews are a separate copy governed by the phone's retention, and screenshots remain possible.
