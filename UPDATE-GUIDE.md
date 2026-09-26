# TempChat — quick delete, private-room fix, named clears, visible room bar

Base: GitHub main **672a0a9b15d46c85d6446eb662cf5c8bb10ceb3d** (the rooms release).

## What changed

### 1. Who cleared the chat
- Reset now posts **"Name cleared the chat for everyone."** in the chat (and in the toast) for every member. Admin clears keep their existing admin notice.

### 2. Quick delete (new-room option, creator's choice)
- In **⚙️ New-room options** there is a third setting: **Quick delete — Off / On**. Like the name and Public/Private, it is fixed when the room is created and stays until the room closes, even if that person leaves. Nobody is labelled as the creator anywhere.
- **Per person:** someone else's message disappears from *your* screen about **10 seconds after it was actually shown to you** (page open and focused). Long texts get more time (about 15 characters per second, up to 90 s); regular photos 15 s; voice notes 45 s or their length + 10 s, whichever is longer.
- **Your own message** disappears once **everyone present has seen it**, then the same countdown. A member who leaves no longer holds it up. A late joiner who receives it from history must also see it first.
- The message is removed from the temporary late-join history at that moment. View-once photos already vanish on their own; calls are never stored.
- A small **⏱** pill on each message shows the countdown; the room bar shows ⏱ while quick delete is on; a one-line notice appears in the chat when you join such a room. Nothing about this is written on the join screen beyond the option itself; details live in the user manual.
- Limits: a message that was never shown (tab in background, phone locked) stays until it is; screenshots and other people's devices are outside the website's control.

### 3. Private room loophole closed
- Previously any extra tab/window on a device that already had a member inside was let in without approval (a reconnect shortcut). That shortcut is gone: **every code-based join needs approval by everyone present**, no matter which device.
- Members reconnecting after a network blip still get back in automatically because their page keeps the room's own invite key and sends it on reconnect.
- Also fixed: if the only member who had not yet voted leaves, the join (or removal) request now completes instead of expiring; approvers are no longer re-prompted after voting; the person waiting sees "x of y approved"; removals/kicks now tell the room bookkeeping that the member left.

### 4. Room name and code always visible
- A **room bar** sits under the header on phones and desktops: room name (if any), the code in large monospace, 🔒 for private and ⏱ for quick delete. Tap it to open the share options. The old tiny pill that was hidden on phones is gone.

## Install and deploy
Save **TempChat-QuickDelete.zip** to Downloads, then:

```bash
cd ~/Downloads &&
unzip -o TempChat-QuickDelete.zip -d "$HOME/Downloads" &&
bash "$HOME/Downloads/temp-chat-quickdelete/deploy-existing.sh"
```

The installer uses `~/Documents/Projects/temp-chat`, verifies repo/base/clean tree, backs up your source, copies release files and runs the tests. Type **DEPLOY** to commit and push. It never force-pushes, deletes secret files or databases, or touches the typing website.

No new environment variables. Keep `ADMIN_KEY`; keep `ARCHIVE_DATABASE_URL` + `ARCHIVE_CLEANUP_TOKEN` + the hourly cleanup workflow until the cleanup reports `remaining: 0`.

## After Render shows Live
Close and reopen old TempChat tabs/app windows, then check:
1. Create a room with Quick delete **On** on one phone; the bar shows name, code and ⏱; the join notice appears once.
2. Second device: read a message → it counts down and vanishes there; the sender's copy waits until every present member has seen it.
3. Reset → "Name cleared the chat for everyone."
4. Private room: a second tab on an approved phone must still be approved by everyone; the approver gets no second popup.
