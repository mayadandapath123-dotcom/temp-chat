# TempChat — call screen redesign, phone sharing, smooth zoom, theme studio, calmer join

Base: GitHub main **a200690eb76eece32e2ccad6d6422891ab5ad0fb** (the header/quick-delete/manual polish release).

## What changed

### 1. Video call screen (phones and laptops)
- **Everyone fits.** Tiles are sized by a small layout engine: 3 people on a phone = two on top, one centred below; 4 = 2×2; more = more rows. Nothing hides behind the bottom bar any more, in portrait or landscape.
- **One calm bottom bar**, always a single row: Mic · Camera · Flip · Share · Chat · Settings · End. Every button is still there; only the arrangement changed.
- **Compact top bar**: room + mic status on the left, timer / fullscreen / Exit / Refresh on the right (icon-only Refresh on phones).
- **Zoom presets sit on your own tile** like a camera app (a vertical strip when the tile is narrow).
- **Maximize** now shows the big person plus small thumbnails of everyone else (before, the others disappeared).
- Camera tiles fill their box; shared screens / photos are letterboxed with a “Sharing” badge, never cropped. Speaking is a thin accent ring instead of a thick green frame.

### 2. Share from a phone
Phone and tablet browsers (Android Chrome, iPhone, iPad) are **not allowed to capture the screen** — there is no browser API for it, so no website can offer true screen share there. TempChat now does the closest possible thing: on those devices the **Share** button lets you pick a **photo or video from the phone** (a screenshot or a screen recording you just made) and streams it to the call as your picture. Videos share without sound. Laptops keep real screen sharing. Manual explains this honestly.

### 3. Buttery-smooth zoom
1× → 2× → 3× → 10× now glides (about 0.4 s, eased, log-scaled) instead of jumping — for your preview, the frames sent to others, and the device lens where the camera supports zoom. Taps during a glide are queued, never ignored; the pressed state responds instantly.

### 4. Theme studio (Settings → Shared themes & wallpaper)
- **True preview**: a small phone (or laptop) chat mock with the same wallpaper rules as the real room. Toggle Phone / Laptop.
- **Crop tool**: drag, pinch, wheel or slider; choose a phone or laptop frame. The saved wallpaper is exactly the framed area (≤ 220 KB, ≤ 1280 px).
- **✨ Colours from photo**: two main colours are read from the photo on your device (nothing uploaded); a full theme is built from them and shared with the room. Only the two colours travel to the server.
- **Liquid glass** theme: translucent blurred surfaces over soft colour.
- All of it stays room-shared and temporary, as before.

### 5. Simpler first screen
Short description, clear labels (“Your name”, “Room code — make one up, or type a friend’s”), one line of small links, options for a new room folded away. No feature list to scare anyone.

### 6. Private-room waiting screen
A proper card state: spinner, “Waiting for approval”, “x of y approved”, and a **Cancel request** button (members’ prompt closes). The misleading “Joined Room” toast no longer appears while waiting.

## Install and deploy
Save **TempChat-Calls.zip** to Downloads, then:

```bash
cd ~/Downloads &&
unzip -o TempChat-Calls.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-calls/deploy-existing.sh"
```

Type **DEPLOY** when the tests pass. No new environment variables.

## After Render shows Live
Close and reopen every old TempChat tab/app window, then check on a phone and a laptop:
1. 3-person video call: all three visible on the phone; one-row bar; maximize shows thumbnails.
2. Phone: Share → pick a screenshot → laptop sees it letterboxed with “Sharing”. Laptop: Share → real screen share.
3. Zoom 1× → 3× glides.
4. Settings → Shared themes: add a photo, crop, “Colours from photo”, apply; try Liquid glass.
5. Open the site fresh: simpler join card. Private room: waiting card with Cancel.
