# Neon archive — retired

Chat archiving has been retired. TempChat is temporary again: new text, photos, voice notes and calls are **not** written to any database. Late-join history lives only in server memory and is cleared on Reset or when the room closes.

The only remaining database code is a cleanup-only job that deletes **already-expired** rows left behind by the old seven-day archive. It never reads, decrypts, inserts or extends anything.

## Keep these until the old rows are gone

On the **TempChat** Render service (not the typing website):

| Setting | Why it stays for now |
|---|---|
| `ARCHIVE_DATABASE_URL` | Lets the cleanup job reach the old archive database |
| `ARCHIVE_CLEANUP_TOKEN` | Authenticates the hourly GitHub cleanup workflow |
| `ADMIN_KEY` | Your live moderation console — keep permanently |

Also keep the GitHub Actions workflow `.github/workflows/archive-cleanup.yml` and its repository secrets enabled. `ARCHIVE_ENCRYPTION_KEY` is no longer used by the code.

## When you can remove them

Run the **Delete expired TempChat archives** workflow (or wait for its hourly run) and look at the response:

```json
{"ok":true,"archiving":false,"deleted":0,"remaining":0,"lastExpiry":null}
```

Once it reports `"remaining": 0`, you may remove `ARCHIVE_DATABASE_URL`, `ARCHIVE_CLEANUP_TOKEN`, the workflow and its secrets, and delete the dedicated `tempchat-archives` Neon project. Never touch the typing website's Neon project or connection string.
