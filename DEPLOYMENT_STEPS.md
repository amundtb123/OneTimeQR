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

## Opprydding etter økt 3

`20261029120000_drop_kv_store.sql` sletter KV-tabellen `kv_store_c3c9181e` og de gamle
SQL-funksjonene som brukte den. Den er destruktiv og skal bare kjøres når Edge-funksjonen fra
økt 3 (del B) er deployet. `pg_cron` må være aktivert (Database → Extensions) for den
automatiske oppryddingen; sjekk med `select jobname, schedule from cron.job;`

## 4. Røyktest

- Lag en gratis QR-kode (10 min) uten innlogging og åpne den på mobil
- Logget inn: lag en passordbeskyttet QR-kode og sjekk at saldoen går ned med riktig antall coins
- Feil passord avvises, riktig passord viser innholdet

## Rollback

Deploy forrige versjon av Edge-funksjonen og frontend. Migreringene er additive og kan stå.

## Secrets (Edge Functions → Secrets)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Supabase setter `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` og `SUPABASE_ANON_KEY` selv). Ikke legg secrets i repoet.
