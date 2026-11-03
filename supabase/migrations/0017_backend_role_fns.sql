CREATE OR REPLACE FUNCTION app.current_role() RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN role = 'backend' THEN 'administrator'::app_role
    ELSE role
  END
  FROM profiles
  WHERE id = app.uid() AND active
$$;

CREATE OR REPLACE FUNCTION app.can_view_clinic() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN role = 'technician' THEN false
      WHEN role IN ('administrator', 'backend', 'front_desk') THEN true
      ELSE can_view_clinic_identity
    END
    FROM profiles
    WHERE id = app.uid() AND active
  ), false)
$$;
