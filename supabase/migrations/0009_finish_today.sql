CREATE OR REPLACE FUNCTION app.cases_due_on(p_day date)
RETURNS TABLE (
  id uuid,
  case_number text,
  patient_name text,
  pan_number text,
  case_type text,
  requested_delivery_at timestamptz,
  overall_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.case_number, c.patient_name, c.pan_number, c.case_type,
         c.requested_delivery_at, c.overall_status::text
  FROM cases c
  WHERE c.overall_status NOT IN ('dispatched', 'delivered', 'cancelled')
    AND (c.requested_delivery_at AT TIME ZONE 'America/Toronto')::date = p_day
  ORDER BY c.case_number
$$;

REVOKE ALL ON FUNCTION app.cases_due_on(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.cases_due_on(date) TO zann_app;
