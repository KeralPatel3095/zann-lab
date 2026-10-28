GRANT UPDATE ON notification_deliveries TO zann_app;

CREATE POLICY deliveries_update ON notification_deliveries
FOR UPDATE TO zann_app
USING (app.current_role() = 'administrator')
WITH CHECK (app.current_role() = 'administrator');
