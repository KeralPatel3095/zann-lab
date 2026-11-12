-- Negar can take back a finish from today if she marked the case by mistake.
-- Older finishes stay on the production record. Ana, Keral, and Parneet cannot delete them.

GRANT DELETE ON case_bench_finishes TO zann_app;

CREATE POLICY bench_finish_delete ON case_bench_finishes FOR DELETE TO zann_app USING (
  finished_by = app.uid()
  AND work_date = (now() at time zone 'America/Toronto')::date
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = app.uid()
      AND p.active
      AND p.role = 'technician'
  )
);
