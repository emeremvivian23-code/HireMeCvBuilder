/*
# Create user_activities table for CV, resume and cover letter history

1. New Tables
- `user_activities`
  - `id` (uuid, primary key): unique activity id.
  - `user_id` (uuid, not null, defaults to the signed-in user): owner of the document.
  - `type` (text): one of 'cv', 'resume', 'cover-letter'.
  - `title` (text): name shown on the dashboard, usually the person's full name.
  - `downloads` (integer, default 0): number of PDF downloads for this document.
  - `last_downloaded_at` (timestamptz, nullable): time of the most recent PDF download.
  - `created_at` (timestamptz): when the document was generated.

2. New Functions
- `record_activity_download(p_activity_id uuid)`: increments `downloads` and sets `last_downloaded_at` for a row the caller owns. Runs as the caller so RLS still applies.

3. Security
- Row level security enabled on `user_activities`.
- Grants: SELECT, INSERT, DELETE on the table to `authenticated`; UPDATE restricted to `downloads` and `last_downloaded_at` columns only.
- Four separate owner-scoped policies (select, insert, update, delete) that check `auth.uid() = user_id`.
- The download function is executable by `authenticated` only.

4. Important Notes
- No existing data is changed or removed.
- Rows cascade-delete when the owning account is deleted.
- Migration is idempotent and safe to re-run.
*/

CREATE TABLE IF NOT EXISTS user_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('cv', 'resume', 'cover-letter')),
  title text NOT NULL DEFAULT '',
  downloads integer NOT NULL DEFAULT 0 CHECK (downloads >= 0),
  last_downloaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_activities_user_created_idx
  ON user_activities (user_id, created_at DESC);

ALTER TABLE user_activities ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON user_activities TO authenticated;
GRANT UPDATE (downloads, last_downloaded_at) ON user_activities TO authenticated;

DROP POLICY IF EXISTS "select_own_activities" ON user_activities;
CREATE POLICY "select_own_activities" ON user_activities FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_activities" ON user_activities;
CREATE POLICY "insert_own_activities" ON user_activities FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_activities" ON user_activities;
CREATE POLICY "update_own_activities" ON user_activities FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_activities" ON user_activities;
CREATE POLICY "delete_own_activities" ON user_activities FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION record_activity_download(p_activity_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  new_count integer;
BEGIN
  UPDATE user_activities
  SET downloads = downloads + 1, last_downloaded_at = now()
  WHERE id = p_activity_id AND user_id = auth.uid()
  RETURNING downloads INTO new_count;

  IF new_count IS NULL THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  RETURN new_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION record_activity_download(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_activity_download(uuid) TO authenticated;
