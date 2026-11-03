-- Staff only see their own notifications (admins were seeing every recipient's copy of the same chat alert).
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
  FOR SELECT TO zann_app
  USING (recipient_user_id = app.uid());

DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
  FOR UPDATE TO zann_app
  USING (recipient_user_id = app.uid())
  WITH CHECK (recipient_user_id = app.uid());

DROP POLICY IF EXISTS deliveries_select ON notification_deliveries;
CREATE POLICY deliveries_select ON notification_deliveries
  FOR SELECT TO zann_app
  USING (
    EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.id = notification_id
        AND n.recipient_user_id = app.uid()
    )
  );
