CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id uuid NOT NULL REFERENCES profiles (id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_created_idx ON chat_messages (created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_messages_select ON chat_messages
  FOR SELECT TO zann_app
  USING (app.current_role() IS NOT NULL);

CREATE POLICY chat_messages_insert ON chat_messages
  FOR INSERT TO zann_app
  WITH CHECK (sender_user_id = app.uid() AND app.current_role() IS NOT NULL);

REVOKE UPDATE, DELETE ON chat_messages FROM zann_app;
GRANT SELECT, INSERT ON chat_messages TO zann_app;

CREATE OR REPLACE FUNCTION app.send_team_chat(p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mid uuid;
  sender uuid := app.uid();
  cleaned text := btrim(coalesce(p_body, ''));
  recipient record;
  nid uuid;
  sender_name text;
  note_title text;
  note_body text;
BEGIN
  IF sender IS NULL OR app.current_role() IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF char_length(cleaned) < 1 OR char_length(cleaned) > 2000 THEN
    RAISE EXCEPTION 'Enter a message up to 2000 characters.';
  END IF;

  INSERT INTO chat_messages (sender_user_id, body)
  VALUES (sender, cleaned)
  RETURNING id INTO mid;

  SELECT full_name INTO sender_name FROM profiles WHERE id = sender;
  note_title := 'New team chat message';
  note_body := coalesce(sender_name, 'Someone') || ': ' || left(cleaned, 180);

  FOR recipient IN
    SELECT id FROM profiles WHERE active AND id IS DISTINCT FROM sender
  LOOP
    INSERT INTO notifications (recipient_user_id, case_id, task_id, notification_type, title, body)
    VALUES (recipient.id, NULL, NULL, 'chat_message', note_title, note_body)
    RETURNING id INTO nid;

    INSERT INTO notification_keys (idempotency_key, notification_id)
    VALUES ('chat:' || mid::text || ':' || recipient.id::text, nid)
    ON CONFLICT (idempotency_key) DO NOTHING;

    INSERT INTO notification_deliveries (notification_id, channel, delivery_status, delivered_at)
    VALUES (nid, 'in_app', 'sent', now());

    INSERT INTO notification_deliveries (notification_id, channel, delivery_status)
    VALUES (nid, 'email', 'skipped');
  END LOOP;

  RETURN mid;
END;
$$;

REVOKE ALL ON FUNCTION app.send_team_chat(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.send_team_chat(text) TO zann_app;
