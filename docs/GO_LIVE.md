# Go-live checklist

Use this after local testing is done. Goal: the same software on any device, with real secrets and no demo password list.

## 1. Hosted database (free option: Supabase)

1. Create a free Supabase project.
2. Open **Project Settings → Database** and copy the Postgres connection string (URI).
3. In the Supabase SQL editor, run every file in `supabase/migrations` **in filename order** (`0001_…` through the latest).
4. Confirm role `zann_app` exists (`NOLOGIN`, no bypass RLS).

## 2. Seed staff once

On a machine that can reach that database:

```bash
# temporary .env.local for setup only
DATABASE_URL=postgresql://...
SEED_DEMO=false
SESSION_SECRET=...
CRON_SECRET=...
APP_URL=https://your-site
npm run setup
```

That creates the lab staff accounts (Keral, Ana, Ned, Zoca, Parneet, Negar). Then keep `SEED_DEMO=false` forever on the host.

## 3. Host the app (free option: Netlify)

1. Connect this repo to Netlify (or deploy with Netlify CLI).
2. Set environment variables (Site settings → Environment variables):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase URI (server-only) |
| `SESSION_SECRET` | long random string |
| `CRON_SECRET` | long random string |
| `APP_URL` | `https://your-netlify-site.netlify.app` |
| `SEED_DEMO` | `false` |
| `SHOW_DEV_LOGINS` | `false` |
| `AUTH_PROVIDER` | `local` |

3. Deploy. Open the site URL and sign in as Keral / Ana / etc. with the known staff passwords.
4. Change passwords from **Password** (Keral) or Admin after go-live if needed.

## 4. Smoke test on a phone (different Wi‑Fi)

- [ ] Login works
- [ ] Today / Week ahead load
- [ ] Technicians do **not** see office names
- [ ] Keral / Parneet / Ana **do** see office names
- [ ] Sending page shows daily numbers
- [ ] Chat + notifications work

## 5. Optional later

- Evident API keys → `EVIDENT_*` env vars
- SMTP for email notifications
- Scheduled `POST /api/jobs/reminders` with `Authorization: Bearer $CRON_SECRET`

## Local free multi-device (same PC on)

If you are not hosting yet:

```bash
npm run dev
npm run tunnel
```

Use the `trycloudflare.com` URL from any Wi‑Fi while this computer stays on.
