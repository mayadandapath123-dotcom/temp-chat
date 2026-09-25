# TempChat v10 — combined refresh/theme/manual changes

Base: GitHub main `96dd4496`.

## Automated checks

**60 tests passed**: the existing 58 auth/moderation, notification lifecycle, room, reply, receipt, media, camera/zoom and URL checks, plus:
- Session-health returns only its requesting socket's membership and does not reset/rejoin a healthy room or emit extra system messages.
- Session-health reflects current call membership and a left room without restoring either.

The safe installer also passed a separate-HOME dry-run: correct repo/base verified, private backup created, release files applied and tests passed without committing or pushing. Syntax/shell checks and `git diff --check` passed; dependency audit reported zero known vulnerabilities.

## Browser smoke test

Chromium, including a 390×844 mobile/touch viewport, two room participants and an authenticated admin page. Camera and microphone hardware are simulated; room/server/Socket.IO and page navigation are real.

Passed:
- No theme button exists on the front toolbar. Shared themes remain accessible through Settings and apply to the other participant.
- User manual has no admin/moderation section; it includes Refresh and the Settings-only theme location.
- Online restoration reconnects the room without clearing visible messages.
- A healthy check preserves the socket ID and an active call/microphone.
- A deliberately failed health acknowledgement forces reconnection and stops the obsolete microphone/call.
- Cancelling full reload leaves the call active.
- Confirming reload returns to a fresh join page, clears this tab's messages, prefills room/username and does not auto-join. The other member's messages remain intact.
- Offline checks do not navigate or wipe the page.
- A native join-screen reload link is present.
- Admin data refresh and full panel reload are distinct; full reload preserves a still-valid admin login.
- Mobile page width fits the viewport; no uncaught page errors in the completed smoke run.

These checks are not a certification of every phone/browser, and cannot make an in-page button operate when JavaScript is completely frozen. Camera/OS-notification hardware behavior still requires real-device testing.

## Quick phone check after deployment

1. Close/reopen once to load v10. Confirm Refresh and Exit are visible and the front theme button is gone.
2. Open Settings → Shared themes & wallpaper; apply a theme and confirm the room still shares it.
3. Read the manual: admin explanation should be absent. A real verified admin visit must still announce itself and show badges.
4. Send a message, choose Refresh → Check / reconnect, and confirm the visible chat stays.
5. Switch to another app for a minute, then return. The app should check its connection rather than automatically erase/reload the chat.
6. Try Reload page: cancel once, then confirm. Confirm the call/media stops, the room/name are prefilled, and you must explicitly join again.
7. On `/admin`, try Refresh data and Reload panel. Existing ADMIN_KEY remains valid; a server redeploy may require signing in again.
8. Test ordinary replies, notifications while joined, camera flip/zoom and Exit briefly. Keep video tests short to conserve Render bandwidth.

No production deployment was performed here. The ZIP does not contain private keys.
