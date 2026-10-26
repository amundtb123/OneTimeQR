-- Document the access model for the KV store used by the Edge Function.
-- Verified in production 2026-10-26: RLS was already enabled with no policies.
-- Only the Edge Function (service role, which bypasses RLS) may read or write.
-- Safe to re-run.

ALTER TABLE public.kv_store_c3c9181e ENABLE ROW LEVEL SECURITY;

-- No policies on purpose: anon and authenticated must not see QR drops, keys or tokens.
-- TRUNCATE is not covered by RLS, so revoke it explicitly.
REVOKE TRUNCATE ON public.kv_store_c3c9181e FROM anon, authenticated;
REVOKE TRUNCATE ON public.processed_checkout_sessions FROM anon, authenticated;
