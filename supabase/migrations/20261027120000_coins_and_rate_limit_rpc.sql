-- SECURITY (S3, S5, B5): Race-free coin accounting and rate limiting.
-- Called only by the Edge Function (service role).
-- Must be applied BEFORE deploying the Edge Function that calls these functions.
-- Safe to re-run.

-- Atomically deducts coins if the balance allows it.
-- Returns the new balance, or NULL if the balance is too low or the profile is missing.
CREATE OR REPLACE FUNCTION public.deduct_coins(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid amount: %', p_amount;
  END IF;

  UPDATE user_profiles
     SET coins = coins - p_amount
   WHERE id = p_user_id
     AND coins >= p_amount
  RETURNING coins INTO v_balance;

  RETURN v_balance;
END;
$$;

-- Gives coins back when creating a QR drop failed after they were deducted.
-- Returns the new balance.
CREATE OR REPLACE FUNCTION public.refund_coins(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid amount: %', p_amount;
  END IF;

  INSERT INTO user_profiles AS p (id, coins)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (id) DO UPDATE SET coins = p.coins + EXCLUDED.coins
  RETURNING coins INTO v_balance;

  RETURN v_balance;
END;
$$;

-- Credits a completed Stripe Checkout session exactly once.
-- Marking the session as processed and adding the coins happen in one transaction,
-- so retried or parallel webhook deliveries can never add coins twice.
CREATE OR REPLACE FUNCTION public.credit_checkout_session(p_session_id text, p_user_id uuid, p_coins integer, p_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
  v_balance integer;
BEGIN
  IF p_coins IS NULL OR p_coins <= 0 THEN
    RAISE EXCEPTION 'invalid coins: %', p_coins;
  END IF;

  INSERT INTO processed_checkout_sessions (session_id, user_id, coins_added, event_id)
  VALUES (p_session_id, p_user_id, p_coins, p_event_id)
  ON CONFLICT (session_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('alreadyProcessed', true);
  END IF;

  INSERT INTO user_profiles AS p (id, coins)
  VALUES (p_user_id, p_coins)
  ON CONFLICT (id) DO UPDATE SET coins = p.coins + EXCLUDED.coins
  RETURNING coins INTO v_balance;

  RETURN jsonb_build_object('alreadyProcessed', false, 'newBalance', v_balance);
END;
$$;

-- Atomically counts a request against a rate limit bucket and returns the number
-- of requests in the current window. The window restarts once it has passed.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_now bigint, p_window_ms bigint)
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO kv_store_c3c9181e AS kv (key, value)
  VALUES ('ratelimit:' || p_key, jsonb_build_object('count', 1, 'windowStart', p_now, 'expiresAt', p_now + p_window_ms))
  ON CONFLICT (key) DO UPDATE SET value =
    CASE
      WHEN (kv.value->>'windowStart')::bigint + p_window_ms <= p_now
        THEN jsonb_build_object('count', 1, 'windowStart', p_now, 'expiresAt', p_now + p_window_ms)
      ELSE jsonb_set(kv.value, '{count}', to_jsonb(COALESCE((kv.value->>'count')::int, 0) + 1))
    END
  RETURNING (kv.value->>'count')::int;
$$;

-- Only the service role (Edge Function) may call these
REVOKE ALL ON FUNCTION public.deduct_coins(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_coins(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_checkout_session(text, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_coins(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_coins(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_checkout_session(text, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, bigint, bigint) TO service_role;
