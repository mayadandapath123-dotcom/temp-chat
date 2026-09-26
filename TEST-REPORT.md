# TempChat v11 — archive test report

Base: GitHub main `22c73218`.

## Automated testing

**67 tests passed with a local PostgreSQL 17 test database configured.** The normal offline/deployment test run passes 66 and skips the one explicitly opted-in PostgreSQL integration test. Existing child test servers forcibly disable archive database environment values to avoid accidentally writing fixtures to a real Neon database.

New checks include:
- Compression/encryption round trip; no plaintext chat body in the ciphertext.
- Wrong keys, modified ciphertext and authenticated-metadata substitution rejected.
- View-once photos/call streams excluded; normal media types and size limits enforced.
- Admin archive routes reject unauthenticated access; deletion rejects invalid CSRF/confirmation.
- Real PostgreSQL schema initialization, encrypted binary rows, lazy metadata/media reader, persisted data readable by a restarted archive instance.
- Wrong-key/database-isolation safeguards.
- Manual deletion including pending buffered messages.
- Expired records excluded from reading/media and physically deleted by cleanup.
- A database containing unrelated public typing tables is refused without deleting those tables.

The previous room/auth/moderation, reply/receipt, notification, refresh, camera/zoom and link tests also passed. Database tests used a localhost-only throwaway test database—not the user's Neon project.

The safe installer also passed a separate-HOME dry-run, including an explicit release-file copy and the ordinary 66-pass/one-optional-skip test run, without committing or pushing. JavaScript/shell syntax, `git diff --check`, and dependency audit passed; zero known dependency vulnerabilities were reported at packaging.

## Browser test with real local PostgreSQL

Chromium mobile-size and desktop contexts exercised the actual Node server and SQL archive. Only connection provisioning was injected to use the local disposable database; production encryption, compression, admin APIs, live chat and viewer code ran normally.

Passed:
- Explicit retention acknowledgement required before joining an enabled archive room.
- Text and reply retention; normal photo and valid WAV voice-note data saved.
- View-once photo/caption not retained.
- Unauthenticated archive list access returns 401.
- Admin session list and chat-like archive viewer load.
- Media is absent from initial message responses and loads only on request into image/audio elements.
- Reset clears live chat while retained archive count stays unchanged.
- Manual admin deletion removes retained content.
- Authenticated cleanup endpoint works; missing token is rejected.
- No mobile page-width overflow or uncaught JavaScript page errors in the completed run.

No actual Neon account/database, Render environment or GitHub Actions secrets were provisioned by these tests. Neon TLS/pooling and the scheduled job must be validated after the owner configures them. These tests do not prove a particular compression ratio, unlimited storage, complete retention under failure, or instant erasure of provider backups.

## Owner acceptance checklist

1. Create the separate empty Neon project and configure the three archive environment values without changing ADMIN_KEY or the typing website.
2. Verify `/admin` archive status is ready; inspect errors rather than assuming capture is working.
3. Enable the GitHub cleanup job with only its URL/token secrets and run it manually. Monitor failures and Last cleanup time.
4. Join a new test room on two devices, acknowledge retention, send text/reply/normal photo/voice note, wait a few seconds and load its archive.
5. Send a view-once photo. It must not appear in retained history; call audio/video must not be recorded.
6. Reset the live room. Confirm the disclosed behavior: live messages clear, archives remain.
7. Delete that archived session as admin. Verify old stored content is gone; later new messages may be archived again.
8. Recheck ordinary refresh/reconnect, Settings-only themes, Exit, camera flip/zoom and joined-page notifications.
9. Monitor both Neon storage/compute/egress and Render bandwidth. The in-app 300 MiB payload cap leaves headroom but is not the provider's exact billing meter.

See NEON-ARCHIVE-SETUP.md for retention timing, backup limitations, the four-MiB per-media limit, and secret backup/rotation requirements.
