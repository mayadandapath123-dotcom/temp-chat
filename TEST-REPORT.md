# TempChat v8 — joined-page notification fix

Base: GitHub main `3a66de09`.

## Automated tests: 44 passed

Includes all retained room, receipt, reply, theme, safe URL, Exit, camera and zoom checks, plus:

- Joined/connected background pages can notify; foreground pages suppress ordinary alerts.
- Explicit test notification is allowed only from a valid joined session.
- Exited, disconnected, disabled, wrong-room or wrong-generation requests cannot notify.
- A closed or unresponsive/suspended page cannot authorize a queued notification.
- Exit closes shown notifications and rejects its queued old generation.
- A delayed OS show completion that races with Exit is closed.
- A new real join can notify after the old session ends.
- Old alert clicks only focus a still-joined original page, never reopen an exited/closed room.
- All legacy remote Web Push payloads are ignored.
- Provider push stays disabled even when old keys/storage variables are supplied.
- Old clients cannot create subscriptions or trigger push tests; the `web-push` dependency is absent.

Unit tests simulate platform notification APIs; they do not prove a physical phone displayed an alert.

The installer also passed a separate-HOME dry-run: it cloned the verified base, backed up the source, copied the explicit release files and passed all tests without committing or pushing. Syntax/shell checks and `git diff --check` passed; dependency audit reported zero known vulnerabilities.

## Browser smoke test

Chromium with a 390×844 touch viewport and a separate sender context. Only the browser permission result and OS notification tray API were mocked; the app, Socket.IO server, real service worker and live-page MessageChannel verification ran normally.

Passed:
- One user permission request when enabling alerts.
- Legacy browser Push unsubscribe attempted; `PushManager.subscribe` never called.
- Explicit test shows through the live worker/page handshake.
- Foreground new message does not create a system alert.
- A still-joined background page creates a sender-name/text alert.
- Disconnect pauses alerts; an actual room reconnection can resume them.
- Exit returns to Join, preserves the other participant, closes that session's alerts, and prevents fresh alerts after leaving.
- Closing the page prevents an explicitly queued old-epoch notification request from showing.
- Legacy server Push payloads are ignored.
- No uncaught browser page errors in the completed run.

## Real-device checklist

After deploying, close all older TempChat tabs/windows, reopen the current URL, join the same room on two devices and enable Joined-room notifications:

1. While viewing the chat, new messages appear normally without redundant system alerts.
2. Switch to a different tab/app without exiting the room. Send a message from the other device; an alert should appear if the browser remains running and connected.
3. Press Exit and send another message. There must be no new alert from the exited session.
4. Join again, then close that page/browser. New messages must not create new alerts from that closed session.
5. Turn notifications off and verify no new alerts. Turn them on again while joined and use Send test notification.
6. Try losing network: alerts must pause until the room actually reconnects.
7. Confirm replies, call/camera zoom/flip, links, themes and other members' chat are unaffected.

A fully suspended browser can stop session-only alerts even if its tab remains listed. This is the intentional trade-off for removing closed-page/offline notifications. Browser permissions, DND and OS history remain outside the app's control. A separate still-joined tab or a different old TempChat domain is a separate source of alerts.
