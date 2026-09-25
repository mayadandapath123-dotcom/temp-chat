# TempChat owner console — private setup

After this release is deployed, your console URL is:

**https://temp-chat-5yum.onrender.com/admin**

The route exists without a key, but live data and moderation APIs remain locked. **There is no default admin password.** Public chat still works when the admin key is missing.

## 1. Generate a NEW admin key on your laptop

After installing the ZIP's files in your existing project:

```bash
cd ~/Documents/Projects/temp-chat
node scripts/generate-admin-key.js
cat admin-key.env
```

The terminal displays one entry:

```text
ADMIN_KEY=your-generated-secret-value
```

Keep this key in a password manager. **Never paste it into chat, a room message, a screenshot you share, a URL, or GitHub.** It is separate from the old notification/VAPID keys. Do not reuse a previously exposed key.

The file has restrictive permissions and is ignored by Git. The generator refuses to overwrite an existing `admin-key.env`. If the file already exists, keep the existing key unless you intentionally want to rotate it.

## 2. Add the key to the active TempChat Render service

Render → the service for **temp-chat-5yum.onrender.com** → **Environment** → add:

- **Name:** `ADMIN_KEY`
- **Value:** only the generated value after `=`

Save and redeploy/restart as Render prompts. Do not change your typing website's service or database.

## 3. Sign in

Open `/admin` on the current TempChat domain. Paste only the key value into the password field and choose **Unlock console**.

The key is sent in a same-origin POST body over HTTPS, not in a URL. It is verified by the server and is not saved in browser localStorage/sessionStorage. Successful login creates a random HttpOnly, SameSite=Strict, host-only session cookie. Production HTTPS cookies also use Secure and the `__Host-` prefix. The local development exception supports localhost over HTTP only.

Sessions expire after **8 hours**, or earlier on logout/server restart. Repeated failed login attempts are rate limited. This is a small single-owner console, not an enterprise identity/SSO system.

## 4. What you can see

- Live room codes and connected member sessions.
- Username, separate socket/session identifier and verified admin role.
- Joined time, elapsed time in the room, cumulative active/away durations, last presence signal and sent-message count.
- Active call participants and their reported camera/microphone status.
- Per-room text/photo/voice-note counts and approximate relayed payload bytes.
- Server uptime, process memory and totals since restart.
- Recent connection/moderation metadata, including reasons you enter for actions.
- Search/filter by room/member name, active calls or entry locks.

**Presence is browser-reported liveness, not proof the human is looking, typing or physically active.** Counts refer to sessions, not unique people/accounts. Reconnecting creates a new session.

**Relay payload is not the Render bandwidth meter.** It excludes protocol/TLS overhead, static assets, dashboard API traffic and other hosting egress. Use Render's own Usage/Billing page for the actual quota.

The dashboard refreshes approximately every five seconds while visible and pauses polling while hidden. Leaving it visible generates some outbound traffic.

## 5. Entering a room visibly

Select a room → **Enter as Admin** → explicitly join in the new chat tab.

- Your server-verified name is **Admin**.
- All current members receive an announcement and a visible “Admin is present” banner.
- Your messages and presence entry carry an ADMIN badge.
- Ordinary clients cannot grant themselves this role with a username or URL flag. They need a valid authenticated admin session.
- Exact reserved names such as “Admin” entered by guests are labeled “Admin (guest)”. The badge—not just the text name—identifies the verified role.
- The join URL uses `admin=1` only as a mode request; it contains no secret. Sharing it does not give another person admin authority.
- You receive new messages after entering like another participant. The dashboard does not stream chat contents, replay earlier messages, recover deleted content or bypass view-once media.
- Calls still require the normal visible call join flow and any browser microphone/camera permission. There is no silent call-listening feature.

The public join screen and manual disclose live metadata visibility and announced admin visits.

## 6. Moderation controls

### Remove session
Ends that one socket's room/call, stops its client media and returns it to the join screen with your reason. Other members' chat stays intact.

This is **not a permanent identity ban**. Anonymous users can open a new session and return unless entry is locked. IP addresses, locations and device fingerprints are not collected/displayed for this console.

### Lock entry / Unlock
Locks new non-admin entry for up to **one hour**. Existing connected members can continue. Reconnecting users count as new sessions and may be blocked until entry is unlocked. A verified Admin may enter a locked room.

Locks expire automatically and reset on a server restart. They are not permanent access-control records.

### Clear chat
Requires typing the exact room code. Clears chat, receipt/reply metadata and shared appearance for that room. It cannot recall screenshots, notification history or copies already retained elsewhere. Counters for the room instance remain operational metrics, not stored message bodies.

### End call
Requires room-code confirmation. Ends the room's call without removing its chat members.

### Close & lock
Requires room-code confirmation. Clears the room, ends its call, removes all current sessions and locks new non-admin entry for up to one hour.

Reasons are visible to affected members and are included in the temporary admin activity log. Do not put secrets in a reason field.

## 7. Logout and key rotation

Use the logout icon in the console. Logout invalidates that admin login and ends its visible admin room sessions. An independently logged-in owner device has a separate session.

To rotate a lost/exposed key, generate a replacement locally, change `ADMIN_KEY` in Render and restart/redeploy. Restart drops every in-memory admin session; sign in with the replacement. Never send the replacement key to this chat.

Before rotating, securely preserve/remove the old `admin-key.env` as appropriate—the generator deliberately refuses to overwrite it. Do not copy it to an unignored file inside the Git repository.

## Data retention and limitations

- Admin sessions, locks, activity and counters are **memory-only** and reset on server restart. There is no new database or persistent audit archive.
- The activity buffer holds up to 200 recent metadata entries; the API returns up to 100 and the UI displays the latest 40.
- Unlocked empty rooms are removed from live metrics. Locked empty rooms remain until unlocked/expired. The dashboard shows up to 500 rooms and flags truncation.
- The login rate limiter keeps bounded salted hashes of connection source addresses for counters, not a user-location/IP directory. Reverse proxies can cause multiple attempts to share the same rate bucket.
- A key holder has owner-level control. Protect the key and log out on shared devices. These safeguards are not a guarantee of an unhackable application or a substitute for a professional security audit.
- This release keeps **joined-page-only notifications** from v8. Closed-page Web Push stays disabled; no VAPID setup is needed.

## Local test

The key file is not automatically loaded by `server.js`. To use it locally:

```bash
cd ~/Documents/Projects/temp-chat
set -a
. ./admin-key.env
set +a
npm start
```

Then open `http://localhost:3000/admin`. For external testing use your usual HTTPS Cloudflare tunnel. Never share the key file or an authenticated browser session.
