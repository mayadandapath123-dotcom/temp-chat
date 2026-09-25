# TempChat v7 — testing and limitations

Base: GitHub main `7ec0b253`.

## Automated tests

**46 tests passed** covering:
- All retained camera-flip, zoom, reply, receipt, room-isolation, media and theme behavior.
- Only-self Exit: membership/call removal without clear-chat, remaining user's messages/quotes intact.
- Safe HTTP(S)/www/domain link parsing; punctuation preservation; no JS/data/credential/email-fragment link conversion; literal HTML remains text.
- Push registration validity, HTTPS provider allowlist, cryptographic subscription-key shape, private-key/config separation.
- Room-scoped sender/title/body dispatch after a socket closes, no self/foreground duplicates, endpoint deduplication, preview opt-out.
- Explicit Exit revocation, device-wide off on the same endpoint without affecting other devices, expired/provider-gone subscription cleanup, room reset.
- Optional subscription-only file store reload after restart; session auth tokens are hashed and no chat message text is persisted there.
- Foreground heartbeat expiry for OS-suspended clients.
- Worker-approved binding delivery with no open page, local revocation of queued content, notification cleanup, stale/cross-room rejection, preview masking, safe click routing and platform-error reporting.

Push transport and operating-system notification APIs in unit tests are mocked. They prove code behavior, not live Google/Apple/Mozilla delivery to an actual phone.

The deployment installer also passed a separate-HOME dry-run: it cloned the correct base, backed up source, copied the explicit release file list and passed the tests without committing or pushing. Syntax checks and `git diff --check` passed. Dependency audit reported zero known vulnerabilities at packaging.

## Browser smoke test

Chromium with a touch-capable 390×844 viewport and another browser context:
- Direct `/room/NEWROOM` and `/?room=NEWROOM` invitations load the full app with prefilled room.
- Three URL formats render as safe new-tab anchors; HTML-looking message content does not become an image/script.
- ON requests browser permission exactly once (mock permission/PushManager because the sandbox cannot provide a real phone subscription).
- The actual service worker and actual IndexedDB binding protocol are exercised. A test-only server mocks provider network transport; no external push provider is contacted.
- The server test acknowledgement and notification UI display correctly.
- Exit during a simulated video call returns to the clean join page, removes only that member, preserves the other browser's chat and removes the exiting session's local push binding.
- No uncaught JavaScript errors or horizontal page overflow in the smoke run.

A test acceptance from the provider is not confirmation that a notification appeared on the phone. No actual-device push delivery or authenticated production deployment has been performed here.

## Phone acceptance checklist (after VAPID setup)

1. Open the current Render URL, join the same room on two devices, and switch Phone notifications ON. Confirm the browser permission prompt and the final ON status.
2. On iPhone/iPad use iOS/iPadOS 16.4+ and the installed Home Screen web app. On Android allow both site/browser and OS notifications.
3. Send background test. Check the notification shade. If missing, inspect site permission, OS notification settings, DND, battery restrictions and server key/config status.
4. Put one phone in the background, then send text from the other. Verify sender name and preview. Try closing the receiving page, then send again while the server still retains its registration.
5. Untick name/text previews and verify generic alerts. Photos/voice notes should only produce labels, not leaked media/captions.
6. Tap an alert: it should focus the relevant tab or open its room invite, not auto-join or activate camera/mic.
7. Explicitly Exit on one device. It should return to Join with media off, and the other device should remain in the room with its messages intact. The exited tab's push binding should no longer display new content.
8. In another opted-in tab/session, alerts may still continue; use Turn off on this device to disable all browser/device push bindings. Permission itself remains in browser settings.
9. Test a text URL, www URL, bare domain and both room-invite formats. Links should open only when tapped, in a new tab.
10. Verify replies, themes, photo-camera zoom/flip and a short call still work. Keep video tests short to conserve Render bandwidth.

### Restart/storage caveat

Without `PUSH_STORE_PATH` on truly persistent storage, server restarts/redeploys/free-service sleep can lose subscriptions. Reopen/rejoin to reconnect alerts. The optional persistent-file test does not turn Render's ephemeral filesystem into a persistent disk. No paid plan/storage is provisioned automatically.
