# One-time setup: real phone Web Push

This version implements Web Push, not merely local notifications from an open webpage. On supported devices it can receive encrypted alert payloads through the browser push service while the page is closed, provided the server retains the subscription and the operating system allows delivery.

Your active site: https://temp-chat-5yum.onrender.com/

## 1. Install/deploy the new release

Use the included `deploy-existing.sh` (see UPDATE-GUIDE.md). It installs the `web-push` dependency and the key generator in your existing project. You must use this new release, not an older ZIP.

## 2. Generate keys ON YOUR LAPTOP, once

```bash
cd ~/Documents/Projects/temp-chat
read -rp "Your real contact email: " PUSH_EMAIL
node scripts/generate-push-keys.js "mailto:$PUSH_EMAIL"
cat push-keys.env
```

This creates `push-keys.env` with restrictive file permissions and three entries:

```text
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your-contact-email
```

**Do not paste the private key here in chat, upload this file, or commit it to Git.** The release's `.gitignore` excludes it. The public key is intentionally public; the private key must remain secret. The contact email is the developer/operator's contact, not a Gmail password or an email-sending credential.

If the script says the file already exists, keep it and read it with `cat push-keys.env`. Do not regenerate working keys for every deployment. Key changes invalidate existing browser subscriptions.

## 3. Put the three values into the TEMPCHAT Render service

Render → your active **TempChat** web service → **Environment** → add:

| Key | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | The generated public-key value |
| `VAPID_PRIVATE_KEY` | The generated private-key value |
| `VAPID_SUBJECT` | The generated `mailto:...` value |

Copy only each value, not the `KEY=` part. Save and redeploy/restart as Render prompts. Do not change the typing website's environment or database. These are not Render API keys and require no third-party paid push account.

Confirm the deployed app is v7 and `/api/push/config` shows `"configured": true`. That endpoint exposes only the public key/configuration status, never the private key. The settings panel also reports missing/invalid setup.

## 4. Enable on each phone

1. Open the new TempChat address and join a room.
2. Open **⋯ → Phone notifications**.
3. Switch **Background notifications ON**.
4. Tap **Allow** on the browser permission prompt.
5. Wait for **Web Push is ON for this room**.
6. Tap **Send background test** and check the phone's notification shade.
7. Put the app in the background or close its page, then have another participant send a message in the same room.

By default, alerts display the sender's name and a text preview. The settings panel explicitly warns that names and text can appear on the lock screen. Untick the preview setting for generic alerts. Photos and voice notes use labels only, never image bytes or view-once photo captions. Long text is truncated to fit the push payload.

### Android

Use a Web Push-capable browser such as Chrome. Allow the site's notifications and the browser's notifications in Android Settings. Battery optimizations, Do Not Disturb, force-stopping the browser, network loss, and device policies can delay or block delivery.

### iPhone/iPad

Requires iOS/iPadOS 16.4+ and the **Home Screen web app**: in Safari, Share → Add to Home Screen, then launch that icon. Join your room and switch notifications on inside the installed app. A normal Safari tab is not a substitute for this flow.

No website can override denied system permissions, DND, or a force-stopped browser. Provider acceptance of a test is not proof that the OS displayed it. Actual delivery must be checked on the device.

## 5. Understand temporary versus durable subscriptions

### Default: no database, memory-only server registry

This works without provisioning paid storage. Registrations last **up to 24 hours** and are renewed when the same session reopens/reconnects. **A server restart, deployment or free-service sleep/restart can lose the registry.** The browser permission/subscription alone is not enough to reconstruct which room to notify: open TempChat and rejoin to register again.

This is a real implementation limitation, not something VAPID keys fix. For restart-resistant delivery, configure a durable registry.

### Optional: persistent disk, single server instance

The code supports a subscription-only JSON registry on an explicitly provisioned persistent disk. Render persistent disks require a compatible paid service—**this release does not upgrade your plan or provision anything paid automatically**.

If you choose that option:
1. Attach a persistent disk to the TempChat service with mount path `/var/data`.
2. Add `PUSH_STORE_PATH=/var/data/tempchat-push-subscriptions.json` in that service's Environment.
3. Save/redeploy.
4. The app settings should report that subscriptions survive restarts. If storage is unavailable it displays a warning.

The file stores room membership, expiry, hashed session identifiers, subscription endpoints and encryption/auth keys—not chat history. Treat it as sensitive. Do not put it in `public/`, a Git repo, or a shared/downloadable directory. A path on Render's ordinary ephemeral filesystem does NOT become persistent just because this variable is set. This implementation is for a single server instance, not multi-instance shared storage.

A shared durable database/service would be another implementation option if you later need multiple instances. None is configured by this ZIP.

## Exit, closing tabs and privacy

- **Exit Room** explicitly revokes this tab/session's alerts, clears its local message view, stops media and returns to the join screen. Other participants are unaffected.
- Simply closing a tab intentionally keeps its notification registration for up to 24 hours. That allows closed-page alerts. Multiple tabs are separate sessions; other opted-in sessions can still receive alerts.
- **Turn off on this device** clears the browser's bindings and unsubscribes it from Push. It does not erase other devices' chat.
- Reset Chat revokes the room's server push bindings. Live participants must enable alerts again if desired.
- Browser-local binding records suppress queued content after that binding is removed. Already delivered notifications, screenshots or OS notification history cannot be recalled reliably; phones control their retention.
- Clicking an alert focuses its originating tab if still in that room, otherwise opens a prefilled room invite. It never auto-joins, turns on a mic/camera, or restores lost message history.
- Message content is encrypted for delivery to the browser push service by the Web Push protocol, but TempChat's chat itself remains server-relayed, not end-to-end encrypted between participants. Apple/Google/Mozilla/Microsoft push infrastructure is involved in transport and can see delivery metadata.

## Local testing with your existing keys

Keys are not loaded implicitly from the file by `server.js`. For a local test:

```bash
cd ~/Documents/Projects/temp-chat
set -a
. ./push-keys.env
set +a
npm start
```

Second terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

Use the generated HTTPS address. Permissions/subscriptions are per origin, so a different tunnel hostname or a new Render URL needs a new opt-in. Keep the server/tunnel running while testing. Do not publish the key file.
