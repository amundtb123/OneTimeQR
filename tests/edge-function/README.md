# Edge Function tests

Runs `src/supabase/functions/server/index-standalone.tsx` in Node against a real Postgres
(PGlite, in-process WASM) with all SQL in `supabase_migration*.sql` and `supabase/migrations/` applied.
Supabase Auth and Storage are replaced by small fakes in `mock-supabase.mjs`, and Stripe
signature checks by `mock-stripe.mjs`.

Covers access control (password, view tokens, view/download limits, ownership),
server-side pricing and atomic coin charging, rate limiting, the Stripe webhook's
exactly-once crediting, owner-list pagination, CORS, the SQL functions' privileges,
RLS on the `qr_drops` tables and `user_profiles`, and cleanup of expired drops, tokens and
files. Each migration is applied twice in a row to check that it is safe to re-run.
(`pg_cron` is not available in PGlite; the cleanup function it schedules is tested directly.)

Runs in GitHub Actions on every pull request (`.github/workflows/edge-function-tests.yml`).

```bash
cd tests/edge-function
npm ci
npm test
```

Nothing here talks to production. The tests do not cover real Stripe signatures or the real Supabase Auth/Storage.
