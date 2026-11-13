-- A technician's own note for the day, plus cases they worked on or started.
-- Finished cases stay in case_bench_finishes. This report is the extra record.

CREATE TABLE daily_production_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES profiles (id),
  work_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (technician_id, work_date)
);

CREATE TABLE daily_production_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES daily_production_reports (id) ON DELETE CASCADE,
  case_id uuid REFERENCES cases (id),
  case_number text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('worked', 'started')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX daily_production_items_report_idx ON daily_production_items (report_id, created_at);

ALTER TABLE daily_production_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_production_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON daily_production_reports TO zann_app;
GRANT SELECT, INSERT, DELETE ON daily_production_items TO zann_app;

CREATE POLICY daily_report_select ON daily_production_reports FOR SELECT TO zann_app USING (
  technician_id = app.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = app.uid()
      AND p.active
      AND lower(p.email) IN (
        'keral.patel@zann-lab.test',
        'ana.bogdanovic@zann-lab.test',
        'parneet.kaur@zann-lab.test'
      )
  )
);

CREATE POLICY daily_report_insert ON daily_production_reports FOR INSERT TO zann_app WITH CHECK (
  technician_id = app.uid()
  AND work_date = (now() at time zone 'America/Toronto')::date
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = app.uid() AND p.active AND p.role = 'technician'
  )
);

CREATE POLICY daily_report_update ON daily_production_reports FOR UPDATE TO zann_app
USING (
  technician_id = app.uid()
  AND work_date = (now() at time zone 'America/Toronto')::date
)
WITH CHECK (
  technician_id = app.uid()
  AND work_date = (now() at time zone 'America/Toronto')::date
);

CREATE POLICY daily_item_select ON daily_production_items FOR SELECT TO zann_app USING (
  EXISTS (
    SELECT 1 FROM daily_production_reports r
    WHERE r.id = report_id
      AND (
        r.technician_id = app.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = app.uid()
            AND p.active
            AND lower(p.email) IN (
              'keral.patel@zann-lab.test',
              'ana.bogdanovic@zann-lab.test',
              'parneet.kaur@zann-lab.test'
            )
        )
      )
  )
);

CREATE POLICY daily_item_insert ON daily_production_items FOR INSERT TO zann_app WITH CHECK (
  EXISTS (
    SELECT 1 FROM daily_production_reports r
    JOIN profiles p ON p.id = app.uid()
    WHERE r.id = report_id
      AND r.technician_id = app.uid()
      AND r.work_date = (now() at time zone 'America/Toronto')::date
      AND p.active
      AND p.role = 'technician'
  )
);

CREATE POLICY daily_item_delete ON daily_production_items FOR DELETE TO zann_app USING (
  EXISTS (
    SELECT 1 FROM daily_production_reports r
    WHERE r.id = report_id
      AND r.technician_id = app.uid()
      AND r.work_date = (now() at time zone 'America/Toronto')::date
  )
);
