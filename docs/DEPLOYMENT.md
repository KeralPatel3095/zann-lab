# Deployment

## Environment

Copy `.env.example`. Set every secret in the host's environment, not in source control.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Server-only PostgreSQL URL when not using embedded Postgres. The role must be allowed to `SET ROLE zann_app`. |
| `PG_PORT`, `PG_PASSWORD`, `PG_DATABASE`, `PG_USER`, `PG_DATA_DIR` | Embedded database, used when `DATABASE_URL` is empty. |
| `SESSION_SECRET` | Signs the local session cookie. |
| `CRON_SECRET` | Bearer token for `POST /api/jobs/reminders`. |
| `SEED_PASSWORD`, `SEED_DEMO` | Demo accounts. Set `SEED_DEMO=false` before any real records are loaded. |
| `APP_URL` | Absolute links in notifications. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Optional email. Blank means email is skipped. |

## Database

1. Create an empty PostgreSQL database.
2. Run every file in `supabase/migrations` in order, as a role that can create tables and the `zann_app` role.
3. Confirm `zann_app` is `NOLOGIN` and `NOBYPASSRLS`, and that application queries set the role and `app.user_id`.
4. Create the first administrator with a local password hash, or run `npm run setup` once against that database with `SEED_DEMO=true`, then disable demo seeding.
5. Sign in as the administrator, replace the placeholder workflows, and add real staff. Disable the fictional accounts before go-live.

On Supabase, run the migration SQL in the SQL editor or with the Supabase CLI. Do not use the service role inside user requests. Store the owner connection only in server environment variables.

## Application host

Build with `npm run build` and start with `npm start`, or host the Next.js app on a Node platform. The server must reach the database and must not expose `DATABASE_URL` to the browser.

Call the reminder route on a schedule, in addition to the in-process 15-minute timer:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/jobs/reminders
```

## Backup and restore

Use the database provider's backups for a hosted project and test a restore before go-live.

For the local or self-managed database:

```bash
pg_dump --format=custom --file=zann-lab.dump "$DATABASE_URL"
pg_restore --clean --if-exists --dbname="$DATABASE_URL" zann-lab.dump
```

Restore into an empty database first and confirm that a front desk user can see a known fictional case and a technician cannot see clinic names. Do not put production patient rows in the development database.

## Importing existing spreadsheets

1. Sign in as front desk or an administrator.
2. Open Import.
3. Upload `.xlsx` or `.csv`.
4. Type each source column header next to the field it represents. Case number, PAN, patient, and dentist code are separate fields.
5. Choose skip or fill-blank. Fill-blank does not replace a value the database already has.
6. Mark historical files so they are stored without production tasks.

The sample file is `examples/sample-cases.csv`.
