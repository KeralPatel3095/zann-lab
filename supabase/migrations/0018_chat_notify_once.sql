-- Keep only one unread chat alert per person instead of one per message.
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
    DELETE FROM notification_deliveries d
    USING notifications n
    WHERE d.notification_id = n.id
      AND n.recipient_user_id = recipient.id
      AND n.notification_type = 'chat_message'
      AND n.read_at IS NULL;

    DELETE FROM notification_keys k
    USING notifications n
    WHERE k.notification_id = n.id
      AND n.recipient_user_id = recipient.id
      AND n.notification_type = 'chat_message'
      AND n.read_at IS NULL;

    DELETE FROM notifications
    WHERE recipient_user_id = recipient.id
      AND notification_type = 'chat_message'
      AND read_at IS NULL;

    INSERT INTO notifications (recipient_user_id, case_id, task_id, notification_type, title, body)
    VALUES (recipient.id, NULL, NULL, 'chat_message', note_title, note_body)
    RETURNING id INTO nid;

    INSERT INTO notification_keys (idempotency_key, notification_id)
    VALUES ('chat:open:' || recipient.id::text, nid)
    ON CONFLICT (idempotency_key) DO UPDATE SET notification_id = excluded.notification_id;

    INSERT INTO notification_deliveries (notification_id, channel, delivery_status, delivered_at)
    VALUES (nid, 'in_app', 'sent', now());

    INSERT INTO notification_deliveries (notification_id, channel, delivery_status)
    VALUES (nid, 'email', 'skipped');
  END LOOP;

  RETURN mid;
END;
$$;

-- Clear stacked unread chat alerts already in the inbox (keep newest per person).
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY recipient_user_id ORDER BY created_at DESC) AS rank
  FROM notifications
  WHERE notification_type = 'chat_message'
    AND read_at IS NULL
)
UPDATE notifications n
SET read_at = now()
FROM ranked r
WHERE n.id = r.id
  AND r.rank > 1;
