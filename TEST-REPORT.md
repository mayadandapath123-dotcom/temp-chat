# TempChat v6 — test report

Base: latest GitHub main `8e4fd56a` (camera fix release).

## Automated checks

**28 tests passed**, covering:
- Previous camera-flip release/recovery/cancellation behavior and removal of screenshot-permission handlers.
- Group receipts, room isolation, duplicate names, media IDs, late-join behavior, wallpapers, reset, presence/typing and participant-only audio relay.
- Canonical quoted author/text, cross-room and unauthorized quote rejection, bounded excerpts, no view-once media/caption leakage, stale target rejection after reset.
- Native zoom with simulated capabilities, native-range overflow to digital crop, unsupported/ignored/failed native constraints, outgoing crop coordinates, reset/new-track behavior, invalid values and serialized requests.
- Service-worker lifecycle acknowledgement/error handling, exact-originating-tab focus, and safe room-link opening when that tab is gone. Notification worker tests use simulated platform APIs, not a real phone notification tray.

The installer also passed a separate-HOME dry-run: correct repository cloned, source backed up, all release files copied, 28 tests passed, and no commit/push performed. Syntax checks, `git diff --check`, and dependency audit passed (zero known dependency vulnerabilities reported at packaging).

## Browser smoke tests

Chromium sessions included a 390×844 mobile viewport with touch enabled. Camera streams were simulated using real canvas-backed MediaStream tracks plus a fake microphone. Tests passed:
- **Actual touch-event swipe** through Chrome's input protocol selects a reply draft.
- Sending displays a quote on the other participant's page, in normal chat and the call drawer.
- Cancel, jump-to-original/highlight and rejected-draft text recovery work.
- Photo camera digital zoom, flip resetting to 1×, capture, call zoom and microphone preservation.
- Notification blocked-permission guidance and notification controls render correctly.
- Success/error messaging and privacy/off behavior tested with an explicitly mocked permission/worker acknowledgement. The sandbox browser reported Notification.permission as denied even with test permission overrides; actual OS notification display was NOT verified.
- No horizontal page overflow and no uncaught page JavaScript errors in the completed smoke run.

This does not certify actual Android/iPhone hardware, optical zoom, mobile operating-system notifications, or locked/closed-app delivery. Real-device testing remains necessary. No authenticated GitHub push or Render deployment was performed from this workspace.

## Short real-device checklist

1. Reopen the updated HTTPS app on two devices. Send a message from B. Swipe it on A, type a reply, and confirm B sees the correct quote. Test Cancel and tap-to-jump.
2. Reply to a photo/voice tile with text. A view-once quote must contain only its media label, not the picture or hidden caption. A swipe must not open it.
3. Test a text reply inside a video call. Check group Sent/Delivered/Seen counts remain correct.
4. Open photo camera and select 1×, 2×, 3×, 10×. Note whether the label says device or digital zoom. Capture a photo and verify its crop matches the chosen zoom. Flip camera and confirm reset to 1×.
5. During a video call, change zoom and ask the other person to confirm their incoming video changes. Mute and flip/zoom; the mic must stay muted. Keep tests short because video uses Render bandwidth.
6. Open ⋯ → Notification settings & test. Allow permission and send a test. Check the phone's notification shade; a browser-accepted test may still be suppressed by phone settings.
7. Try previews off/on, app-alerts off, and blocked browser permission. In a second room/tab, verify tapping an existing alert targets its originating tab.
8. If using a new Render workspace/address, grant notification permission on that new address and replace old Home Screen shortcuts.
9. Verify themes, camera flipping, photos and reset still work. Screenshot-permission controls must remain absent.

Reminder: no server Web Push is configured. Closed tabs and phone-suspended pages cannot reliably receive new-message alerts. Browser camera APIs do not guarantee optical zoom.
