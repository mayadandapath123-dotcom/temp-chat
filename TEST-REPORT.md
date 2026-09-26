# Rooms / private approval / member removal / temporary history — test report

Base: GitHub main `1b10f5551`.

## Automated tests: 73 passed
New coverage (tests/room-lifecycle.test.js, tests/temporary-mode.test.js, updated admin tests):
- Named public room creation; late joiner receives prior text history and room identity.
- Private room: code-based join requires unanimous approval; denial cancels; unanimous approval admits; invite token bypasses approval.
- Removal vote requires 3+ members; two-member room is refused; unanimous approval evicts the target and bans its device; a different device can still join.
- Reset clears history; the room closes and becomes a fresh public room after the last member leaves.
- Join page has no archive notice/checkbox/disclosure; retired archive admin assets/routes are gone; admin console assets still serve.
- Existing room/receipt/reply/media/camera/notification/admin tests still pass.

The `pg` dependency remains only for the retired-archive expiry cleanup module. Normal tests run with archive database values empty.

## Browser smoke test
Chromium (mobile + desktop viewports):
- Named room + always-visible room code in the header.
- Late joiner sees earlier messages (history replay).
- Three members → Remove buttons appear in the members list.
- Private room: invite link joins directly; code-based stranger shows a waiting banner and members get an approval prompt; approving from all members admits them.
- Manual contains the new feature explanation; the join screen does not advertise it.
- No uncaught page JavaScript errors.

## After deployment
1. Close/reopen tabs to load the new scripts.
2. Create a named public room and confirm the name + code show on mobile.
3. Join a second device and confirm it sees earlier messages.
4. Create a private room; share its invite link; confirm a code-based joiner needs approval.
5. With 3+ members, request a removal with a reason, approve from everyone, and confirm the person is removed and blocked on their device.
6. Reset and confirm history clears; have everyone leave and confirm the room is fresh.
7. Keep the old archive cleanup job until it reports remaining: 0, then remove old archive settings.

No production deploy or real Neon deletion was performed here.
