# Architecture

The application is a Next.js App Router project. Pages load data on the server. Mutations are server actions. A few routes expose export, health, and the reminder job.

## Database access

Local development starts embedded PostgreSQL and connects as the database owner. Every user request then runs inside a transaction that executes `SET LOCAL ROLE zann_app` and sets `app.user_id` from the verified session. Row-level security applies to `zann_app`. The owner connection is used only for migrations, password checks, and creating the first accounts.

Do not send browser traffic through a Supabase service-role key. A hosted database connection must be able to `SET ROLE zann_app` and must stay on the server.

Prepared statements are disabled because authorization depends on transaction-local settings.

## Privacy

Clinic name, dentist name, email, phone, and billing notes live in `clinic_accounts` and `case_clinic_links`. The `cases` table stores the dentist code and production fields, not the clinic identity.

`app.can_view_clinic()` is false for every technician, including a technician whose profile flag was edited. Administrators and front desk can read clinic rows. Department leads and managers can read them only when `can_view_clinic_identity` is set. Policies, not the page layout, enforce this.

Notifications are inserted by `app.post_notification`, which rejects clinic identity in the title and body. Email bodies stay generic unless an administrator turns on `email_include_patient_details` after a privacy review.

## Time

Business calculations use Luxon in `America/Toronto`. Instants are stored as `timestamptz`. Working time follows `business_hours` and `business_calendar`, so weekends, holidays, and daylight-saving changes are not treated as a fixed number of hours per day.

## Jobs

`instrumentation.ts` starts a reminder pass when the Node server boots and repeats it every 15 minutes. `POST /api/jobs/reminders` runs the same job when the `Authorization: Bearer` value matches `CRON_SECRET`. The job takes a lock, writes idempotency keys, and records email attempts. In-app notifications remain available when SMTP is not configured.
