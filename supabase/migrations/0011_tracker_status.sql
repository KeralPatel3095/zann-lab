ALTER TABLE cases ADD COLUMN tracker_status text NOT NULL DEFAULT '';

DROP FUNCTION IF EXISTS app.cases_due_between(date, date);

CREATE FUNCTION app.cases_due_between(p_start date, p_end date)
RETURNS TABLE (
  id uuid,
  case_number text,
  patient_name text,
  pan_number text,
  case_type text,
  requested_delivery_at timestamptz,
  overall_status text,
  tracker_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.case_number, c.patient_name, c.pan_number, c.case_type,
         c.requested_delivery_at, c.overall_status::text, c.tracker_status
  FROM cases c
  WHERE c.overall_status = 'in_production'
    AND NOT c.historical
    AND (c.requested_delivery_at AT TIME ZONE 'America/Toronto')::date BETWEEN p_start AND p_end
  ORDER BY (c.requested_delivery_at AT TIME ZONE 'America/Toronto')::date, c.case_number
$$;

REVOKE ALL ON FUNCTION app.cases_due_between(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.cases_due_between(date, date) TO zann_app;
