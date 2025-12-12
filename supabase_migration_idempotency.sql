-- Add idempotency tracking for Stripe webhooks
-- This prevents duplicate coin additions when Stripe retries webhooks

CREATE TABLE IF NOT EXISTS public.processed_checkout_sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coins_added INTEGER NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  event_id TEXT
);

-- Enable RLS
ALTER TABLE public.processed_checkout_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (for backend operations)
DROP POLICY IF EXISTS "Service role full access processed sessions" ON public.processed_checkout_sessions;
CREATE POLICY "Service role full access processed sessions"
  ON public.processed_checkout_sessions
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_processed_sessions_user_id ON public.processed_checkout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_processed_sessions_processed_at ON public.processed_checkout_sessions(processed_at);


