-- Free keys for logged-in users count against a monthly allowance of downloads
-- (file size × opens), so no one can share files for free without limit.
-- Only the Edge Function (service role) reads or writes it. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.free_traffic (
  user_id uuid NOT NULL,
  month date NOT NULL,
  bytes bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

ALTER TABLE public.free_traffic ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_traffic FROM anon, authenticated;

-- Adds p_bytes to this month's use if it stays within p_limit; returns whether it was added
CREATE OR REPLACE FUNCTION public.free_traffic_use(p_user_id uuid, p_bytes bigint, p_limit bigint)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', now())::date;
BEGIN
  INSERT INTO free_traffic (user_id, month) VALUES (p_user_id, v_month)
  ON CONFLICT (user_id, month) DO NOTHING;
  UPDATE free_traffic SET bytes = bytes + p_bytes
  WHERE user_id = p_user_id AND month = v_month AND bytes + p_bytes <= p_limit;
  RETURN FOUND;
END;
$$;

-- Gives traffic back when creating the key failed after it was counted
CREATE OR REPLACE FUNCTION public.free_traffic_release(p_user_id uuid, p_bytes bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE free_traffic SET bytes = greatest(0, bytes - p_bytes)
  WHERE user_id = p_user_id AND month = date_trunc('month', now())::date;
END;
$$;

REVOKE ALL ON FUNCTION public.free_traffic_use(uuid, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.free_traffic_release(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.free_traffic_use(uuid, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.free_traffic_release(uuid, bigint) TO service_role;
