-- Scheduled release: a drop can be created now and opened from a later date (at most 3 months ahead).
-- Until activates_at only the owner can open it; its lifetime (expires_at) counts from activation.
-- Safe to re-run.

ALTER TABLE public.qr_drops ADD COLUMN IF NOT EXISTS activates_at timestamptz;

-- Same as before, plus: a scan before activates_at is refused. Downloads need a view token,
-- which non-owners only get from a scan, so they need no check of their own.
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
       SET scan_count = d.scan_count + 1, last_opened_at = v_now
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
