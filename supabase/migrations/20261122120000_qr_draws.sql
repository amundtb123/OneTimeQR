-- Draws: a series where a few random codes hold a prize, e.g. a raffle at a party.
-- The series' own content is what most codes show ("no prize"); qr_series.prizes holds the
-- prizes' content and files (encrypted by the client, like the series' own content), and each
-- code's variant says what it shows: 0 = the series' own content, n = prizes[n - 1].
-- A used draw code is kept until the series ends, so the board can show which codes are gone
-- and "already used" can be told apart from a code that never existed. It holds no content of
-- its own. Ordinary drops and series are cleaned up exactly as before.
-- Safe to re-run.

ALTER TABLE public.qr_series ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'series' CHECK (kind IN ('series', 'draw'));
-- [{ "label": text|null, "count": int, "text_content": text|null, "url_content": text|null, "files": [...] }]
ALTER TABLE public.qr_series ADD COLUMN IF NOT EXISTS prizes jsonb NOT NULL DEFAULT '[]'::jsonb;
-- SHA-256 of the secret in the link a screen shows the board with, without logging in
ALTER TABLE public.qr_series ADD COLUMN IF NOT EXISTS display_token_hash text;

ALTER TABLE public.qr_drops ADD COLUMN IF NOT EXISTS variant smallint CHECK (variant >= 0);

-- A series' files are queued when it goes, now including its prizes' files
CREATE OR REPLACE FUNCTION public.qr_series_queue_files()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO storage_deletion_queue (path)
  SELECT f->>'path'
    FROM (
      SELECT jsonb_array_elements(OLD.files) AS f
      UNION ALL
      SELECT jsonb_array_elements(coalesce(p->'files', '[]'::jsonb)) FROM jsonb_array_elements(OLD.prizes) AS p
    ) all_files
   WHERE f->>'path' IS NOT NULL
  ON CONFLICT (path) DO NOTHING;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS qr_series_queue_files ON public.qr_series;
CREATE TRIGGER qr_series_queue_files
  AFTER DELETE ON public.qr_series
  FOR EACH ROW EXECUTE FUNCTION public.qr_series_queue_files();

-- Same as before, except that a used-up draw code (variant set) stays until it expires, which
-- for a draw code is when its series ends. Everything else is deleted on the same terms as before.
CREATE OR REPLACE FUNCTION public.cleanup_expired_qr_drops(p_view_ttl_ms bigint DEFAULT 900000)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
  v_series integer;
BEGIN
  DELETE FROM qr_drops d
   WHERE d.expires_at < now()
      OR (d.variant IS NULL
          AND ((d.expiry_type = 'scan' AND d.scan_count >= 1)
               OR (d.max_scans IS NOT NULL AND d.scan_count >= d.max_scans)
               OR (d.max_downloads IS NOT NULL AND d.download_count >= d.max_downloads))
          AND (d.last_opened_at IS NULL OR d.last_opened_at + p_view_ttl_ms * interval '1 millisecond' < now()));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM qr_series WHERE expires_at < now();
  GET DIAGNOSTICS v_series = ROW_COUNT;

  DELETE FROM qr_tokens WHERE expires_at < now();
  DELETE FROM qr_password_attempts WHERE expires_at < now();
  DELETE FROM rate_limits WHERE expires_at < now();
  RETURN v_deleted + v_series;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_expired_qr_drops(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_qr_drops(bigint) TO service_role;

-- The board of a draw: every opened code as [number, variant], in the order they were opened.
-- Codes not listed have not been opened. One call, so draws of thousands of codes need no paging.
CREATE OR REPLACE FUNCTION public.qr_draw_board(p_series_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(d.series_number, d.variant) ORDER BY d.last_opened_at, d.series_number), '[]'::jsonb)
    FROM qr_drops d
   WHERE d.series_id = p_series_id
     AND d.variant IS NOT NULL
     AND d.scan_count > 0;
$$;
REVOKE ALL ON FUNCTION public.qr_draw_board(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_draw_board(uuid) TO service_role;
