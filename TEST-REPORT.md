# TempChat v5 — test report

Prepared September 25, 2026 against the downloaded main branch at `dbd5e5a`.

## Automated checks completed

- JavaScript syntax: `server.js`, `lib/room-features.js`, `public/app.js`, `public/room-features.js` — passed.
- Deployment shell syntax: `bash -n deploy-existing.sh` — passed.
- Installer dry-run with a separate temporary HOME: cloned the correct repo, backed it up, installed files, ran tests and stopped without pushing. A second run correctly refused to overwrite the now-modified working tree.
- `npm ci --include=dev` and `npm test` — passed.
- Dependency audit at packaging — zero known vulnerabilities reported by `npm audit`. This is not a complete application security audit.

Seven real Socket.IO integration tests:
1. Group receipt recipient snapshots, duplicate usernames, late join exclusion, and cross-room isolation.
2. Independent server-generated IDs and receipts for voice notes/photos.
3. Shared binary wallpaper, validation, throttling, late join inheritance, no wallpaper retransmit on palette-only updates, and empty-room cleanup.
4. Unanimous capture approval, outsider/requester vote rejection, 30-second grant deadline, new-content cancellation.
5. Capture denial and membership-change cancellation.
6. Room reset clears receipt metadata, theme and consent.
7. Existing presence, typing and active-call-only audio relay.

Browser smoke tests in three isolated Chromium sessions, including a 390×844 mobile-size viewport:
- Room joining and same-username message ownership.
- Visible-message receipts and per-recipient details.
- A separate browser check confirmed a message behind an open modal is Delivered, not Seen, until the modal is closed and the chat is exposed.
- Theme swatches remain distinct after switching palettes.
- Palette choice, client-side wallpaper compression and shared application.
- Room-wide capture request and approval, invalidation after new content.
- Independent view-once photo opening by two group recipients.
- Reconnection rejoins the room and receives subsequent messages.
- Audio-call start/end UI using a simulated microphone.
- Room reset and mobile horizontal-overflow check.
- No uncaught page JavaScript errors during the smoke run.

## What still needs real-device testing

The desktop browser emulator is NOT an actual Android/iPhone or a cross-network call. Do a short friend/device test before relying on the update. No Render deployment or authenticated GitHub push was performed here. No real screenshots were prevented (that is not possible for an ordinary website).

### Checklist (two or three devices)

1. Join the same room on three devices, with one duplicate username. Member count and message ownership should be correct.
2. Send text from A. Keep B's tab hidden or cover its chat with the theme dialog: B should deliver, but not mark that message Seen until the chat is visible and focused. Bring B forward and close the dialog; check Seen count. Tap the status to inspect recipients.
3. Let C join after a message: C should not be added to that earlier message's recipient count.
4. Change the room theme and apply a photo wallpaper. Confirm all devices update. A later arrival should inherit the appearance. Change colours/overlay without uploading the photo again.
5. Request capture permission. Only A's request is active. One denial ends it; all peers must approve to grant it. Check pending expiry (60s), grant expiry (30s), manual revocation, and cancellation on joining/leaving/new messages.
6. Open a group view-once photo on B and close it. C should still be able to open its own copy. A should see the photo-open notice. Receipt Seen counts refer to tiles, not photo-open counts.
7. Test one voice note, a short audio call, a short video call and screen share (desktop). Check auto-mute and mic sensitivity still work. Avoid long video calls on the 5 GB allowance.
8. Briefly disconnect/reconnect B. It should rejoin without restoring old server messages. Old receipt recipient sessions do not become the new connection.
9. Reset the room. All messages, wallpaper and new permission/receipt state should clear. A fresh empty room should use Midnight gold.
10. After deploying, reopen all tabs so every participant uses the matching version.

Read UPDATE-GUIDE.md for installation, privacy limitations, data retention and rollback.
