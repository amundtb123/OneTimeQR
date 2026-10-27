-- Økt 3 cleanup: QR drops, tokens and counters now live in their own tables, and the
-- Edge Function no longer reads or writes the KV store.
-- DESTRUCTIVE: drops kv_store_c3c9181e with everything in it. Run only after the Edge
-- Function from økt 3 (del B) is deployed. Safe to re-run.

DROP FUNCTION IF EXISTS public.copy_kv_qr_drops();
DROP FUNCTION IF EXISTS public.qrdrop_consume(text, text, bigint);
DROP FUNCTION IF EXISTS public.qrdrop_register_password_attempt(text, bigint, bigint);

-- The server-side "QR #1 scanned" check is gone (the keys in the QR codes are the protection)
ALTER TABLE public.qr_drops DROP COLUMN IF EXISTS qr1_scanned_at;

-- Only view tokens are issued now
DELETE FROM public.qr_tokens WHERE kind <> 'view';
ALTER TABLE public.qr_tokens DROP CONSTRAINT IF EXISTS qr_tokens_kind_check;
ALTER TABLE public.qr_tokens ADD CONSTRAINT qr_tokens_kind_check CHECK (kind = 'view');

DROP TABLE IF EXISTS public.kv_store_c3c9181e;
