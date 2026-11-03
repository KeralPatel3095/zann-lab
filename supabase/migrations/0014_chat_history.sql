ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS sender_name text NOT NULL DEFAULT '';

UPDATE chat_messages m
SET sender_name = coalesce(p.full_name, 'Staff')
FROM profiles p
WHERE p.id = m.sender_user_id
  AND (m.sender_name = '' OR m.sender_name IS NULL);

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

  SELECT full_name INTO sender_name FROM profiles WHERE id = sender;
  sender_name := coalesce(nullif(btrim(sender_name), ''), 'Staff');

  INSERT INTO chat_messages (sender_user_id, sender_name, body)
  VALUES (sender, sender_name, cleaned)
  RETURNING id INTO mid;

  note_title := 'New team chat message';
  note_body := sender_name || ': ' || left(cleaned, 180);

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

CREATE OR REPLACE FUNCTION app.list_team_chat(p_limit integer DEFAULT 500)
RETURNS TABLE (
  id uuid,
  body text,
  created_at timestamptz,
  sender_user_id uuid,
  sender_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.body, m.created_at, m.sender_user_id,
         coalesce(nullif(btrim(m.sender_name), ''), 'Staff') as sender_name
  FROM chat_messages m
  WHERE app.current_role() IS NOT NULL
  ORDER BY m.created_at ASC
  LIMIT greatest(1, least(coalesce(p_limit, 500), 2000));
$$;

REVOKE ALL ON FUNCTION app.list_team_chat(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_team_chat(integer) TO zann_app;
