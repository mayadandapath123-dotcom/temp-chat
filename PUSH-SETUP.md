# Server Web Push was removed — no key setup needed

This file replaces the previous v7 setup instructions. **Do not generate or add VAPID keys for this version.**

## New behavior

Notifications are created only by a running TempChat page that is:
- joined to a room;
- connected to the room server;
- allowed to show notifications; and
- in a background tab/app (except when you deliberately send a test notification).

The service worker asks the actual page to verify its session before showing an alert. A closed, exited, disconnected or unresponsive page cannot authorize a new notification. The worker does not open a new room when an old notification is clicked after that session ends.

**No server Web Push, offline delivery, durable notification registry or 24-hour subscription remains.** This is intentionally different from v7.

## After deploying

1. Close all older TempChat tabs and Home Screen app windows on each device.
2. Reopen **https://temp-chat-5yum.onrender.com/** using the new version.
3. The update tries to unsubscribe the old browser Push subscription, clears the old local subscription-permission database and closes old application notifications. The new server never loads the old registry or sends provider push requests.
4. Join a room, open **⋯ → Joined-room notifications**, and switch notifications on. If the browser already granted permission, it may not ask again.
5. Switch to another tab/app without pressing Exit or closing TempChat, then send a message from another device.
6. Press Exit or close the TempChat page and send another message: no new session alerts should be created.

The remembered setting is only a notification preference—not persistent room membership. A later explicit join can use that preference again. Merely opening the join screen cannot produce room alerts.

## Old keys and storage

Your existing Render `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `PUSH_STORE_PATH` variables are ignored. You may remove them from **TempChat's service only**. Do not change the typing website's settings.

The old private `push-keys.env` file is not needed, but this update does not delete it automatically. Keep it private or remove it yourself when you are sure nothing else uses it. The key-generator command now only explains that it has been retired; it does not generate or overwrite keys.

If you configured an optional persistent subscription file, this version never reads or writes it. You can securely delete that dedicated subscription file when no longer needed. Do not delete unrelated databases/disks or change paid storage without checking what else uses it.

## Limitations

- If the phone fully suspends or kills the browser, the page may stop receiving messages or replying to the worker's session check; alerts then stop. That is the intended trade-off for **no closed-page alerts**.
- Browser/site permission, OS notification settings, Do Not Disturb and battery restrictions still apply. This release does not call `PushManager.subscribe`, so the old push-service-registration error is no longer part of its notification setup.
- Previously delivered notifications can remain in OS history; the website cannot guarantee erasing phone history. The update tries to close notifications it controls.
- Another tab that is still joined can receive alerts for its own session. Exit/close every joined tab if you want no room alerts at all, or turn notifications off in settings.
- An old TempChat deployment on another domain is a separate site. If alerts continue from an old address, disable its notification permission or retire that old service. Updating `temp-chat-5yum.onrender.com` does not change another origin's browser permissions.

No background push keys or extra Render setup are required for this mode.
