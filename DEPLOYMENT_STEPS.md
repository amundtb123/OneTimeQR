# Deployment

Rekkefølgen er viktig: Edge-funksjonen kaller SQL-funksjoner som må finnes før den deployes,
og frontend og Edge-funksjon må deployes rett etter hverandre.

## 1. Kjør nye migreringer

I Supabase Dashboard → **SQL Editor**: kjør hver ny fil i `supabase/migrations/` i navnerekkefølge
(eldste først). Alle migreringene kan trygt kjøres flere ganger.

## 2. Deploy Edge-funksjonen

Funksjonen som kjører i produksjon er **`src/supabase/functions/server/index-standalone.tsx`**
(én fil uten lokale imports, så den kan limes inn i dashboardet).

1. Supabase Dashboard → **Edge Functions** → `make-server-c3c9181e` → **Code**
2. Erstatt all koden med innholdet i `index-standalone.tsx`
3. Klikk **Deploy**

## 3. Deploy frontend

Merge til `main`. Netlify bygger og publiserer automatisk.

## Engangssteg: flytting fra KV-tabellen (økt 3, del A)

1. Aktiver `pg_cron` under Database → Extensions (for automatisk opprydding hvert 10. minutt).
2. Kjør `20261028120000_qr_drop_tables.sql` og `20261028120100_qr_drop_cleanup_cron.sql`.
   Den første kopierer alle gyldige QR-drops fra `kv_store_c3c9181e` til `qr_drops`.
3. Deploy Edge-funksjonen.
4. Kjør `select public.copy_kv_qr_drops();` én gang til, så drops laget mellom
   steg 2 og 3 også kommer med. Den kan trygt kjøres flere ganger.

Sjekk at oppryddingsjobben er planlagt: `select jobname, schedule from cron.job;`
`kv_store_c3c9181e` brukes ikke lenger av funksjonen og kan tømmes etter 7 dager.

Planlagt opprydding når en uke har gått etter økt 3 (tidligst 2026-11-04): slette
`kv_store_c3c9181e`, SQL-funksjonene `qrdrop_consume`, `qrdrop_register_password_attempt` og
`copy_kv_qr_drops`, kolonnen `qr_drops.qr1_scanned_at`, og endepunktene `/qrdrop/:id/check`
og `/qrdrop/:id/key`, som bare finnes for nettlesere med gammel frontend.

## 4. Røyktest

- Lag en gratis QR-kode (10 min) uten innlogging og åpne den på mobil
- Logget inn: lag en passordbeskyttet QR-kode og sjekk at saldoen går ned med riktig antall coins
- Feil passord avvises, riktig passord viser innholdet

## Rollback

Deploy forrige versjon av Edge-funksjonen og frontend. Migreringene er additive og kan stå.

## Secrets (Edge Functions → Secrets)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Supabase setter `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` og `SUPABASE_ANON_KEY` selv). Ikke legg secrets i repoet.
