# TempChat — Graphite look, White glass, photo download, share with sound, call quality, pin for everyone, speaker switch, zoom fix

Base: GitHub main **c7c06c7a798453d7954fa88571700877eef30d13** (the call-screen release).

## What changed

### 1. A cleaner default look
The gold tone is gone from the default. **Graphite** — cool neutral surfaces with a calm blue accent — is now the default on the join screen and in every new room. *Midnight gold* is still available in Shared themes for anyone who wants it.

### 2. White glass theme
Alongside Liquid glass: **White glass** — bright frosted panels, dark text, soft pastel light behind. Pick it in Settings → Shared themes & wallpaper; it applies to everyone in the room like all themes.

### 3. Download photos
Regular photos now carry a **⤓** button (on the photo and in the full-screen view) that saves the picture to the device. Rules exactly as asked: available in **public rooms** and in private rooms **without** quick delete; a **private room with quick delete on hides it**. View-once photos can never be downloaded.

### 4. Share with sound (phone and laptop)
The phone share flow is unchanged. What is new: a **shared video now plays with its sound** for everyone (you hear it too), and on a laptop **screen share carries the tab/system sound** when you tick “Share audio” in the browser’s picker. The sound is mixed into your voice stream; your mic still follows the mute button. Bandwidth note: sound is sent continuously while sharing.

### 5. Call quality — Auto by crowd size, or your choice
- **Auto** (default): the picture size shrinks as people join — 2 people ≈ today’s quality, 3–4 smaller, 5–6 smaller again, 7–8 smallest — to protect bandwidth.
- Or choose **144p · 240p · 360p · 480p · 720p** in the call’s ⚙ Settings (a quality pill in the call header opens it). The **whole call runs at the lowest choice** anyone made, so your pick sets both what you send and what you receive; the status line names who is limiting it.

### 6. Tiles: pin for everyone, maximize, fit/fill
Every tile has a **⋯** menu: *Maximize for me* (your screen only), *Pin … for everyone* (that person becomes large on every screen until unpinned; late joiners get it too), and *Fit / Fill*.

### 7. Speaker or earpiece (voice and video calls)
On Android phones a speaker button in the call switches **your own** listening between loudspeaker and earpiece. iPhone browsers do not expose this switch (the button is not shown there).

### 8. Bug fix: zoom missing in a second call
After a call ended, the zoom presets were removed together with your tile, so the next call (private room or not) had no zoom. They now come back every call.

## Install and deploy
Save **TempChat-Final.zip** to Downloads, then:

```bash
cd ~/Downloads &&
unzip -o TempChat-Final.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-final/deploy-existing.sh"
```

Type **DEPLOY** when the tests pass. No new environment variables.

## After Render shows Live
Close and reopen old tabs/app windows, then:
1. Join screen and a new room look graphite/blue. Shared themes → White glass.
2. Send a normal photo → ⤓ downloads; a private + quick-delete room shows no ⤓.
3. Phone: Share a video → others hear it. Laptop: Share screen, tick “Share audio”.
4. 3 people in a call → header pill shows the auto quality; pick 144p on one phone → everyone drops; status names that person.
5. ⋯ on a tile → Pin for everyone. Android: speaker ↔ earpiece button.
6. End a call, start another → zoom presets are there.
