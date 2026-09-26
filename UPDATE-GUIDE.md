# TempChat — header room identity, quiet quick delete, tabbed manual, no ban duration

Base: GitHub main **b8a0a7836f32dad150e75771dcaf091369bbe7a6** (the quick-delete release).

## What changed

### 1. Quick delete looks calm now
- The countdown pill with numbers is gone. A message that is on its way out shows only a **thin line under it that quietly runs out**; the sender's copy shows a faint line until everyone present has seen it, then the same line runs. Nothing else on the bubble changed.
- The one-line notice on entering such a room now just says *"Quick delete is on. Messages disappear shortly after they have been seen."* Details stay in the manual.

### 2. Room name and code in the top bar
- The separate strip under the header is gone. The room name (if any) sits over the code **in the header itself**, right after the ✦ logo and in line with the call / video buttons — on phones and desktops. 🔒 marks private, ⏱ marks quick delete. Tap it to share.
- The name truncates first; the code always stays readable. On very narrow phones the "online" word in the member pill hides (the dot + count remain) so nothing overlaps.

### 3. No duration mentioned anywhere in the app
- Vote popup: *"…Once approved, they are removed and cannot rejoin this room."*
- Room notice: *"Name was removed from the room by member vote."*
- Removed person: *"The members of this room removed you."* / on retry: *"You were removed from this room by its members and cannot rejoin."*
- The block still lifts after one hour behind the scenes; **only the manual** (Privacy & safety tab) says so.

### 4. User manual organised into tabs
- **Rooms · Messages & media · Calls · Privacy & safety** — one page at a time instead of one long list. Every built-in and feature section is sorted automatically, including future ones. The dead "Open Full Pamphlet Page" link (it only reopened the app) is removed.
- The rooms text is split into four short entries: room name / public-private, quick delete, late joiners and Reset, removing a member.

## Install and deploy
Save **TempChat-Polish.zip** to Downloads, then:

```bash
cd ~/Downloads &&
unzip -o TempChat-Polish.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-polish/deploy-existing.sh"
```

Type **DEPLOY** when the tests pass. No new environment variables; nothing else to configure.

## After Render shows Live
Close and reopen old TempChat tabs/app windows, then check on a phone and a PC:
1. Header shows the room name over the code next to the call buttons; nothing overflows.
2. Quick-delete room: a read message shows a thin shrinking line and then disappears; no numbers anywhere.
3. Members → Remove → approve: none of the messages mention an hour; the removed browser cannot rejoin.
4. 📖 Manual opens on tabs; Privacy & safety explains the block.
