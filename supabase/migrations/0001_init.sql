-- ZANN Dental Laboratory production schema.
-- Clinic identity lives only in clinic_accounts and case_clinic_links.
-- Technician-visible case rows do not contain dentist names, clinic names, or contact details.
-- Application queries run as zann_app after SET LOCAL ROLE so these policies apply.
-- The table owner bypasses RLS. zann_app is not the owner. Do not connect the app as a superuser without SET ROLE.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zann_app') THEN
    CREATE ROLE zann_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS app;

CREATE TYPE app_role AS ENUM (
  'administrator',
  'front_desk',
  'technician',
  'department_lead',
  'production_manager'
);

CREATE TYPE case_status AS ENUM (
  'draft',
  'awaiting_validation',
  'on_hold',
  'ready_for_production',
  'in_production',
  'awaiting_quality_control',
  'rework_required',
  'ready_for_dispatch',
  'dispatched',
  'delivered',
  'cancelled'
);

CREATE TYPE task_status AS ENUM (
  'waiting',
  'ready_to_start',
  'in_progress',
  'paused',
  'blocked',
  'awaiting_approval',
  'completed',
  'cancelled'
);

CREATE TYPE priority_level AS ENUM ('low', 'normal', 'high', 'rush');

CREATE TYPE dispatch_state AS ENUM ('not_ready', 'ready', 'packed', 'picked_up', 'dispatched', 'delivered');

CREATE TYPE blocker_category AS ENUM (
  'missing_prescription',
  'missing_scan_or_impression',
  'incomplete_records',
  'awaiting_dentist_clarification',
  'material_unavailable',
  'equipment_issue',
  'remake_or_qc_failure',
  'technician_capacity',
  'other'
);

CREATE TYPE membership_role AS ENUM ('member', 'lead');

CREATE TYPE qc_outcome AS ENUM ('approved', 'rejected', 'rework');

CREATE TYPE deadline_indicator AS ENUM ('on_track', 'due_soon', 'at_risk', 'overdue');

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 160),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 200),
  role app_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  can_view_clinic_identity boolean NOT NULL DEFAULT false,
  daily_capacity_minutes integer NOT NULL DEFAULT 420 CHECK (daily_capacity_minutes BETWEEN 60 AND 720),
  email_notifications boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT technician_clinic_hidden CHECK (role <> 'technician' OR can_view_clinic_identity = false)
);

CREATE UNIQUE INDEX profiles_email_lower_idx ON profiles (lower(email));

CREATE TABLE local_credentials (
  user_id uuid PRIMARY KEY REFERENCES profiles (id),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE department_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments (id),
  user_id uuid NOT NULL REFERENCES profiles (id),
  membership_role membership_role NOT NULL DEFAULT 'member',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, user_id)
);

CREATE TABLE clinic_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dentist_code text NOT NULL CHECK (char_length(dentist_code) BETWEEN 1 AND 40),
  dentist_name text NOT NULL CHECK (char_length(dentist_name) BETWEEN 1 AND 160),
  clinic_name text NOT NULL CHECK (char_length(clinic_name) BETWEEN 1 AND 160),
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  billing_notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX clinic_accounts_code_idx ON clinic_accounts (lower(dentist_code));

CREATE TABLE workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  case_type text NOT NULL CHECK (char_length(case_type) BETWEEN 1 AND 80),
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_template_id uuid NOT NULL REFERENCES workflow_templates (id),
  stage_name text NOT NULL CHECK (char_length(stage_name) BETWEEN 1 AND 160),
  department_id uuid NOT NULL REFERENCES departments (id),
  sequence integer NOT NULL CHECK (sequence > 0),
  estimated_work_minutes integer NOT NULL DEFAULT 30 CHECK (estimated_work_minutes >= 0 AND estimated_work_minutes <= 5000),
  elapsed_minutes integer NOT NULL DEFAULT 0 CHECK (elapsed_minutes >= 0 AND elapsed_minutes <= 20000),
  required boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL DEFAULT false,
  skippable boolean NOT NULL DEFAULT false,
  auto_release_next boolean NOT NULL DEFAULT true,
  is_quality_gate boolean NOT NULL DEFAULT false,
  is_dispatch_stage boolean NOT NULL DEFAULT false,
  escalation_after_minutes integer NOT NULL DEFAULT 120,
  responsible_role text NOT NULL DEFAULT 'technician',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_template_id, sequence)
);

CREATE TABLE stage_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_stage_id uuid NOT NULL REFERENCES workflow_stages (id),
  successor_stage_id uuid NOT NULL REFERENCES workflow_stages (id),
  UNIQUE (predecessor_stage_id, successor_stage_id),
  CHECK (predecessor_stage_id <> successor_stage_id)
);

CREATE TABLE stage_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES workflow_stages (id),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 240),
  required boolean NOT NULL DEFAULT true,
  sequence integer NOT NULL DEFAULT 1
);

