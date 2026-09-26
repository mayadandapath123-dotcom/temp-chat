# TempChat v12 — joining without a checkbox

Base: GitHub main `0fdfd72d`.

## Tests

- **69 automated tests passed.** The optional localhost PostgreSQL integration test was skipped in this patch run; no Neon credentials were used.
- Added checks for a visible retention notice with no checkbox, direct join using the new automatic notice marker, safe reload errors for outdated clients and backward compatibility with acknowledged v11 clients.
- Existing archive codec/auth, admin controls, notifications, refresh, room/receipt/reply, media and link tests passed.
- `lib/chat-archive.js`, `lib/archive-codec.js` and `lib/archive-routes.js` are byte-for-byte unchanged from the working archive release. This patch does not migrate or rewrite stored data.

The installer passed a separate-HOME dry-run without committing or pushing. Syntax/shell checks, `git diff --check` and dependency audit passed (zero known dependency vulnerabilities reported).

## Browser flow

Chromium in a mobile-size/touch viewport, with archive policy enabled but a deliberately unreachable localhost test database. No real database/account is contacted, and no messages are sent for retention in this test.

Passed:
- No checkbox inputs or acknowledgement label in the joining screen.
- Seven-day retention/Reset notice remains visible.
- One-step join succeeds without checking anything.
- Reconnection automatically sends the notice marker and returns to the room.
- Settings-only theme placement remains.
- No horizontal page overflow or uncaught browser JavaScript errors.

## After deployment

1. Reopen TempChat to load v12.
2. Confirm the checkbox is absent, but the short retention notice remains.
3. Join a room normally and send a test message.
4. Verify the admin archive still receives it and the expiry workflow remains healthy.
5. Do not change the database URL or encryption/admin keys for this update.
