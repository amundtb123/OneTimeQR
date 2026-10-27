-- SECURITY (S3): Users could set their own coin balance via the REST API,
-- because "Users can update own profile" had no column restriction.
-- The app never updates user_profiles from the client; coins are changed only
-- by the Edge Function (service role) in the Stripe webhook and /deduct-coins.
-- Safe to re-run.

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

-- Clients may only create their own profile, and only with zero coins
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id AND coins = 0);

REVOKE UPDATE, DELETE, TRUNCATE ON public.user_profiles FROM anon, authenticated;
