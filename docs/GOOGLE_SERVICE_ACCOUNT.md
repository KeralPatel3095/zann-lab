# Live Google Sheet sync (service account)

Use this for day-to-day updates from a private Google Sheet.

## 1. Google Cloud
1. Create/select a project.
2. Enable **Google Drive API**.
3. Create a service account (e.g. `zann-sheet-sync`).
4. Create a **JSON key** for that account.
5. If key creation is blocked by org policy `iam.disableServiceAccountKeyCreation`, set that policy to **Not enforced** on the project/org (admin required).

## 2. Share the sheet
Share the tracker Google Sheet with the JSON `client_email` as **Viewer**.

## 3. Netlify env vars (never commit these)
| Key | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | JSON `client_email` |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | JSON `private_key` (full value including BEGIN/END and `\n`) |

Also required from go-live: `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `APP_URL`, `SEED_DEMO=false`, `SHOW_DEV_LOGINS=false`, `AUTH_PROVIDER=local`.

Redeploy: **Clear cache and deploy site**.

## 4. Import in the app
Paste the normal sheet URL (`https://docs.google.com/spreadsheets/d/.../edit`) → **Save and sync**.

Auto-sync runs about every 15 minutes via `netlify/functions/tracker-sync-cron.mts`.
