-- Negar marks a case finished once. The row is the production record.
-- Open boards hide these cases so they are not listed twice.
-- Only Negar, and Ana, Keral, and Parneet, can read the rows.

CREATE TABLE case_bench_finishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL UNIQUE REFERENCES cases (id),
  finished_by uuid NOT NULL REFERENCES profiles (id),
  finished_at timestamptz NOT NULL DEFAULT now(),
  work_date date NOT NULL
);

CREATE INDEX case_bench_finishes_day_idx ON case_bench_finishes (finished_by, work_date);

ALTER TABLE case_bench_finishes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON case_bench_finishes TO zann_app;

CREATE POLICY bench_finish_select ON case_bench_finishes FOR SELECT TO zann_app USING (
  finished_by = app.uid()
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

CREATE POLICY bench_finish_insert ON case_bench_finishes FOR INSERT TO zann_app WITH CHECK (
  finished_by = app.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = app.uid()
      AND p.active
      AND p.role = 'technician'
  )
);

-- Open-list queries must see that a finish exists even when the reader cannot open the row.
CREATE FUNCTION app.case_is_bench_finished(p_case uuid) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM case_bench_finishes WHERE case_id = p_case)
$$;

GRANT EXECUTE ON FUNCTION app.case_is_bench_finished(uuid) TO zann_app;
