-- The database deletes expired drops every 10 minutes, but their files are removed from Storage
-- by the Edge Function, whose own timer only runs while it is awake. This job calls the
-- function's cleanup every 10 minutes, so files never wait for someone to use the service.
-- Requires pg_cron and pg_net (Database → Extensions). Safe to re-run.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net is not available: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    -- The anon key is public (it ships with the web app); the endpoint needs no more than that
    PERFORM cron.schedule(
      'qr-drop-storage-cleanup',
      '*/10 * * * *',
      $job$
      SELECT net.http_post(
        url := 'https://ofrtokcrfovjwfkcnjef.supabase.co/functions/v1/make-server-c3c9181e/cleanup',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mcnRva2NyZm92andma2NuamVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwMTIzMTcsImV4cCI6MjA3OTU4ODMxN30._gGY2Mjk3KFbBjhCnaQBxKtbZPlLxRwCG8qIy4T47DE"}'::jsonb,
        body := '{}'::jsonb
      )
      $job$
    );
  ELSE
    RAISE NOTICE 'pg_cron or pg_net is not enabled; skipping the storage cleanup schedule';
  END IF;
END;
$$;
