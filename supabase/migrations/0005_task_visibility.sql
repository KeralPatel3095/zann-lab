DROP POLICY tasks_select ON production_tasks;
CREATE POLICY tasks_select ON production_tasks FOR SELECT TO zann_app USING (
  app.current_role() IN ('administrator', 'front_desk', 'production_manager')
  OR app.can_read_task(id)
);
