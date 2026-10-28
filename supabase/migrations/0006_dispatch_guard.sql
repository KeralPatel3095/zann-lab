CREATE OR REPLACE FUNCTION app.guard_case_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.requested_delivery_at IS DISTINCT FROM OLD.requested_delivery_at THEN
    IF app.current_role() IS NOT NULL AND app.current_role() NOT IN ('administrator', 'front_desk', 'production_manager') THEN
      RAISE EXCEPTION 'Not allowed to change the requested delivery date' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF (NEW.overall_status IN ('dispatched', 'delivered') OR NEW.dispatch_status IN ('dispatched', 'delivered'))
     AND (TG_OP = 'INSERT'
       OR OLD.overall_status IS DISTINCT FROM NEW.overall_status
       OR OLD.dispatch_status IS DISTINCT FROM NEW.dispatch_status) THEN
    IF NOT EXISTS (
      SELECT 1 FROM dispatch_records d
      WHERE d.case_id = NEW.id AND d.dispatched_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Case cannot be marked dispatched until the dispatch action is recorded' USING ERRCODE = '42501';
    END IF;
  END IF;
  PERFORM app.assert_no_clinic_identity(NEW.id, concat_ws(' ', NEW.patient_name, NEW.prescription, NEW.special_handling, NEW.missing_information, NEW.schedule_note));
  RETURN NEW;
END $$;
