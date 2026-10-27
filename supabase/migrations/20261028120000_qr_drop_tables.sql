-- Økt 3 (del A): QR drops, tokens and counters move from the KV store to real tables.
-- Additive: the KV table and the old qrdrop_* functions stay until no deployed function uses them.
-- Order: run this file, deploy the Edge Function, then run  select public.copy_kv_qr_drops();
-- once more so drops created in between are copied too.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.qr_drops (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_token_hash text,
  content_type text NOT NULL,
  title text,
  text_content text,
  url_content text,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  expiry_type text NOT NULL,
  expires_at timestamptz NOT NULL,
  max_scans integer CHECK (max_scans > 0),
  max_downloads integer CHECK (max_downloads > 0),
  scan_count integer NOT NULL DEFAULT 0 CHECK (scan_count >= 0),
  download_count integer NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  view_only boolean NOT NULL DEFAULT false,
  no_preview boolean NOT NULL DEFAULT false,
  password_hash text,
  qr_style jsonb,
  encrypted boolean NOT NULL DEFAULT false,
  secure_mode boolean NOT NULL DEFAULT false,
  single_qr_mode boolean NOT NULL DEFAULT false,
  encryption_key text,
  qr1_scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz
);
CREATE INDEX IF NOT EXISTS qr_drops_user_created_idx ON public.qr_drops (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS qr_drops_expires_idx ON public.qr_drops (expires_at);

-- Short-lived bearer tokens (access, view, unlock). Only the SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS public.qr_tokens (
  token_hash text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('access', 'view', 'unlock')),
  qr_drop_id uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS qr_tokens_expires_idx ON public.qr_tokens (expires_at);

CREATE TABLE IF NOT EXISTS public.qr_password_attempts (
  qr_drop_id uuid PRIMARY KEY REFERENCES public.qr_drops(id) ON DELETE CASCADE,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL,
  expires_at timestamptz NOT NULL
);

-- Files of deleted drops, removed from Storage by the Edge Function (SQL can't delete Storage objects)
CREATE TABLE IF NOT EXISTS public.storage_deletion_queue (
  path text PRIMARY KEY,
  queued_at timestamptz NOT NULL DEFAULT now()
);

-- Only the Edge Function (service role) may touch these tables
ALTER TABLE public.qr_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_password_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_deletion_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_drops, public.qr_tokens, public.qr_password_attempts, public.rate_limits, public.storage_deletion_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.qr_drops, public.qr_tokens, public.qr_password_attempts, public.rate_limits, public.storage_deletion_queue TO service_role;

-- Whichever way a drop is deleted (owner, cleanup, cascade from auth.users), its files are queued
CREATE OR REPLACE FUNCTION public.qr_drops_queue_files()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO storage_deletion_queue (path)
  SELECT f->>'path' FROM jsonb_array_elements(OLD.files) AS f WHERE f->>'path' IS NOT NULL
  ON CONFLICT (path) DO NOTHING;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS qr_drops_queue_files ON public.qr_drops;
CREATE TRIGGER qr_drops_queue_files
  AFTER DELETE ON public.qr_drops
  FOR EACH ROW EXECUTE FUNCTION public.qr_drops_queue_files();

-- Atomically counts a scan or download if the drop's limits allow it.
-- Returns the updated row, or NULL if it is expired, used up or missing.
-- The conditions must match getExpiryReason() in the Edge Function.
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
       SET scan_count = d.scan_count + 1, last_opened_at = v_now
     WHERE d.id = p_id
       AND d.expires_at >= v_now
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

-- Atomically registers a password attempt and returns the number of attempts in the current window
CREATE OR REPLACE FUNCTION public.qr_drop_password_attempt(p_id uuid, p_now bigint, p_window_ms bigint)
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO qr_password_attempts AS a (qr_drop_id, attempts, expires_at)
  VALUES (p_id, 1, to_timestamp((p_now + p_window_ms) / 1000.0))
  ON CONFLICT (qr_drop_id) DO UPDATE SET
    attempts = CASE WHEN a.expires_at <= to_timestamp(p_now / 1000.0) THEN 1 ELSE a.attempts + 1 END,
    expires_at = CASE WHEN a.expires_at <= to_timestamp(p_now / 1000.0) THEN excluded.expires_at ELSE a.expires_at END
  RETURNING attempts;
$$;

-- Same signature as before (the previous Edge Function keeps working), now backed by rate_limits
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_now bigint, p_window_ms bigint)
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO rate_limits AS r (key, hits, expires_at)
  VALUES (p_key, 1, to_timestamp((p_now + p_window_ms) / 1000.0))
  ON CONFLICT (key) DO UPDATE SET
    hits = CASE WHEN r.expires_at <= to_timestamp(p_now / 1000.0) THEN 1 ELSE r.hits + 1 END,
    expires_at = CASE WHEN r.expires_at <= to_timestamp(p_now / 1000.0) THEN excluded.expires_at ELSE r.expires_at END
  RETURNING hits;
$$;

-- Deletes expired drops and tokens. A used-up drop is kept until the last viewer's token
-- has expired, so an ongoing view can finish (matches isDeletable() in the Edge Function).
-- Runs every 10 minutes via pg_cron, and from the Edge Function.
CREATE OR REPLACE FUNCTION public.cleanup_expired_qr_drops(p_view_ttl_ms bigint DEFAULT 900000)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM qr_drops d
   WHERE d.expires_at < now()
      OR (((d.expiry_type = 'scan' AND d.scan_count >= 1)
           OR (d.max_scans IS NOT NULL AND d.scan_count >= d.max_scans)
           OR (d.max_downloads IS NOT NULL AND d.download_count >= d.max_downloads))
          AND (d.last_opened_at IS NULL OR d.last_opened_at + p_view_ttl_ms * interval '1 millisecond' < now()));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM qr_tokens WHERE expires_at < now();
  DELETE FROM qr_password_attempts WHERE expires_at < now();
  DELETE FROM rate_limits WHERE expires_at < now();
  RETURN v_deleted;
END;
$$;

-- Copies unexpired drops from the KV store. Copied KV entries are marked, so a re-run updates
-- their counters but never brings back a drop that was deleted from qr_drops in the meantime.
CREATE OR REPLACE FUNCTION public.copy_kv_qr_drops()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH src AS (
    SELECT kv.key, kv.value AS v, lower(substr(kv.key, 8))::uuid AS id
      FROM kv_store_c3c9181e kv
     WHERE kv.key ~ '^qrdrop:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ), parsed AS (
    SELECT src.key, src.id, src.v,
      CASE WHEN v->>'createdAt' ~ '^[0-9]{1,15}$' THEN to_timestamp((v->>'createdAt')::bigint / 1000.0) ELSE now() END AS created_at,
      CASE WHEN v->>'expiresAt' ~ '^[0-9]{1,15}$' THEN to_timestamp((v->>'expiresAt')::bigint / 1000.0) END AS expires_at
      FROM src
  ), ins AS (
    INSERT INTO qr_drops AS d (
      id, user_id, owner_token_hash, content_type, title, text_content, url_content, files,
      expiry_type, expires_at, max_scans, max_downloads, scan_count, download_count,
      view_only, no_preview, password_hash, qr_style, encrypted, secure_mode, single_qr_mode,
      encryption_key, created_at, last_opened_at)
    SELECT
      p.id,
      CASE WHEN v->>'userId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           THEN (SELECT u.id FROM auth.users u WHERE u.id = (v->>'userId')::uuid) END,
      v->>'ownerTokenHash',
      COALESCE(v->>'contentType', 'text'),
      v->>'title',
      v->>'textContent',
      v->>'urlContent',
      CASE
        WHEN jsonb_typeof(v->'files') = 'array' AND jsonb_array_length(v->'files') > 0 THEN v->'files'
        WHEN v->>'filePath' IS NOT NULL THEN jsonb_build_array(jsonb_build_object(
          'name', v->>'fileName', 'type', v->>'fileType', 'path', v->>'filePath',
          'size', CASE WHEN v->>'fileSize' ~ '^[0-9]{1,15}$' THEN (v->>'fileSize')::bigint END))
        ELSE '[]'::jsonb
      END,
      COALESCE(v->>'expiryType', '10m'),
      COALESCE(p.expires_at, p.created_at + interval '7 days'),
      CASE WHEN v->>'maxScans' ~ '^[1-9][0-9]{0,8}$' THEN (v->>'maxScans')::int END,
      CASE WHEN v->>'maxDownloads' ~ '^[1-9][0-9]{0,8}$' THEN (v->>'maxDownloads')::int END,
      CASE WHEN v->>'scanCount' ~ '^[0-9]{1,9}$' THEN (v->>'scanCount')::int ELSE 0 END,
      CASE WHEN v->>'downloadCount' ~ '^[0-9]{1,9}$' THEN (v->>'downloadCount')::int ELSE 0 END,
      COALESCE(v->>'viewOnly' = 'true', false),
      COALESCE(v->>'noPreview' = 'true', false),
      CASE WHEN jsonb_typeof(v->'password') = 'string' THEN v->>'password' END,
      CASE WHEN jsonb_typeof(v->'qrStyle') = 'object' THEN v->'qrStyle' END,
      COALESCE(v->>'encrypted' = 'true', false),
      COALESCE(v->>'secureMode' = 'true', false),
      COALESCE(v->>'singleQrMode' = 'true', false),
      v->>'encryptionKey',
      p.created_at,
      CASE WHEN v->>'lastOpenedAt' ~ '^[0-9]{1,15}$' THEN to_timestamp((v->>'lastOpenedAt')::bigint / 1000.0) END
    FROM parsed p
    WHERE COALESCE(p.expires_at, p.created_at + interval '7 days') > now()
      AND (v->>'migratedAt' IS NULL OR EXISTS (SELECT 1 FROM qr_drops x WHERE x.id = p.id))
    ON CONFLICT (id) DO UPDATE SET
      scan_count = GREATEST(d.scan_count, excluded.scan_count),
      download_count = GREATEST(d.download_count, excluded.download_count),
      last_opened_at = GREATEST(d.last_opened_at, excluded.last_opened_at)
    RETURNING d.id
  ), marked AS (
    UPDATE kv_store_c3c9181e kv
       SET value = kv.value || jsonb_build_object('migratedAt', (extract(epoch FROM now()) * 1000)::bigint)
     WHERE lower(kv.key) IN (SELECT 'qrdrop:' || ins.id::text FROM ins)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM marked;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.qr_drops_queue_files() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qr_drop_consume(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qr_drop_password_attempt(uuid, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_qr_drops(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.copy_kv_qr_drops() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_drop_consume(uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.qr_drop_password_attempt(uuid, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_qr_drops(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.copy_kv_qr_drops() TO service_role;

-- First copy; run it again after deploying the Edge Function
SELECT public.copy_kv_qr_drops();