CREATE TABLE cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text NOT NULL CHECK (char_length(case_number) BETWEEN 1 AND 40),
  dentist_code text NOT NULL DEFAULT '' CHECK (char_length(dentist_code) <= 40),
  patient_name text NOT NULL DEFAULT '' CHECK (char_length(patient_name) <= 160),
  pan_number text NOT NULL DEFAULT '' CHECK (char_length(pan_number) <= 40),
  case_type text NOT NULL DEFAULT '',
  initial_department_id uuid REFERENCES departments (id),
  workflow_template_id uuid REFERENCES workflow_templates (id),
  restoration_type text NOT NULL DEFAULT '',
  prescription text NOT NULL DEFAULT '',
  required_records text NOT NULL DEFAULT '',
  special_handling text NOT NULL DEFAULT '',
  received_at timestamptz,
  production_ready_at timestamptz,
  requested_delivery_at timestamptz,
  projected_completion_at timestamptz,
  priority priority_level NOT NULL DEFAULT 'normal',
  rush boolean NOT NULL DEFAULT false,
  overall_status case_status NOT NULL DEFAULT 'draft',
  dispatch_status dispatch_state NOT NULL DEFAULT 'not_ready',
  deadline_indicator deadline_indicator NOT NULL DEFAULT 'on_track',
  schedule_feasible boolean NOT NULL DEFAULT true,
  schedule_note text NOT NULL DEFAULT '',
  acknowledged_infeasible boolean NOT NULL DEFAULT false,
  hold_reason text NOT NULL DEFAULT '',
  historical boolean NOT NULL DEFAULT false,
  missing_information text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cases_case_number_idx ON cases (lower(case_number));
CREATE INDEX cases_pan_idx ON cases (lower(pan_number));
CREATE INDEX cases_dentist_code_idx ON cases (lower(dentist_code));
CREATE INDEX cases_status_idx ON cases (overall_status);
CREATE INDEX cases_delivery_idx ON cases (requested_delivery_at);

CREATE TABLE case_clinic_links (
  case_id uuid PRIMARY KEY REFERENCES cases (id),
  clinic_account_id uuid NOT NULL REFERENCES clinic_accounts (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE case_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id),
  unit_identifier text NOT NULL DEFAULT '',
  tooth_number text NOT NULL DEFAULT '',
  material text NOT NULL DEFAULT '',
  shade text NOT NULL DEFAULT '',
  unit_instructions text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX case_units_case_idx ON case_units (case_id);

CREATE TABLE case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id),
  actor_id uuid REFERENCES profiles (id),
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 80),
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  event_details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX case_events_case_idx ON case_events (case_id, event_timestamp);

CREATE TABLE production_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id),
  workflow_stage_id uuid REFERENCES workflow_stages (id),
  assigned_user_id uuid REFERENCES profiles (id),
  department_id uuid NOT NULL REFERENCES departments (id),
  title text NOT NULL,
  task_status task_status NOT NULL DEFAULT 'waiting',
  priority priority_level NOT NULL DEFAULT 'normal',
  planned_start_at timestamptz,
  planned_due_at timestamptz,
  labor_due_at timestamptz,
  actual_started_at timestamptz,
  actual_completed_at timestamptz,
  last_active_at timestamptz,
  active_seconds integer NOT NULL DEFAULT 0,
  blocked_seconds integer NOT NULL DEFAULT 0,
  paused_seconds integer NOT NULL DEFAULT 0,
  blocked_reason text NOT NULL DEFAULT '',
  blocker_category blocker_category,
  pause_reason text NOT NULL DEFAULT '',
  blocked_at timestamptz,
  work_minutes integer NOT NULL DEFAULT 0,
  elapsed_minutes integer NOT NULL DEFAULT 0,
  requires_approval boolean NOT NULL DEFAULT false,
  is_quality_gate boolean NOT NULL DEFAULT false,
  is_dispatch_stage boolean NOT NULL DEFAULT false,
  auto_release_next boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  technical_instructions text NOT NULL DEFAULT '',
  production_notes text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX production_tasks_assignee_idx ON production_tasks (assigned_user_id, task_status, labor_due_at);
CREATE INDEX production_tasks_case_idx ON production_tasks (case_id, sort_order);
CREATE INDEX production_tasks_department_idx ON production_tasks (department_id, task_status);

CREATE TABLE task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_task_id uuid NOT NULL REFERENCES production_tasks (id),
  successor_task_id uuid NOT NULL REFERENCES production_tasks (id),
  UNIQUE (predecessor_task_id, successor_task_id),
  CHECK (predecessor_task_id <> successor_task_id)
);

CREATE TABLE task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES production_tasks (id),
  case_id uuid NOT NULL REFERENCES cases (id),
  actor_id uuid REFERENCES profiles (id),
  event_type text NOT NULL,
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  event_details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX task_events_task_idx ON task_events (task_id, event_timestamp);

CREATE TABLE task_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES production_tasks (id),
  label text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  sequence integer NOT NULL DEFAULT 1,
  checked boolean NOT NULL DEFAULT false,
  checked_at timestamptz,
  checked_by uuid REFERENCES profiles (id)
);

CREATE TABLE quality_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  case_type text,
  workflow_template_id uuid REFERENCES workflow_templates (id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quality_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES quality_checklist_templates (id),
  label text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  sequence integer NOT NULL DEFAULT 1
);

CREATE TABLE quality_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id),
  task_id uuid NOT NULL REFERENCES production_tasks (id),
  reviewer_id uuid NOT NULL REFERENCES profiles (id),
  outcome qc_outcome NOT NULL,
  notes text NOT NULL DEFAULT '',
  failed_task_id uuid REFERENCES production_tasks (id),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quality_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_check_id uuid NOT NULL REFERENCES quality_checks (id),
  item_label text NOT NULL,
  passed boolean NOT NULL,
  note text NOT NULL DEFAULT ''
);

