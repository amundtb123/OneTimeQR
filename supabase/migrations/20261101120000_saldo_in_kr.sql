-- The balance counts kroner instead of Pluss keys of 5 kr, so prices can follow how much
-- a key may be downloaded. Existing balances are multiplied by 5 once; the column comment
-- marks that it has been done. New accounts start with 15 kr. Safe to re-run.

DO $$
BEGIN
  IF col_description('public.user_profiles'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.user_profiles'::regclass AND attname = 'coins'))
     IS DISTINCT FROM 'Balance in kr' THEN
    UPDATE public.user_profiles SET coins = coins * 5;
    COMMENT ON COLUMN public.user_profiles.coins IS 'Balance in kr';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_profiles_start_saldo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.coins := 15;
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id AND coins = 15);

-- Owners preview their own drop without using up a view, but each preview with files is
-- downloaded again, so the number of previews is limited
ALTER TABLE public.qr_drops ADD COLUMN IF NOT EXISTS owner_previews integer NOT NULL DEFAULT 0;

-- Counts an owner preview if fewer than p_max were made; returns whether it was counted
CREATE OR REPLACE FUNCTION public.qr_drop_owner_preview(p_id uuid, p_max integer)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE qr_drops SET owner_previews = owner_previews + 1
  WHERE id = p_id AND owner_previews < p_max;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.qr_drop_owner_preview(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_drop_owner_preview(uuid, integer) TO service_role;
