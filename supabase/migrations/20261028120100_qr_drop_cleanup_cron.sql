-- Runs cleanup_expired_qr_drops() every 10 minutes, so expired content is deleted even when
-- the Edge Function gets no traffic. Requires the pg_cron extension (Database → Extensions).
-- Without pg_cron this file does nothing and the Edge Function's own cleanup still runs.
-- Safe to re-run.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron is not available: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Scheduling under an existing job name replaces that job
    PERFORM cron.schedule('qr-drop-cleanup', '*/10 * * * *', 'SELECT public.cleanup_expired_qr_drops()');
  ELSE
    RAISE NOTICE 'pg_cron is not enabled; skipping the cleanup schedule';
  END IF;
END;
$$;
