# Neon archive setup — separate project, same account

## What this release stores

When archiving is configured, **text messages, reply references, normal photos and voice notes** are eligible by default. View-once photos and live call audio/video are excluded. Reset Chat clears the live view only and does NOT delete retained archives. The owner can delete a retained room session sooner; otherwise records expire after at most seven days from capture.

Participants see a short, visible retention notice before joining. There is no checkbox or additional acceptance step in v12. The current client sends a notice-version compatibility marker automatically; it is not proof of consent or reading. Outdated clients without a supported notice are told to reload. The earlier v11 explicit-acknowledgement protocol remains compatible.

## 1. Create a NEW Neon project

In your existing Neon Free-plan organization, choose **New Project**, not a new branch/database inside the typing project. Name it `tempchat-archives` and choose a region close to Render.

Neon's published Free allowance is **0.5 GB per project**, so separate projects have separate allowances. The application does not create accounts/workspaces or upgrade a plan for you. Check your current organization is on Free and verify limits in Neon Console.

Official reference: https://neon.com/docs/introduction/plans

**Do not reuse or modify the typing website's project/connection string.** The archive creates only `tc_archive_chunks` and `tc_archive_state`; it also refuses initial setup if it finds unrelated existing public-schema tables, to help catch an accidental typing-database connection. Still verify that you selected the new project yourself.

## 2. Get the new project's connection string

Open the new project's **Connect** panel. Select its production/root branch, database and role, and copy the Postgres connection string (the pooled connection string is suitable). It looks like:

```text
postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

**It contains a password. Never paste it in chat, put it into frontend JavaScript, or commit it.** Copy the URI only, not a `psql` command or surrounding quotes, directly into the TempChat service's Render Environment in step 4. The app enforces certificate-verified TLS for its configured PostgreSQL connection.

No manual SQL paste is required: the server initializes its own small schema on connection. Use an empty dedicated database.

## 3. Generate separate archive secrets locally

After installing this ZIP's source files:

```bash
cd ~/Documents/Projects/temp-chat
node scripts/generate-archive-secrets.js
cat archive-secrets.env
```

This creates:

```text
ARCHIVE_ENCRYPTION_KEY=...
ARCHIVE_CLEANUP_TOKEN=...
```

Keep these private. **Do not paste the output here.** Keep a secure backup of the encryption key: losing/changing it makes existing archives unreadable. The script will not overwrite an existing file.

These values are separate from **ADMIN_KEY**, which remains your existing admin login key. Do not regenerate ADMIN_KEY for this update, and do not use the old VAPID keys.

## 4. Set three variables on the TEMPCHAT Render service

For https://temp-chat-5yum.onrender.com/ → Environment, add:

| Name | Value |
|---|---|
| `ARCHIVE_DATABASE_URL` | Connection string from the NEW Neon project |
| `ARCHIVE_ENCRYPTION_KEY` | Generated encryption-key value |
| `ARCHIVE_CLEANUP_TOKEN` | Generated cleanup-token value |

Keep the existing `ADMIN_KEY` unchanged. Save and redeploy. Do not alter the typing service's Environment.

Open `/admin` → **7-day archives → Load archives**. Confirm it says Archive ON/ready rather than a configuration/database error. Send a test message from a room opened in the current version, wait a few seconds, then refresh the archive list.

Missing variables leave archiving off; no insecure/plaintext fallback is used. Invalid database configuration leaves an explicit warning in the owner panel. Live chat can continue if archive writes fail, so archive completeness is not guaranteed during errors, quota exhaustion or abrupt process crashes.

## 5. Enable automatic deletion even while Render sleeps

The ZIP includes `.github/workflows/archive-cleanup.yml`, which calls an authenticated cleanup endpoint hourly. In GitHub, open your **temp-chat repository → Settings → Secrets and variables → Actions → New repository secret** and add:

| Repository secret | Value |
|---|---|
| `ARCHIVE_CLEANUP_URL` | `https://temp-chat-5yum.onrender.com/api/archive/cleanup` |
| `ARCHIVE_CLEANUP_TOKEN` | The same cleanup token stored in Render |

**Do not put the database password or archive encryption key in GitHub Actions.** The cleanup job needs only its restricted token.

Then go to **Actions → Delete expired TempChat archives → Run workflow** and confirm it succeeds. The workflow must be on the default `main` branch and Actions/scheduled runs must be enabled.

