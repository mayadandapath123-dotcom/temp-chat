# TempChat v9 — admin panel test report

Base: GitHub main `7ebbce1e` (joined-session notifications).

## Automated checks: 58 tests passed

Fourteen admin-specific tests cover:
- No unauthenticated room data or moderation access; no key echo in responses.
- Key validation, HttpOnly/SameSite cookie issuance, cross-origin rejection and CSRF checks.
- HTTPS-proxy Secure/host-only cookie behavior.
- Live session metrics and counters without chat bodies or a user-IP/location directory.
- Cookie-authorized, publicly announced Admin entry, server-only role badges and guest reserved-name labeling.
- Entry locks that preserve existing connections and allow verified Admin entry.
- Scoped session removal without clearing other users' chat.
- Typed room confirmation and fresh-room-instance checks.
- Scoped clear/end-call/close-and-lock behavior.
- Logout revocation and forced exit of that login's admin room sessions.
- Admin page CSP, frame protection and no-store headers.
- Failed-login rate limiting.
- Session expiry and one-hour lock expiry with a controlled test clock.
- Missing key leaves admin login disabled.

The existing 44 tests for joined-page notifications (including no post-Exit/closed-page alerts), room isolation, receipts, replies, safe links, themes, camera switching and zoom also passed.

The safe deployment installer passed a separate-HOME dry-run: correct repository cloned, private source backup created, explicit release files applied and all tests passed, without committing or pushing. Syntax/shell checks and `git diff --check` passed. Dependency audit reported zero known vulnerabilities at packaging.

## Browser checks

Chromium desktop (1512×1080) and a mobile-size (390×844) viewport:
- Login, key input clearing, absence of key in localStorage and HttpOnly cookie invisibility to page JavaScript.
- Live dashboard, room selection, member data, responsive layout without horizontal page overflow.
- Enter as Admin opens the normal chat with explicit join, server-verified name, visible announcement and badge.
- Admin receives no earlier message replay; subsequent admin messages are visibly badged.
- Remove sends the affected user to a fresh join page with the reason.
- Locked room rejects new guest entry in the real chat UI.
- Destructive action rejects wrong confirmation, then clears the intended room on correct confirmation.
- Logout ends that login's admin room visit without logging out an independent owner session.
- No uncaught page JavaScript errors in the completed admin smoke run.

The v8 joined-room notification browser regression was also rerun against this server: foreground suppression, live background alerts, disconnect/reconnect, Exit/close prevention and legacy Push ignoring still passed. Platform notification display is simulated in that regression; no physical-phone delivery guarantee is made.

## Test after deployment

1. Without logging in, opening `/admin` should show only the login page; `/api/admin/snapshot` should reject access.
2. Generate/store your key privately, set ADMIN_KEY on TempChat, deploy, and sign in.
3. Join a test room on two devices; inspect their separate sessions and active/away times. Treat presence as approximate.
4. Enter that room as Admin. Both devices should see the announcement/banner and verified badges. Earlier messages must not appear as recovered history.
5. On test sessions only, try remove, entry lock/unlock, clear, end-call and close-and-lock. Check unaffected rooms stay intact.
6. Log out; the admin room visit should end and API access should require login again.
7. Verify normal replies, camera flip/zoom, themes, Exit and joined-room notifications remain working.

No production deployment or real private admin key was created from this workspace. Automated checks are not a complete independent security audit. Protect the owner key and review the documented ephemeral-state and anonymous-session limitations.
