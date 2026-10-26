# Edge Function tests

Runs `src/supabase/functions/server/index-standalone.tsx` in Node against a real Postgres
(PGlite, in-process WASM) with all SQL in `supabase_migration*.sql` and `supabase/migrations/` applied.
Supabase Auth and Storage are replaced by small fakes in `mock-supabase.mjs`.

Covers access control (password, view tokens, view/download limits, ownership),
the atomic SQL functions, RLS on `kv_store_c3c9181e` and `user_profiles`, and token cleanup.

```bash
cd tests/edge-function
npm ci
npm test
```

Nothing here talks to production. The tests do not cover the Stripe webhook or the real Supabase Auth/Storage.
