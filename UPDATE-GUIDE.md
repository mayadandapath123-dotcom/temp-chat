# TempChat v6 — quoted replies, camera zoom and notification settings

Based on the latest GitHub `main` at **8e4fd56a6b0d7b7547975666454b388e9c601a4a** (`Fix camera switching and remove capture permission`). The earlier camera fixes, message receipts, themes and wallpapers are retained. Screenshot-permission requests remain removed.

## 1. WhatsApp-style text replies

- On a phone, swipe a message horizontally in either direction. On any device, tap/click **↩ Reply** beneath the message.
- The selected message appears above the composer. Type and send to attach a quoted reference. Cancel with **✕** or Escape.
- Tap the quote in a sent message to scroll to and highlight the original, if still in this browser's view.
- Works in normal chat and the in-call text drawer. This is a reply draft, not a permanent room-wide pin.
- Send text replies to text messages, photos or voice notes. Media quotes contain only “Photo”, “View-once photo” or “Voice note”; image bytes and hidden captions are not copied into a quote.
- Sending an image or recording a voice note as the reply body is not implemented in this release. Cancel the reply to send those separately; the UI explains this.
- Swiping a view-once photo must not open it. Vertical scrolling, text selection, and the visible Reply button remain available.
- The server validates the original in the same room and creates the author/excerpt itself; clients cannot forge quoted authors. A participant must have belonged to the original message's recipient snapshot or be its sender.
- Unavailable, expired or reset originals reject a reply with “Not sent”; tap its status to restore the draft text to the composer. A disconnected/reconnected client is a new socket identity, so older reply targets can become unavailable.

### Memory/retention change

For reliable quote verification, the server now holds **up to 180 characters of text per original message**, plus its author/kind and receipt metadata. This is bounded to the latest 1,000 tracked messages per room, valid for 1 hour; stale entries are pruned on message activity. No media bytes are stored in reply metadata. These room records disappear on room reset, last-member departure, or process restart. There is no new database or disk message storage. Quotes already delivered remain visible in other participants' browsers until cleared/closed, just like messages.

## 2. Camera zoom in photos and calls

Both cameras now show **1× / 2× / 3× / 10×**.

- When `MediaStreamTrack.getCapabilities()` exposes a usable zoom range and settings, the app tries device-controlled zoom and checks whether it was applied.
- Other levels use a clearly labeled **digital center crop**. 10× digital zoom reduces detail; it cannot manufacture optical magnification.
- Browser APIs do not tell this app whether a camera zoom setting is optical, sensor crop, or a vendor combination. **No preset is advertised as guaranteed optical zoom.**
- Digital crop is applied to the actual saved photo / outgoing video frames, not just the local preview.
- Returning to 1× removes the crop. Flipping cameras resets zoom. The microphone is unchanged.
- Zoom controls hide when the call camera is off or screen sharing is active. Zoom does not apply to shared screens.
- Output size/frame rate/compression remain bounded by the existing call bandwidth settings. No extra stream or higher-resolution video relay is added.

## 3. Mobile notification settings

Open **⋯ Settings → Notification settings & test**.

Added/fixed:
- Explicit permission request from a user tap, not an automatic prompt on room join.
- Enable & send test, turn off for this device, and optional sender/message previews (off by default).
- Status for unsupported, blocked, allowed or locally disabled alerts.
- A single service-worker notification implementation instead of duplicate registrations.
- `event.waitUntil()` and a success/error acknowledgement so the app does not blindly say a test succeeded.
- Notification clicks target the exact originating tab, rather than an unrelated room. If that tab is gone, an encoded room link opens; it does not automatically join or answer a call.
- Actual PNG notification/app icons and an install manifest/Home Screen metadata.
- Android/iPhone guidance, including phone-level permission, Do Not Disturb and battery restrictions.

### Important notification limits

**There is no server Web Push backend or Push subscription in this release.** The app can show system alerts only while the page is running and receiving room messages. Phone lock/suspension can stop the socket; closing the page stops new message alerts. Installing the site as a Home Screen app does not by itself fix this. A successful test only confirms acceptance by the browser, not that the OS displayed it or that later lock-screen delivery will work.