If GitHub refuses the code push because it contains a workflow file, update your normal Git authentication's workflow-write permission (classic PAT: `workflow` scope), use SSH, or add the workflow with GitHub's authenticated web editor. Keep tokens private. Your local commit is not lost; after fixing authentication, run `git push origin main` rather than reinstalling/resetting the project.

### Deletion timing

- The archive API excludes expired records immediately based on database time, even before a deletion job runs. Viewing does not extend retention.
- Batches expire at the earliest message's seven-day deadline, so later messages in a short batch can expire a few seconds early, never later because of batching.
- Physical row deletion runs hourly through the configured job, also at server startup, on writes, and periodically while the server is running. GitHub schedules can be delayed/disabled, so monitor job failures and the panel's Last cleanup and External cleanup check times. Render/Neon outages or quota suspension can delay physical deletion; the API still never returns expired records when it is running. This is not a guarantee of physical deletion at the exact second of the seven-day boundary.
- Neon restore history/backups/branches follow the provider's retention and can retain older encrypted data after SQL DELETE. Review those settings if strict deletion obligations apply.
- Existing exported/downloaded media, screenshots or already-viewed browser copies cannot be recalled by deleting the database row.
- Do not remove the database/cleanup configuration while records remain if you expect scheduled purging to continue. If disabling the feature permanently, delete retained archives first or perform a controlled database cleanup yourself.

## How compression and viewing work

Neon holds **file-like binary archive batches in `bytea` columns**, not one enormous ZIP file. Small per-room batches are losslessly Brotli-compressed and then AES-256-GCM encrypted. Fresh random nonces and authenticated metadata protect each batch.

The admin session list uses metadata only. Opening a room page decrypts/decompresses only the requested batches in server memory. Photo/audio bytes are fetched only when you click Load photo/Load voice note. The browser never receives the database password or encryption key. Admin endpoints require the existing protected admin session; deletions also require CSRF protection and typing DELETE.

Images and audio are already compressed: do not expect dramatic additional savings. The panel shows original JSON bytes versus stored encrypted bytes so you can see actual results.

## Limits and reliability

- Fixed **seven-day maximum**; admin can delete earlier, not extend the clock indefinitely through this UI.
- **300 MiB encrypted-payload safety budget** to leave headroom inside the project's 0.5 GB allowance for database/index/TOAST overhead. This is not a second quota from Neon, and it is not an exact guarantee of total project usage. Monitor Neon Console.
- **4 MiB decoded limit per normal photo or voice note**, with supported raster-image/audio formats only. Oversized/unsupported media is not archived and increments the owner-visible dropped-event warning; live relay behavior is unchanged.
- Batches normally flush within about two seconds, with immediate flushes for larger batches. Graceful shutdown attempts to flush; abrupt crashes can lose pending messages.
- Memory queue is bounded to 32 MiB. Database failures/full budget cause drops with owner-visible warnings instead of crashing or blocking the live chat. Sent/Delivered/Seen statuses are live-chat receipts, not database-write guarantees.
- Room-instance identifiers separate different lifetimes that reuse the same room code. Manual archive deletion removes data retained through that moment and discards old queued data; new messages can create fresh records afterwards.
- Deleting rows lets PostgreSQL reuse space; file-size figures do not necessarily shrink immediately. Provider storage/restore accounting is separate from the in-app payload estimate.
- Writing archives adds Render-to-Neon outbound traffic. Viewing archives consumes Neon-to-Render and Render-to-admin traffic. This does not reduce live-call bandwidth or bypass Render's allowance. No calls are recorded.

## Key handling and privacy

Only authenticated admins can access these archives through the website. Infrastructure operators with both storage access and the encryption key can also decrypt them; this is not end-to-end encryption between chat participants. Neon sees metadata such as room codes, timestamps and sizes, while message bodies/names/media inside batches are encrypted.

Keep `archive-secrets.env`, `admin-key.env`, real `.env` files and database connection strings out of Git and shared ZIPs. Source installation and Git staging use explicit allowlists; secret filenames are ignored. Never overwrite the archive encryption key casually. Rotating it requires a planned migration or deletion of the old archive, not merely generating a replacement.

## Local testing (optional)

```bash
cd ~/Documents/Projects/temp-chat
set -a
. ./archive-secrets.env
[ ! -f ./admin-key.env ] || . ./admin-key.env
set +a
read -rsp "NEW Neon connection string: " ARCHIVE_DATABASE_URL; echo
export ARCHIVE_DATABASE_URL
npm start
```

Use only the new project. Ordinary automated tests clear archive database environment values in their child servers and do not need your Neon credentials. A separate localhost-only PostgreSQL integration test is included for maintainers.
