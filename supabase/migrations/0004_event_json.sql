CREATE OR REPLACE FUNCTION app.guard_event_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.event_details IS NULL OR jsonb_typeof(NEW.event_details) <> 'object' THEN
    NEW.event_details := '{}'::jsonb;
  END IF;
  NEW.event_details := NEW.event_details
    - 'dentist_name' - 'clinic_name' - 'clinic_email' - 'email' - 'phone' - 'billing_notes' - 'billing';
  PERFORM app.assert_no_clinic_identity(NEW.case_id, NEW.event_details::text);
  RETURN NEW;
END $$;
