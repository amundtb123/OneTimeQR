-- New accounts start with 3 Pluss keys (15 kr) so they can try what costs money.
-- The client creates its own profile; this trigger sets the balance, so the client
-- cannot choose it. Profiles the Edge Function creates (service role) keep their value.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.user_profiles_start_saldo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.coins := 3;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_start_saldo ON public.user_profiles;
CREATE TRIGGER user_profiles_start_saldo
  BEFORE INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.user_profiles_start_saldo();

-- The policy is checked after the trigger has set the start balance
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id AND coins = 3);
