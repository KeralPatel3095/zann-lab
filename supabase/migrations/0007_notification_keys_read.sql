CREATE POLICY notification_keys_read ON notification_keys FOR SELECT TO zann_app USING (
  app.current_role() = 'administrator'
  OR EXISTS (
    SELECT 1 FROM notifications n
    WHERE n.id = notification_id AND n.recipient_user_id = app.uid()
  )
);
