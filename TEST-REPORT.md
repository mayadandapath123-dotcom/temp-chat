# Camera fix v5.1 — test report

Base: GitHub main `9ea76daa` (previous receipts/themes release).

## Automated tests: 14 passed

Camera/helper regression tests:
1. Old camera released before next camera request; strict facing; audio never requested.
2. Explicit device-ID fallback when strict facing is unsupported.
3. Silent return of the old/wrong camera rejected and unwanted track stopped.
4. One-camera device restores its previous camera after a failed flip.
5. A track returned after cancellation is stopped rather than leaked.
6. Initial opening accepts a single camera and records actual facing.
7. Already-cancelled operations do not request hardware.
8. Permission denial does not pretend a flip succeeded.
9. Screenshot-permission UI/event handlers removed from source.

Existing Socket.IO integration tests retained and passed:
10. Group receipt snapshots, duplicate usernames, late-join exclusion, room isolation.
11. Photo/voice-note IDs and receipts.
12. Shared wallpapers, validation, throttle, late join, palette-only bandwidth behavior and cleanup.
13. Reset clears receipt and appearance state.
14. Presence, typing and active-participant-only call audio relay.

JavaScript syntax, deployment shell syntax and `git diff --check` passed. A separate-HOME installer dry-run cloned the latest repo, made a backup, applied files and passed all 14 tests without committing or pushing.

## Browser testing

Chromium with a mobile-size viewport and **simulated front/rear cameras** (canvas-backed MediaStream tracks). The test deliberately rejects a second camera while the old one is active to reproduce a common phone camera constraint. A fake microphone provides a real browser MediaStream audio track.

Passed:
- Photo camera opens, flips both ways and captures an image.
- Closing during delayed acquisition stops the late camera stream.
- Video-call camera flips both ways without replacing/stopping/unmuting the microphone.
- Device-ID fallback switches when facingMode is rejected.
- Rapid repeated Flip events do not start overlapping switches.
- Flip during screen sharing makes no camera request.
- Leaving during delayed switching stops the eventual camera track.
- A one-camera device restores its only camera and correct facing.
- Screenshot permission button/menu absent; themes still apply.
- No uncaught browser JavaScript errors during the smoke run.

These are simulations, **not verification on your particular phone**. Actual Android/iPhone hardware, browser versions, camera permissions, and another app holding the camera can still affect behavior. No deployment or authenticated GitHub push has been performed here.

## Real-device checklist after deployment

1. Close/reopen the page to load v5.1. Use HTTPS; allow microphone/camera access.
2. Open the photo camera. Flip rear → front → rear, then take/send a photo. Verify the actual view changes, not just its mirror.
3. Start a video call with a friend. Flip both ways. Ask the friend to confirm their incoming video changes too.
4. Mute the microphone and flip again. It must stay muted. Unmute and verify audio still works.
5. Tap Flip rapidly. It should finish one switch without freezing.
6. Leave a call while switching, or close the photo camera while it opens. Check the phone's camera indicator turns off once the pending request completes.
7. On a single-camera computer, Flip should fail gracefully and restore the current camera, not claim a nonexistent back camera.
8. Confirm no screenshot-permission controls/popups remain. Test a text receipt and shared theme to confirm those features remain.

If a real phone still cannot switch, report the phone model, browser, whether it is the call/photo flip button, and the exact toast/error. Keep video tests short to avoid excessive Render bandwidth.
