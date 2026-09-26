# Test report — header room identity, quiet quick delete, tabbed manual, no ban duration

## Automated tests: 79 passed
`npm test` (Node built-in runner). Updated expectations: removal messages and the blocked-rejoin error contain no duration; everything else unchanged (rooms, approval, quick-delete timing, receipts, calls, camera, admin, notifications, retired-archive cleanup).

## Browser check (Playwright, headless Chromium): passed
Phone (390×780) creates a named quick-delete room; two desktops join:
- Room identity (name over code, ⏱ flag) sits inside the header on phone and desktop, vertically in line with the call/video buttons; header does not overflow; the code is never truncated.
- Reader's copy shows a silent shrinking line (`.tc-qd-bar`, no text) and disappears; a hidden tab keeps it; the sender's faint line starts running only after everyone has seen it; zero timer pills exist.
- Reset shows "Bravo cleared the chat for everyone." on every screen.
- Removal flow with 3 members: vote popup, room notice, the removed person's screen and the blocked-rejoin attempt contain no "hour"; the removed browser (same device id) cannot rejoin.
- Manual: 4 tabs, one visible at a time; Privacy & safety is the only place that mentions the one-hour block; dead pamphlet link gone.
- Private room: a second tab on an approved device still waits for approval; approver not re-prompted; requester sees "1 of 2 approved".
- No page errors.

Screenshots: `qd-countdown-mobile.png`, `qd-countdown-desktop.png`, `qd-manual-tabs.png`, `qd-manual-mobile.png`, `qd-mobile-cleared.png`, `qd-private-approval.png`.
