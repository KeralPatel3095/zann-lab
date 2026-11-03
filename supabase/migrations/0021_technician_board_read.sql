-- Technicians can see Today / Week ahead production boards (no clinic identity).
CREATE OR REPLACE FUNCTION app.can_read_case(p_case uuid) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = app.uid()
      AND p.active
      AND p.role IN ('administrator', 'backend', 'front_desk', 'production_manager')
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
  ) OR EXISTS (
    SELECT 1
    FROM profiles p
    JOIN cases c ON c.id = p_case
    WHERE p.id = app.uid()
      AND p.active
      AND p.role = 'technician'
      AND NOT c.historical
      AND c.overall_status IN (
        'in_production',
        'ready_for_production',
        'awaiting_quality_control',
        'ready_for_dispatch'
      )
  )
$$;
