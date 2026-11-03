-- Series: one key made into many unique codes, e.g. one per printed book.
-- The series holds the content and files once; each code is a row in qr_drops with its own
-- counters, pointing at the series. A code's lifetime starts when it is first scanned, and
-- the whole series (codes and files) goes when the series' own end date passes.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.qr_series (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  content_type text NOT NULL,
  text_content text,
  url_content text,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  code_count integer NOT NULL CHECK (code_count > 0),
  max_scans integer CHECK (max_scans > 0),
  lifetime_ms bigint NOT NULL CHECK (lifetime_ms > 0),
  view_only boolean NOT NULL DEFAULT false,
  qr_style jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qr_series_user_created_idx ON public.qr_series (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS qr_series_expires_idx ON public.qr_series (expires_at);

-- A code's content lives on its series; lifetime_ms set = expires_at counts from the first scan
ALTER TABLE public.qr_drops ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.qr_series(id) ON DELETE CASCADE;
ALTER TABLE public.qr_drops ADD COLUMN IF NOT EXISTS series_number integer;
ALTER TABLE public.qr_drops ADD COLUMN IF NOT EXISTS lifetime_ms bigint CHECK (lifetime_ms > 0);
CREATE INDEX IF NOT EXISTS qr_drops_series_idx ON public.qr_drops (series_id, series_number) WHERE series_id IS NOT NULL;

ALTER TABLE public.qr_series ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_series FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.qr_series TO service_role;

-- The series' files are queued the same way a drop's are; codes have no files of their own
DROP TRIGGER IF EXISTS qr_series_queue_files ON public.qr_series;
CREATE TRIGGER qr_series_queue_files
  AFTER DELETE ON public.qr_series
  FOR EACH ROW EXECUTE FUNCTION public.qr_drops_queue_files();

-- Same as before, plus: the first scan of a code starts its lifetime (never past the series' end,
-- which is the code's expires_at until then).
-- The conditions must match getExpiryReason() and isNotYetActive() in the Edge Function.
CREATE OR REPLACE FUNCTION public.qr_drop_consume(p_id uuid, p_kind text, p_now bigint)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := to_timestamp(p_now / 1000.0);
  v_row qr_drops;
BEGIN
  IF p_kind = 'scan' THEN
    UPDATE qr_drops d
       SET scan_count = d.scan_count + 1,
           last_opened_at = v_now,
           expires_at = CASE
             WHEN d.lifetime_ms IS NOT NULL AND d.scan_count = 0
               THEN LEAST(d.expires_at, v_now + d.lifetime_ms * interval '1 millisecond')
             ELSE d.expires_at
           END
     WHERE d.id = p_id
       AND d.expires_at >= v_now
       AND (d.activates_at IS NULL OR d.activates_at <= v_now)
       AND NOT (d.expiry_type = 'scan' AND d.scan_count >= 1)
       AND (d.max_scans IS NULL OR d.scan_count < d.max_scans)
       AND (d.max_downloads IS NULL OR d.download_count < d.max_downloads)
    RETURNING d.* INTO v_row;
  ELSIF p_kind = 'download' THEN
    UPDATE qr_drops d
       SET download_count = d.download_count + 1
     WHERE d.id = p_id
       AND d.expires_at >= v_now
       AND (d.max_downloads IS NULL OR d.download_count < d.max_downloads)
    RETURNING d.* INTO v_row;
  ELSE
    RAISE EXCEPTION 'invalid kind: %', p_kind;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.qr_drop_consume(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_drop_consume(uuid, text, bigint) TO service_role;

-- Same as before, plus: series past their end date go, with their codes and files
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
      OR (((d.expiry_type = 'scan' AND d.scan_count >= 1)
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

-- How many of a series' codes have been opened: every code that is gone or has a scan.
-- Codes are only deleted once used up or when the series ends, so a missing code was opened.
-- Returns { "<series id>": opened, ... }
CREATE OR REPLACE FUNCTION public.qr_series_opened(p_series_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(id, opened), '{}'::jsonb)
    FROM (
      SELECT s.id, s.code_count - count(d.id) FILTER (WHERE d.scan_count = 0) AS opened
        FROM qr_series s
        LEFT JOIN qr_drops d ON d.series_id = s.id
       WHERE s.id = ANY (p_series_ids)
       GROUP BY s.id, s.code_count
    ) counts;
$$;
REVOKE ALL ON FUNCTION public.qr_series_opened(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_series_opened(uuid[]) TO service_role;
