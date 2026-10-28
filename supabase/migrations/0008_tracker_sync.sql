ALTER TABLE cases ADD COLUMN tracker_fingerprint text NOT NULL DEFAULT '';

CREATE TABLE tracker_pickups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_name text NOT NULL CHECK (char_length(sheet_name) BETWEEN 1 AND 80),
  pickup_on date,
  detail text NOT NULL CHECK (char_length(detail) BETWEEN 1 AND 500),
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tracker_pickups_fingerprint_idx ON tracker_pickups (fingerprint);

ALTER TABLE tracker_pickups ENABLE ROW LEVEL SECURITY;

CREATE POLICY tracker_pickups_identity ON tracker_pickups
  FOR ALL TO zann_app
  USING (app.can_view_clinic())
  WITH CHECK (app.can_view_clinic());

GRANT SELECT, INSERT, UPDATE, DELETE ON tracker_pickups TO zann_app;