CREATE TABLE rework_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id),
  quality_check_id uuid NOT NULL REFERENCES quality_checks (id),
  source_task_id uuid REFERENCES production_tasks (id),
  rework_task_id uuid REFERENCES production_tasks (id),
  reason text NOT NULL,
  created_by uuid REFERENCES profiles (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES profiles (id),
  case_id uuid REFERENCES cases (id),
  task_id uuid REFERENCES production_tasks (id),
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_idx ON notifications (recipient_user_id, created_at DESC);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications (id),
  channel text NOT NULL CHECK (channel IN ('in_app', 'email')),
  delivery_status text NOT NULL CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_keys (
  idempotency_key text PRIMARY KEY,
  notification_id uuid NOT NULL REFERENCES notifications (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE business_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_date date NOT NULL UNIQUE,
  is_working_day boolean NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday integer NOT NULL UNIQUE CHECK (weekday BETWEEN 1 AND 7),
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute integer NOT NULL CHECK (end_minute > start_minute AND end_minute <= 1440),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE production_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  updated_by uuid REFERENCES profiles (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles (id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at);
CREATE INDEX audit_logs_case_meta_idx ON audit_logs ((safe_metadata->>'case_id'));

CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid REFERENCES profiles (id),
  filename text NOT NULL,
  import_status text NOT NULL CHECK (import_status IN ('preview', 'completed', 'failed')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'skip_existing',
  historical boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES import_jobs (id),
  row_number integer NOT NULL,
  source_data jsonb NOT NULL,
  validation_errors text[] NOT NULL DEFAULT ARRAY[]::text[],
  disposition text NOT NULL,
  case_id uuid REFERENCES cases (id)
);

CREATE TABLE dispatch_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL UNIQUE REFERENCES cases (id),
  packed_at timestamptz,
  packed_by uuid REFERENCES profiles (id),
  courier text NOT NULL DEFAULT '',
  tracking_number text NOT NULL DEFAULT '',
  picked_up_at timestamptz,
  dispatched_at timestamptz,
  dispatched_by uuid REFERENCES profiles (id),
  delivered_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE case_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id),
  file_name text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  uploaded_by uuid REFERENCES profiles (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_locks (
  job_name text PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  locked_by text NOT NULL
);

CREATE VIEW staff_directory WITH (security_barrier = true, security_invoker = false) AS
SELECT id, full_name, role, active, daily_capacity_minutes
FROM profiles
WHERE active = true;

CREATE FUNCTION app.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE FUNCTION app.current_role() RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = app.uid() AND active
$$;

CREATE FUNCTION app.can_view_clinic() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN role = 'technician' THEN false
      WHEN role IN ('administrator', 'front_desk') THEN true
      ELSE can_view_clinic_identity
    END
    FROM profiles
    WHERE id = app.uid() AND active
  ), false)
$$;

CREATE FUNCTION app.lead_department_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(department_id), ARRAY[]::uuid[])
  FROM department_members
  WHERE user_id = app.uid() AND active AND membership_role = 'lead'
$$;

CREATE FUNCTION app.can_read_case(p_case uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = app.uid() AND p.active AND p.role IN ('administrator', 'front_desk', 'production_manager')
  ) OR EXISTS (
    SELECT 1
    FROM profiles p
    JOIN department_members m ON m.user_id = p.id AND m.active AND m.membership_role = 'lead'
    JOIN production_tasks t ON t.department_id = m.department_id AND t.case_id = p_case
    WHERE p.id = app.uid() AND p.active AND p.role = 'department_lead'
  ) OR EXISTS (
    SELECT 1
    FROM production_tasks t
    JOIN profiles p ON p.id = app.uid() AND p.active AND p.role = 'technician'
    WHERE t.case_id = p_case AND t.assigned_user_id = app.uid()
  )
$$;

CREATE FUNCTION app.can_read_task(p_task uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM production_tasks t
    JOIN profiles p ON p.id = app.uid() AND p.active
    WHERE t.id = p_task AND (
      p.role IN ('administrator', 'front_desk', 'production_manager')
      OR (p.role = 'technician' AND t.assigned_user_id = p.id)
      OR (
        p.role = 'department_lead'
        AND t.department_id IN (
          SELECT department_id FROM department_members
          WHERE user_id = p.id AND active AND membership_role = 'lead'
        )
      )
    )
  )
$$;

CREATE FUNCTION app.assert_no_clinic_identity(p_case uuid, p_text text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record;
  haystack text := lower(coalesce(p_text, ''));
BEGIN
  IF p_case IS NULL OR haystack = '' THEN
    RETURN;
  END IF;
  SELECT ca.dentist_name, ca.clinic_name, ca.email, ca.phone, ca.billing_notes
  INTO rec
  FROM case_clinic_links l
  JOIN clinic_accounts ca ON ca.id = l.clinic_account_id
  WHERE l.case_id = p_case;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF length(rec.email) >= 5 AND position(lower(rec.email) IN haystack) > 0 THEN
    RAISE EXCEPTION 'Restricted clinic identity cannot be stored here' USING ERRCODE = '42501';
  END IF;
  IF length(regexp_replace(rec.phone, '\D', '', 'g')) >= 7
     AND position(regexp_replace(rec.phone, '\D', '', 'g') IN regexp_replace(haystack, '\D', '', 'g')) > 0 THEN
    RAISE EXCEPTION 'Restricted clinic identity cannot be stored here' USING ERRCODE = '42501';
  END IF;
  IF length(rec.clinic_name) >= 8 AND position(lower(rec.clinic_name) IN haystack) > 0 THEN
    RAISE EXCEPTION 'Restricted clinic identity cannot be stored here' USING ERRCODE = '42501';
  END IF;
  IF length(rec.dentist_name) >= 8 AND position(lower(rec.dentist_name) IN haystack) > 0 THEN
    RAISE EXCEPTION 'Restricted clinic identity cannot be stored here' USING ERRCODE = '42501';
  END IF;
  IF length(rec.billing_notes) >= 8 AND position(lower(rec.billing_notes) IN haystack) > 0 THEN
    RAISE EXCEPTION 'Restricted clinic identity cannot be stored here' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE FUNCTION app.write_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  meta jsonb := '{}'::jsonb;
  eid uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'cases' THEN
    IF NEW.overall_status IS NOT DISTINCT FROM OLD.overall_status
       AND NEW.dispatch_status IS NOT DISTINCT FROM OLD.dispatch_status
       AND NEW.priority IS NOT DISTINCT FROM OLD.priority
       AND NEW.requested_delivery_at IS NOT DISTINCT FROM OLD.requested_delivery_at
       AND NEW.schedule_feasible IS NOT DISTINCT FROM OLD.schedule_feasible THEN
      RETURN NEW;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'production_tasks' THEN
    IF NEW.task_status IS NOT DISTINCT FROM OLD.task_status
       AND NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id
       AND NEW.blocker_category IS NOT DISTINCT FROM OLD.blocker_category
       AND NEW.planned_due_at IS NOT DISTINCT FROM OLD.planned_due_at THEN
      RETURN NEW;
    END IF;
  END IF;
  eid := NEW.id;
  IF TG_TABLE_NAME = 'cases' THEN
    meta := jsonb_build_object(
      'overall_status', NEW.overall_status,
      'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.overall_status::text ELSE NULL END,
      'dispatch_status', NEW.dispatch_status,
      'priority', NEW.priority,
      'schedule_feasible', NEW.schedule_feasible
    );
  ELSIF TG_TABLE_NAME = 'production_tasks' THEN
    meta := jsonb_build_object(
      'case_id', NEW.case_id,
      'task_status', NEW.task_status,
      'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.task_status::text ELSE NULL END,
      'assigned_user_id', NEW.assigned_user_id,
      'blocker_category', NEW.blocker_category
    );
  ELSIF TG_TABLE_NAME = 'quality_checks' THEN
    meta := jsonb_build_object('case_id', NEW.case_id, 'outcome', NEW.outcome, 'task_id', NEW.task_id);
  ELSIF TG_TABLE_NAME = 'dispatch_records' THEN
    meta := jsonb_build_object('case_id', NEW.case_id, 'dispatched', NEW.dispatched_at IS NOT NULL);
  END IF;
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, safe_metadata)
  VALUES (app.uid(), lower(TG_OP) || '_' || TG_TABLE_NAME, TG_TABLE_NAME, eid, meta);
  RETURN NEW;
END $$;

CREATE FUNCTION app.guard_profile_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app.current_role() IS DISTINCT FROM 'administrator' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.can_view_clinic_identity IS DISTINCT FROM OLD.can_view_clinic_identity
       OR NEW.active IS DISTINCT FROM OLD.active
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.daily_capacity_minutes IS DISTINCT FROM OLD.daily_capacity_minutes
       OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Not allowed to change account privileges' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.role = 'technician' AND NEW.can_view_clinic_identity THEN
    RAISE EXCEPTION 'Technicians cannot be granted clinic identity' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION app.guard_case_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.requested_delivery_at IS DISTINCT FROM OLD.requested_delivery_at THEN
    IF app.current_role() IS NOT NULL AND app.current_role() NOT IN ('administrator', 'front_desk', 'production_manager') THEN
      RAISE EXCEPTION 'Not allowed to change the requested delivery date' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF (NEW.overall_status IN ('dispatched', 'delivered') OR NEW.dispatch_status IN ('dispatched', 'delivered'))
     AND (TG_OP = 'INSERT'
       OR OLD.overall_status IS DISTINCT FROM NEW.overall_status
       OR OLD.dispatch_status IS DISTINCT FROM NEW.dispatch_status) THEN
    IF NOT EXISTS (
      SELECT 1 FROM dispatch_records d
      WHERE d.case_id = NEW.id AND d.dispatched_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Case cannot be marked dispatched until the dispatch action is recorded' USING ERRCODE = '42501';
    END IF;
  END IF;
  PERFORM app.assert_no_clinic_identity(NEW.id, concat_ws(' ', NEW.patient_name, NEW.prescription, NEW.special_handling, NEW.missing_information, NEW.schedule_note));
  RETURN NEW;
END $$;

CREATE FUNCTION app.guard_task_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  scheduling boolean := current_setting('app.scheduling', true) = 'on';
BEGIN
  IF app.current_role() IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM app.assert_no_clinic_identity(NEW.case_id, concat_ws(' ', NEW.production_notes, NEW.blocked_reason, NEW.pause_reason, NEW.technical_instructions));
  IF app.current_role() NOT IN ('administrator', 'production_manager') AND NOT scheduling THEN
    IF NEW.planned_start_at IS DISTINCT FROM OLD.planned_start_at
       OR NEW.planned_due_at IS DISTINCT FROM OLD.planned_due_at
       OR NEW.labor_due_at IS DISTINCT FROM OLD.labor_due_at THEN
      RAISE EXCEPTION 'Not allowed to change production deadlines' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF app.current_role() = 'technician' THEN
    IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id
       OR NEW.case_id IS DISTINCT FROM OLD.case_id
       OR NEW.department_id IS DISTINCT FROM OLD.department_id
       OR NEW.workflow_stage_id IS DISTINCT FROM OLD.workflow_stage_id
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.work_minutes IS DISTINCT FROM OLD.work_minutes
       OR NEW.elapsed_minutes IS DISTINCT FROM OLD.elapsed_minutes
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.requires_approval IS DISTINCT FROM OLD.requires_approval
       OR NEW.is_quality_gate IS DISTINCT FROM OLD.is_quality_gate
       OR NEW.is_dispatch_stage IS DISTINCT FROM OLD.is_dispatch_stage
       OR NEW.technical_instructions IS DISTINCT FROM OLD.technical_instructions THEN
      RAISE EXCEPTION 'Not allowed to change task assignment or schedule' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF app.current_role() = 'technician' AND OLD.assigned_user_id IS DISTINCT FROM app.uid() THEN
    RAISE EXCEPTION 'Not allowed to update an unassigned task' USING ERRCODE = '42501';
  END IF;
  IF app.current_role() = 'department_lead' AND NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM department_members m
      WHERE m.department_id = OLD.department_id AND m.user_id = NEW.assigned_user_id AND m.active
    ) OR OLD.department_id <> ALL (app.lead_department_ids()) THEN
      RAISE EXCEPTION 'Assignee is outside your department' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF app.current_role() = 'front_desk' THEN
    IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id
       OR NEW.task_status IS DISTINCT FROM OLD.task_status
       OR (NOT scheduling AND NEW.planned_due_at IS DISTINCT FROM OLD.planned_due_at) THEN
      RAISE EXCEPTION 'Front desk cannot change production assignments or deadlines' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.task_status = 'completed' AND OLD.task_status IS DISTINCT FROM 'completed' THEN
    IF EXISTS (
      SELECT 1 FROM task_checklist_items i
      WHERE i.task_id = NEW.id AND i.required AND NOT i.checked
    ) THEN
      RAISE EXCEPTION 'Required checklist items are incomplete' USING ERRCODE = '42501';
    END IF;
    IF NEW.is_quality_gate AND NOT EXISTS (
      SELECT 1 FROM quality_checks q WHERE q.task_id = NEW.id AND q.outcome = 'approved'
    ) THEN
      RAISE EXCEPTION 'Quality control must be approved before this task can be completed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION app.copy_task_checklist() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO task_checklist_items (task_id, label, required, sequence)
  SELECT NEW.id, label, required, sequence
  FROM stage_checklist_items
  WHERE stage_id = NEW.workflow_stage_id;
  RETURN NEW;
END $$;

CREATE FUNCTION app.guard_event_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.event_details := COALESCE(NEW.event_details, '{}'::jsonb)
    - 'dentist_name' - 'clinic_name' - 'clinic_email' - 'email' - 'phone' - 'billing_notes' - 'billing';
  PERFORM app.assert_no_clinic_identity(NEW.case_id, NEW.event_details::text);
  RETURN NEW;
END $$;

CREATE FUNCTION app.guard_notification_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
     OR NEW.case_id IS DISTINCT FROM OLD.case_id
     OR NEW.task_id IS DISTINCT FROM OLD.task_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.notification_type IS DISTINCT FROM OLD.notification_type
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Notifications cannot be rewritten' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION app.next_case_number() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer;
  prefix text;
BEGIN
  IF app.current_role() IS NULL OR app.current_role() NOT IN ('administrator', 'front_desk') THEN
    RAISE EXCEPTION 'Not allowed to assign case numbers' USING ERRCODE = '42501';
  END IF;
  SELECT setting_value INTO prefix FROM production_settings WHERE setting_key = 'case_number_prefix';
  IF prefix IS NULL THEN
    prefix := 'ZN-';
  END IF;
  SELECT setting_value::integer INTO n
  FROM production_settings
  WHERE setting_key = 'next_case_number'
  FOR UPDATE;
  UPDATE production_settings
  SET setting_value = (n + 1)::text, updated_at = now()
  WHERE setting_key = 'next_case_number';
  RETURN prefix || lpad(n::text, 5, '0');
END $$;

CREATE FUNCTION app.post_notification(
  p_recipient uuid,
  p_case uuid,
  p_task uuid,
  p_type text,
  p_title text,
  p_body text,
  p_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  nid uuid;
  inserted integer;
  role app_role;
  email_on boolean;
  recipient_email boolean;
BEGIN
  role := app.current_role();
  IF role IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF char_length(coalesce(p_title, '')) < 1 OR char_length(p_title) > 200 THEN
    RAISE EXCEPTION 'Invalid notification title' USING ERRCODE = '42501';
  END IF;
  IF char_length(coalesce(p_body, '')) < 1 OR char_length(p_body) > 4000 THEN
    RAISE EXCEPTION 'Invalid notification body' USING ERRCODE = '42501';
  END IF;
  PERFORM app.assert_no_clinic_identity(p_case, p_title || ' ' || p_body);
  IF role = 'technician' THEN
    IF p_task IS NULL OR NOT EXISTS (
      SELECT 1 FROM production_tasks t WHERE t.id = p_task AND t.assigned_user_id = app.uid()
    ) THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    IF p_recipient IS DISTINCT FROM app.uid() AND NOT EXISTS (
      SELECT 1 FROM profiles r
      WHERE r.id = p_recipient AND r.active AND r.role IN ('front_desk', 'department_lead', 'production_manager', 'administrator')
    ) THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_key IS NOT NULL AND EXISTS (SELECT 1 FROM notification_keys WHERE idempotency_key = p_key) THEN
    RETURN (SELECT notification_id FROM notification_keys WHERE idempotency_key = p_key);
  END IF;
  INSERT INTO notifications (recipient_user_id, case_id, task_id, notification_type, title, body)
  VALUES (p_recipient, p_case, p_task, p_type, p_title, p_body)
  RETURNING id INTO nid;
  IF p_key IS NOT NULL THEN
    INSERT INTO notification_keys (idempotency_key, notification_id)
    VALUES (p_key, nid)
    ON CONFLICT (idempotency_key) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    IF inserted = 0 THEN
      DELETE FROM notifications WHERE id = nid;
      RETURN (SELECT notification_id FROM notification_keys WHERE idempotency_key = p_key);
    END IF;
  END IF;
  INSERT INTO notification_deliveries (notification_id, channel, delivery_status, delivered_at)
  VALUES (nid, 'in_app', 'sent', now());
  SELECT setting_value = 'true' INTO email_on FROM production_settings WHERE setting_key = 'email_notifications_enabled';
  SELECT email_notifications INTO recipient_email FROM profiles WHERE id = p_recipient AND active;
  IF coalesce(email_on, false) AND coalesce(recipient_email, false) THEN
    INSERT INTO notification_deliveries (notification_id, channel, delivery_status)
    VALUES (nid, 'email', 'pending');
  ELSE
    INSERT INTO notification_deliveries (notification_id, channel, delivery_status)
    VALUES (nid, 'email', 'skipped');
  END IF;
  RETURN nid;
END $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER departments_touch BEFORE UPDATE ON departments
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER clinic_touch BEFORE UPDATE ON clinic_accounts
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER templates_touch BEFORE UPDATE ON workflow_templates
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER cases_touch BEFORE UPDATE ON cases
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER tasks_touch BEFORE UPDATE ON production_tasks
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER dispatch_touch BEFORE UPDATE ON dispatch_records
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER profiles_guard BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION app.guard_profile_update();
CREATE TRIGGER cases_guard BEFORE INSERT OR UPDATE ON cases
FOR EACH ROW EXECUTE FUNCTION app.guard_case_update();
CREATE TRIGGER tasks_guard BEFORE UPDATE ON production_tasks
FOR EACH ROW EXECUTE FUNCTION app.guard_task_update();
CREATE TRIGGER tasks_checklist AFTER INSERT ON production_tasks
FOR EACH ROW EXECUTE FUNCTION app.copy_task_checklist();
CREATE TRIGGER case_events_guard BEFORE INSERT ON case_events
FOR EACH ROW EXECUTE FUNCTION app.guard_event_insert();
CREATE TRIGGER task_events_guard BEFORE INSERT ON task_events
FOR EACH ROW EXECUTE FUNCTION app.guard_event_insert();
CREATE TRIGGER notifications_guard BEFORE UPDATE ON notifications
FOR EACH ROW EXECUTE FUNCTION app.guard_notification_update();

CREATE TRIGGER cases_audit AFTER INSERT OR UPDATE ON cases
FOR EACH ROW EXECUTE FUNCTION app.write_audit();
CREATE TRIGGER tasks_audit AFTER INSERT OR UPDATE ON production_tasks
FOR EACH ROW EXECUTE FUNCTION app.write_audit();
CREATE TRIGGER qc_audit AFTER INSERT ON quality_checks
FOR EACH ROW EXECUTE FUNCTION app.write_audit();
CREATE TRIGGER dispatch_audit AFTER INSERT OR UPDATE ON dispatch_records
FOR EACH ROW EXECUTE FUNCTION app.write_audit();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_clinic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_check_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE rework_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles FOR SELECT TO zann_app USING (
  id = app.uid() OR app.current_role() IN ('administrator', 'front_desk', 'production_manager', 'department_lead')
);
CREATE POLICY profiles_update ON profiles FOR UPDATE TO zann_app USING (
  app.current_role() = 'administrator' OR id = app.uid()
) WITH CHECK (
  app.current_role() = 'administrator' OR id = app.uid()
);
CREATE POLICY profiles_insert ON profiles FOR INSERT TO zann_app WITH CHECK (
  app.current_role() = 'administrator'
);

CREATE POLICY departments_read ON departments FOR SELECT TO zann_app USING (app.current_role() IS NOT NULL);
CREATE POLICY departments_write ON departments FOR INSERT TO zann_app WITH CHECK (app.current_role() = 'administrator');
CREATE POLICY departments_update ON departments FOR UPDATE TO zann_app USING (app.current_role() = 'administrator') WITH CHECK (app.current_role() = 'administrator');

CREATE POLICY members_read ON department_members FOR SELECT TO zann_app USING (app.current_role() IS NOT NULL);
CREATE POLICY members_write ON department_members FOR INSERT TO zann_app WITH CHECK (app.current_role() = 'administrator');
CREATE POLICY members_update ON department_members FOR UPDATE TO zann_app USING (app.current_role() = 'administrator') WITH CHECK (app.current_role() = 'administrator');

CREATE POLICY clinic_all ON clinic_accounts FOR ALL TO zann_app USING (app.can_view_clinic()) WITH CHECK (app.can_view_clinic());
CREATE POLICY clinic_link_all ON case_clinic_links FOR ALL TO zann_app USING (app.can_view_clinic()) WITH CHECK (app.can_view_clinic());

CREATE POLICY templates_read ON workflow_templates FOR SELECT TO zann_app USING (app.current_role() IS NOT NULL);
CREATE POLICY templates_write ON workflow_templates FOR ALL TO zann_app USING (app.current_role() = 'administrator') WITH CHECK (app.current_role() = 'administrator');
CREATE POLICY stages_read ON workflow_stages FOR SELECT TO zann_app USING (app.current_role() IS NOT NULL);
CREATE POLICY stages_write ON workflow_stages FOR ALL TO zann_app USING (app.current_role() = 'administrator') WITH CHECK (app.current_role() = 'administrator');
CREATE POLICY stage_deps_read ON stage_dependencies FOR SELECT TO zann_app USING (app.current_role() IS NOT NULL);
CREATE POLICY stage_deps_write ON stage_dependencies FOR ALL TO zann_app USING (app.current_role() = 'administrator') WITH CHECK (app.current_role() = 'administrator');
CREATE POLICY stage_checks_read ON stage_checklist_items FOR SELECT TO zann_app USING (app.current_role() IS NOT NULL);
CREATE POLICY stage_checks_write ON stage_checklist_items FOR ALL TO zann_app USING (app.current_role() = 'administrator') WITH CHECK (app.current_role() = 'administrator');

CREATE POLICY cases_select ON cases FOR SELECT TO zann_app USING (app.can_read_case(id));
CREATE POLICY cases_insert ON cases FOR INSERT TO zann_app WITH CHECK (app.current_role() IN ('administrator', 'front_desk'));
CREATE POLICY cases_update ON cases FOR UPDATE TO zann_app USING (
  app.current_role() IN ('administrator', 'front_desk', 'production_manager')
) WITH CHECK (
  app.current_role() IN ('administrator', 'front_desk', 'production_manager')
);

CREATE POLICY units_select ON case_units FOR SELECT TO zann_app USING (app.can_read_case(case_id));
CREATE POLICY units_write ON case_units FOR ALL TO zann_app USING (
  app.current_role() IN ('administrator', 'front_desk')
) WITH CHECK (
  app.current_role() IN ('administrator', 'front_desk')
);

CREATE POLICY case_events_select ON case_events FOR SELECT TO zann_app USING (app.can_read_case(case_id));
CREATE POLICY case_events_insert ON case_events FOR INSERT TO zann_app WITH CHECK (app.can_read_case(case_id));

CREATE POLICY tasks_select ON production_tasks FOR SELECT TO zann_app USING (
  app.current_role() IN ('administrator', 'front_desk', 'production_manager')
  OR app.can_read_task(id)
);
CREATE POLICY tasks_insert ON production_tasks FOR INSERT TO zann_app WITH CHECK (
  app.current_role() IN ('administrator', 'production_manager')
  OR (app.current_role() = 'department_lead' AND department_id = ANY (app.lead_department_ids()))
  OR (app.current_role() IN ('front_desk', 'administrator') AND current_setting('app.scheduling', true) = 'on')
);
CREATE POLICY tasks_update ON production_tasks FOR UPDATE TO zann_app USING (app.can_read_task(id)) WITH CHECK (app.can_read_task(id));

CREATE POLICY task_deps_select ON task_dependencies FOR SELECT TO zann_app USING (
  app.can_read_task(predecessor_task_id) OR app.can_read_task(successor_task_id)
);
CREATE POLICY task_deps_insert ON task_dependencies FOR INSERT TO zann_app WITH CHECK (
  current_setting('app.scheduling', true) = 'on'
  OR app.current_role() IN ('administrator', 'production_manager', 'department_lead')
);

CREATE POLICY task_events_select ON task_events FOR SELECT TO zann_app USING (app.can_read_task(task_id));
CREATE POLICY task_events_insert ON task_events FOR INSERT TO zann_app WITH CHECK (app.can_read_task(task_id));

CREATE POLICY checklist_select ON task_checklist_items FOR SELECT TO zann_app USING (app.can_read_task(task_id));
CREATE POLICY checklist_update ON task_checklist_items FOR UPDATE TO zann_app USING (app.can_read_task(task_id)) WITH CHECK (app.can_read_task(task_id));

CREATE POLICY qc_templates_read ON quality_checklist_templates FOR SELECT TO zann_app USING (app.current_role() IS NOT NULL);
CREATE POLICY qc_templates_write ON quality_checklist_templates FOR ALL TO zann_app USING (app.current_role() = 'administrator') WITH CHECK (app.current_role() = 'administrator');
CREATE POLICY qc_items_read ON quality_checklist_items FOR SELECT TO zann_app USING (app.current_role() IS NOT NULL);
CREATE POLICY qc_items_write ON quality_checklist_items FOR ALL TO zann_app USING (app.current_role() = 'administrator') WITH CHECK (app.current_role() = 'administrator');

CREATE POLICY qc_select ON quality_checks FOR SELECT TO zann_app USING (app.can_read_case(case_id));
CREATE POLICY qc_insert ON quality_checks FOR INSERT TO zann_app WITH CHECK (
  app.can_read_task(task_id) AND app.current_role() <> 'front_desk'
);
CREATE POLICY qc_results_select ON quality_check_results FOR SELECT TO zann_app USING (
  EXISTS (SELECT 1 FROM quality_checks q WHERE q.id = quality_check_id AND app.can_read_case(q.case_id))
);
CREATE POLICY qc_results_insert ON quality_check_results FOR INSERT TO zann_app WITH CHECK (
  EXISTS (SELECT 1 FROM quality_checks q WHERE q.id = quality_check_id AND app.can_read_task(q.task_id))
);

CREATE POLICY rework_select ON rework_orders FOR SELECT TO zann_app USING (app.can_read_case(case_id));
CREATE POLICY rework_insert ON rework_orders FOR INSERT TO zann_app WITH CHECK (
  app.current_role() IN ('administrator', 'production_manager', 'department_lead', 'technician')
  AND app.can_read_case(case_id)
);

CREATE POLICY notifications_select ON notifications FOR SELECT TO zann_app USING (
  recipient_user_id = app.uid() OR app.current_role() = 'administrator'
);
CREATE POLICY notifications_update ON notifications FOR UPDATE TO zann_app USING (
  recipient_user_id = app.uid()
) WITH CHECK (
  recipient_user_id = app.uid()
);

CREATE POLICY deliveries_select ON notification_deliveries FOR SELECT TO zann_app USING (
  EXISTS (
    SELECT 1 FROM notifications n
    WHERE n.id = notification_id AND (n.recipient_user_id = app.uid() OR app.current_role() = 'administrator')
  )
);

CREATE POLICY calendar_read ON business_calendar FOR SELECT TO zann_app USING (app.current_role() IS NOT NULL);
CREATE POLICY calendar_write ON business_calendar FOR ALL TO zann_app USING (app.current_role() = 'administrator') WITH CHECK (app.current_role() = 'administrator');
CREATE POLICY hours_read ON business_hours FOR SELECT TO zann_app USING (app.current_role() IS NOT NULL);
CREATE POLICY hours_write ON business_hours FOR ALL TO zann_app USING (app.current_role() = 'administrator') WITH CHECK (app.current_role() = 'administrator');

CREATE POLICY settings_read ON production_settings FOR SELECT TO zann_app USING (app.current_role() IS NOT NULL);
CREATE POLICY settings_write ON production_settings FOR UPDATE TO zann_app USING (app.current_role() = 'administrator') WITH CHECK (app.current_role() = 'administrator');

CREATE POLICY audit_read ON audit_logs FOR SELECT TO zann_app USING (
  app.current_role() IN ('administrator', 'production_manager')
);

CREATE POLICY imports_all ON import_jobs FOR ALL TO zann_app USING (
  app.current_role() IN ('administrator', 'front_desk')
) WITH CHECK (
  app.current_role() IN ('administrator', 'front_desk')
);
CREATE POLICY import_rows_all ON import_rows FOR ALL TO zann_app USING (
  app.current_role() IN ('administrator', 'front_desk')
) WITH CHECK (
  app.current_role() IN ('administrator', 'front_desk')
);

CREATE POLICY dispatch_select ON dispatch_records FOR SELECT TO zann_app USING (app.can_read_case(case_id));
CREATE POLICY dispatch_write ON dispatch_records FOR ALL TO zann_app USING (
  app.current_role() IN ('administrator', 'front_desk', 'production_manager')
) WITH CHECK (
  app.current_role() IN ('administrator', 'front_desk', 'production_manager')
);

CREATE POLICY attachments_select ON case_attachments FOR SELECT TO zann_app USING (app.can_read_case(case_id));
CREATE POLICY attachments_insert ON case_attachments FOR INSERT TO zann_app WITH CHECK (
  app.current_role() IN ('administrator', 'front_desk') AND app.can_read_case(case_id)
);

CREATE POLICY jobs_admin ON job_locks FOR ALL TO zann_app USING (
  app.current_role() = 'administrator'
) WITH CHECK (
  app.current_role() = 'administrator'
);

GRANT USAGE ON SCHEMA public, app TO zann_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO zann_app;
GRANT SELECT ON staff_directory TO zann_app;

REVOKE ALL ON local_credentials FROM zann_app;
REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM zann_app;
REVOKE INSERT, UPDATE, DELETE ON notification_keys FROM zann_app;
REVOKE INSERT, UPDATE, DELETE ON notifications FROM zann_app;
GRANT UPDATE (read_at) ON notifications TO zann_app;
REVOKE UPDATE, DELETE ON case_events FROM zann_app;
REVOKE UPDATE, DELETE ON task_events FROM zann_app;
REVOKE INSERT, UPDATE, DELETE ON notification_deliveries FROM zann_app;
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM zann_app;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO zann_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
