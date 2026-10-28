# Schema

The executable schema is `supabase/migrations`. Apply the files in name order. Do not edit a migration that has already been applied to a shared database; add a new file.

## Main tables

- `profiles`, `local_credentials` — staff identity, role, clinic-visibility flag, and the local password hash. Technicians cannot have clinic visibility.
- `departments`, `department_members` — configurable departments and member or lead membership.
- `clinic_accounts`, `case_clinic_links` — dentist and clinic identity, separated from production cases.
- `workflow_templates`, `workflow_stages`, `stage_dependencies`, `stage_checklist_items` — versioned starting routes and stage settings.
- `cases`, `case_units`, `case_events` — one case number, many units, and an append-only timeline.
- `production_tasks`, `task_dependencies`, `task_events`, `task_checklist_items` — scheduled work, predecessors, and checklist copies.
- `quality_checks`, `quality_check_results`, `rework_orders` — quality results and the task created when work returns to production.
- `notifications`, `notification_deliveries`, `notification_keys` — in-app notices, delivery attempts, and idempotency keys.
- `business_calendar`, `business_hours`, `production_settings` — working time, holidays, reminder time, and case-number settings.
- `audit_logs` — status, assignment, quality, and dispatch metadata. Ordinary roles cannot insert or edit these rows.
- `import_jobs`, `dispatch_records`, `case_attachments`, `job_locks` — import history, dispatch proof, attachment metadata, and the reminder lock.

`cases.excluded_stage_ids` stores the skippable stages chosen at intake. Case numbers are unique without regard to letter case. PAN numbers are not unique: one patient can have several cases.

Audit and case events are append-only for application roles. There is no delete grant for `zann_app`.

## Views and functions

- `staff_directory` exposes name, role, and capacity. It does not expose email.
- `app.can_read_case` and `app.can_read_task` decide which production rows a session can see.
- `app.next_case_number` issues the next `ZN-` number.
- `app.post_notification` is the only insert path for notifications.
- `app.assert_no_clinic_identity` rejects clinic names and contact details in production text.
