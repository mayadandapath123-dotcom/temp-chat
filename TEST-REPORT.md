# Test report — call screen redesign, phone sharing, smooth zoom, theme studio, calmer join

## Automated tests: 82 passed
`npm test` (Node built-in runner): all previous suites plus `tests/call-theme.test.js`:
- Sharing flag relayed to viewers and to people joining the call later; cleared on stop.
- Themes: unknown palette rejected; `custom` without valid hex colours rejected; valid photo colours broadcast (lower-cased) and sent to late joiners; Liquid glass accepted with `colors: null`.
- Private room: cancelling a pending request closes the members’ prompt; a stale approval admits nobody; a fresh request gets a new id.
- Zoom module: all 8 existing contracts still hold (instant in Node, animated only in browsers).

## Browser checks (Playwright, headless Chromium with fake camera/mic): passed
`call-browser-test.js` — phone (390×780, Android UA) + two desktops in a 3-person video call:
- Every tile fully visible above the dock on phone and desktop; dock is one row in the fixed order; header shows Exit / mic status; zoom presets on the self tile.
- Zoom 1×→3× passes through intermediate values and lands on 3×; pressed state immediate.
- Maximize: one large tile plus visible thumbnails; Escape restores.
- Phone Share opens the photo/video picker; the picked image streams; viewer tile gets `is-sharing`, letterboxing and a badge; stopping clears it. Desktop `getDisplayMedia` share still starts.
- Manual covers phone sharing, smooth zoom, photo colours, Liquid glass. No page errors.

`theme-shots.js` — phone opens Theme studio: portrait device preview, crop tool (drag/slider), “Colours from photo” yields two distinct colours, apply → both members switch to `custom` with the cropped wallpaper; Liquid glass applies. No page errors.

`join-shots.js` — simplified join card on phone and desktop; private-room waiting card with progress; Cancel restores the form and closes the member’s dialog. No page errors.

`quick-delete-browser-test.js` (previous release regression) — still passing.

Screenshots: `call-mobile-3.png`, `call-desktop-3.png`, `call-desktop-pinned.png`, `call-desktop-phone-share.png`, `call-mobile-sharing.png`, `theme-2-crop.png`, `theme-3-colours.png`, `theme-4-applied-mobile.png`, `theme-5-liquid-desktop.png`, `join-mobile.png`, `waiting-mobile.png`.

## Not covered automatically
Real phone cameras (portrait streams, native lens zoom ramps), iOS Safari media picking, Render cold starts. Test on your devices after deploy.
