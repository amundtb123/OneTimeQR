-- SECURITY (S1): Server-side, race-free enforcement of view and download limits,
-- and rate limiting of password attempts. Called only by the Edge Function.
-- Must be applied BEFORE deploying the Edge Function that calls these functions.
-- Safe to re-run.

-- Atomically counts a scan or download if the QR drop's limits allow it.
-- Returns the updated QR drop, or NULL if it is expired, used up or missing.
-- The conditions must match getExpiryReason() in the Edge Function.
CREATE OR REPLACE FUNCTION public.qrdrop_consume(p_id text, p_kind text, p_now bigint)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_kind = 'scan' THEN
    UPDATE kv_store_c3c9181e
       SET value = value || jsonb_build_object(
             'scanCount', COALESCE((value->>'scanCount')::int, 0) + 1,
             'lastOpenedAt', p_now)
     WHERE key = 'qrdrop:' || p_id
       AND (value->>'expiresAt' IS NULL OR (value->>'expiresAt')::bigint >= p_now)
       AND NOT (value->>'expiryType' = 'scan' AND COALESCE((value->>'scanCount')::int, 0) >= 1)
       AND (value->>'maxScans' IS NULL OR COALESCE((value->>'scanCount')::int, 0) < (value->>'maxScans')::int)
       AND (value->>'maxDownloads' IS NULL OR COALESCE((value->>'downloadCount')::int, 0) < (value->>'maxDownloads')::int)
    RETURNING value INTO v_result;
  ELSIF p_kind = 'download' THEN
    UPDATE kv_store_c3c9181e
       SET value = value || jsonb_build_object(
             'downloadCount', COALESCE((value->>'downloadCount')::int, 0) + 1)
     WHERE key = 'qrdrop:' || p_id
       AND (value->>'expiresAt' IS NULL OR (value->>'expiresAt')::bigint >= p_now)
       AND (value->>'maxDownloads' IS NULL OR COALESCE((value->>'downloadCount')::int, 0) < (value->>'maxDownloads')::int)
    RETURNING value INTO v_result;
  ELSE
    RAISE EXCEPTION 'invalid kind: %', p_kind;
  END IF;

  RETURN v_result;
END;
$$;

-- Atomically registers a password attempt for a QR drop and returns the number
-- of attempts in the current window. The window restarts once it has passed.
CREATE OR REPLACE FUNCTION public.qrdrop_register_password_attempt(p_id text, p_now bigint, p_window_ms bigint)
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO kv_store_c3c9181e AS kv (key, value)
  VALUES ('pwfail:' || p_id, jsonb_build_object('count', 1, 'windowStart', p_now, 'expiresAt', p_now + p_window_ms))
  ON CONFLICT (key) DO UPDATE SET value =
    CASE
      WHEN (kv.value->>'windowStart')::bigint + p_window_ms <= p_now
        THEN jsonb_build_object('count', 1, 'windowStart', p_now, 'expiresAt', p_now + p_window_ms)
      ELSE jsonb_set(kv.value, '{count}', to_jsonb(COALESCE((kv.value->>'count')::int, 0) + 1))
    END
  RETURNING (kv.value->>'count')::int;
$$;

-- Only the service role (Edge Function) may call these
REVOKE ALL ON FUNCTION public.qrdrop_consume(text, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qrdrop_register_password_attempt(text, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qrdrop_consume(text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.qrdrop_register_password_attempt(text, bigint, bigint) TO service_role;
