# Test report — Graphite look, White glass, photo download, share audio, call quality, pin for everyone, speaker switch, zoom fix

## Automated tests: 84 passed
`npm test`: all previous suites plus two new cases in `tests/call-theme.test.js`:
- Call quality: 2 people → Auto 400; a 426 cap does not raise above Auto; a 256 cap lowers everyone and names the limiter; junk values ignored; 3 people → Auto 320; leaving recomputes.
- Pin for everyone: reaches all participants and late joiners with the pinner’s name; unknown ids ignored; cleared when the pinned person leaves.
- Room-features suite updated for the Graphite default on reset.

## Browser checks (Playwright, headless Chromium, fake camera/mic): passed
`batch-browser-test.js` — phone (Android UA) + two desktops:
- Default accent is the Graphite blue; White glass applies to every member with dark readable text.
- Download: one ⤓ on the regular photo, none on view-once; full-screen Download produces `tempchat-photo-….jpg`; a private + quick-delete room hides all download buttons.
- Call: 3 people → `__activeVideoMaxDim` 320 (Auto) and the header pill reads 240p; choosing 144p on one desktop drops every sender to 256 and the status reads “144p · limited by Bravo”.
- Phone shows the speaker/earpiece button; desktop does not.
- Tile ⋯ menu → Pin for everyone: all three screens pin Charlie; Unpin clears everywhere.
- Desktop screen share starts and reports its sound mixed into the voice stream (`__tcShareAudioOn`).
- Zoom presets are present in a second call on both phone and desktop (the reported bug).
- Manual covers sound sharing, call quality, pin for everyone, earpiece, downloads. No page errors.

Regression scripts from earlier releases (`call-browser-test.js`, `quick-delete-browser-test.js`, `theme-shots.js`, `join-shots.js`) still pass.

Screenshots: `batch-graphite-mobile.png`, `join-graphite-d.png`, `batch-whiteglass-mobile.png`, `batch-whiteglass-desktop.png`, `batch-quality-settings.png`, `batch-spotlight-mobile.png`.

## Not covered automatically
Real Android earpiece routing (needs a physical phone), iOS media playback with sound, real screen-share audio permission dialogs.