On Android, allow this site in browser settings and your browser in Android's app-notification settings. On iOS/iPadOS 16.4+, Safari's Home Screen web-app context is the relevant notification-capable context; actual support/delivery varies and Web Push has not been implemented. Follow the in-app guidance and test on the phone. This update cannot inspect or override OS permission/DND settings.

**New Render workspace/URL:** notification permission is per origin. Allow/test it again on the new TempChat address. Existing Home Screen shortcuts point to the old address; replace those after moving.

## Download and deploy

Download this release specifically as **`~/Downloads/TempChat-Replies-Zoom.zip`**. Do not run commands for either of the older ZIPs.

```bash
cd ~/Downloads &&
unzip -o TempChat-Replies-Zoom.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-replies-zoom/deploy-existing.sh"
```

The script targets **`~/Documents/Projects/temp-chat`**, checks the repo/branch/base commit, refuses uncommitted work or newer GitHub code, backs up your source, copies the full release and runs the tests. Type **DEPLOY** when prompted to commit and push; press Enter to stop after local installation. Never force-push or bypass a safety error—share its output first.

### Render, including a new workspace

Use your intended **TempChat web service**, not the typing website or its database:
- Repository: `mayadandapath123-dotcom/temp-chat`
- Branch: `main`
- Runtime: Node
- Root directory: repo root / blank
- Build: `npm ci` (or existing `npm install`)
- Start: `npm start` (or existing `node server.js`)

The same Git push works whether your TempChat service is in the old or the new workspace, as long as it follows this repo and branch. Auto-Deploy must be enabled, or choose **Manual Deploy → Deploy latest commit** in the intended service. If both old and new TempChat services still track `main`, both might deploy; use the new service URL after confirming it works. No typing-service resources need changing.

The installer does not log into Render, create a service, change billing, reset bandwidth usage, or touch other repositories. GitHub write access through your normal Git authentication is required.

After deploy, close/reopen phone tabs or hard-refresh desktop. Calls end during restart and temporary server room state clears. This release versions JS/CSS and updates the notification worker. If a Home Screen app shows old UI, close all its windows and reopen on the correct URL.

## Local test before pushing

Press Enter at the installer's DEPLOY prompt. Stop the older local server with Ctrl+C in its terminal, then:

```bash
cd ~/Documents/Projects/temp-chat
npm start
```

Second terminal for HTTPS phone testing:

```bash
cloudflared tunnel --url http://localhost:3000
```

Keep both terminals open and use the generated HTTPS link. Camera/system notifications require an appropriate secure browser context. Each new tunnel hostname can require fresh permission.

To push after a successful local installation:

```bash
cd ~/Documents/Projects/temp-chat &&
npm test &&
git add server.js package.json package-lock.json .gitignore public/index.html public/app.js public/style.css public/sw.js public/room-features.js public/room-features.css public/camera-manager.js public/camera-zoom.js public/zoom-ui.js public/replies.js public/notifications.js public/enhancements.css public/manifest.webmanifest public/icons/icon-192.png public/icons/icon-512.png public/icons/apple-touch-icon.png public/icons/badge-96.png lib/room-features.js tests/room-features.test.js tests/camera-manager.test.js tests/zoom.test.js tests/notifications.test.js UPDATE-GUIDE.md TEST-REPORT.md &&
git commit -m "Add quoted replies, camera zoom and mobile notification settings" &&
git push origin main
```

If already committed, inspect `git status` and `git log -1` before pushing. No force-push is needed.

## Rollback

Inspect `git log -3 --oneline`. If HEAD is this release's commit and you want to undo exactly it:

```bash
cd ~/Documents/Projects/temp-chat
git revert --no-edit HEAD && git push origin main
```

The local source backup is under `~/Documents/Projects/temp-chat-backups/`. Keep it private: it may include your local `.env`. Do not upload it to GitHub.

## Maintenance

New code: `public/replies.js`, `camera-zoom.js`, `zoom-ui.js`, `notifications.js`, `enhancements.css`, `manifest.webmanifest`, `icons/`. Small hooks in the existing app/server preserve the previous architecture. No new production dependencies. Run `npm ci --include=dev && npm test` with Node 18+; use a supported Node LTS for hosting.
