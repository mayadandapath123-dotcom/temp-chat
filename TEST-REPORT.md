# Test report — quick delete, private-room fix, named clears, room bar

## Automated tests: 79 passed
`npm test` (Node built-in runner) — all previous suites plus `tests/quick-delete.test.js`:
- Same-device second tab in a private room still needs approval from everyone present; a member reconnecting with its own room key is admitted silently; the requester sees "x of y approved"; no creator/owner/host field exists in room info.
- A pending join completes when the only member who had not voted leaves; the room stays private after earlier members leave.
- Quick delete is a creation-time flag: later joiners cannot switch it off; it survives the creator leaving; public rooms send `expireAfter: null`.
- Sender copy/history entry expire only after every present member (including a late joiner who got it from history) has reported it seen; time scales with length (base for short text, 9× base for the longest); a recipient leaving stops blocking the countdown; expired entries disappear from late-join history.
- Regular photos and voice notes are covered, view-once photos are not; Reset names the person and cancels pending expiries.
- A removal vote completes when the last non-voter leaves; the removed device is blocked for one hour.

## Browser check (Playwright, headless Chromium): passed
Phone (390×780) creates a named quick-delete room, two desktops join:
- Room bar visible on phone and desktop with name, code and ⏱; no creator label anywhere.
- Focused reader's copy counts down (⏱ 3s…) and vanishes; a hidden tab keeps it; the sender's copy waits ("⏱ after everyone sees it") and vanishes only after the hidden tab comes back and sees it.
- Reset shows "Bravo cleared the chat for everyone." on every screen.
- Private room: a second tab on an approved device waits for approval; the approver is not re-prompted; requester sees "1 of 2 approved"; 🔒 shown in the bar.
- Manual documents everything; the join screen only has the option itself; zero page errors.

Screenshots: `qd-mobile-room-bar.png`, `qd-desktop-room-bar.png`, `qd-countdown-desktop.png`, `qd-mobile-cleared.png`, `qd-private-approval.png`.

## Not covered automatically
Real phones (notification permission, screen lock), long calls, and Render cold starts. Test on your devices after deploy.
