# ZANN Laboratory Production

Web application for tracking dental laboratory cases from intake through production, quality control, and dispatch. Operational dates use `America/Toronto`.

This repository was built and tested with an embedded PostgreSQL server. Supabase is the intended hosted database, using the same SQL migrations. A live Supabase project was not connected in this workspace.

## Run locally

Requirements: Node.js 20 and npm.

```bash
cd zann-lab
copy .env.example .env.local
```

Set `PG_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, and `SEED_PASSWORD` in `.env.local`. Do not commit that file.

```bash
npm install
npm run setup
npm run dev
```

Open http://localhost:3000. With `SHOW_DEV_LOGINS=true`, the sign-in page can list staff accounts for local testing.

`npm run setup` creates the local database, applies `supabase/migrations`, loads department and workflow templates, and inserts staff. Fictional demo cases load only when `SEED_DEMO` is not `false`.

## Go live

See [docs/GO_LIVE.md](docs/GO_LIVE.md) for free hosting (Supabase + Netlify), production env vars, and the smoke-test checklist.

Same Wi‑Fi: open `http://<this-pc-ip>:3000`. Any Wi‑Fi while this PC is on: `npm run tunnel`.

## Checks

```bash
npm run typecheck
npm test
npm run lint
```

Tests use a separate database on port 54340 and do not load the demo seed.

## What is implemented

- Local password sign-in, session cookies, and optional unverified Supabase JWT verification
- Role checks in server actions and PostgreSQL row-level security
- Case intake, validation, hold, delivery changes, search, and case timeline
- Workflow templates for crowns, nightguards, dentures, repairs, implants, and other work
- Backward scheduling from the requested delivery date, with an explicit warning when the date does not fit
- Technician tasks, handoffs, blockers, quality-control rework, and dispatch
- In-app notifications, including a one-working-day reminder job
- Excel and CSV import and permission-aware export
- Front desk, technician, department, management, and administrator screens

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Schema](docs/SCHEMA.md)
- [Permissions](docs/PERMISSIONS.md)
- [Scheduling](docs/SCHEDULING.md)
- [Assumptions](docs/ASSUMPTIONS.md)
- [Deployment](docs/DEPLOYMENT.md)
- [User guide](docs/USER_GUIDE.md)

Stage durations, holidays, and checklist wording are configurable placeholders. They are not measured ZANN production standards and they are not a certification of privacy compliance.
