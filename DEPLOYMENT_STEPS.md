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

## 4. Røyktest

- Lag en gratis QR-kode (10 min) uten innlogging og åpne den på mobil
- Logget inn: lag en passordbeskyttet QR-kode og sjekk at saldoen går ned med riktig antall coins
- Feil passord avvises, riktig passord viser innholdet

## Rollback

Deploy forrige versjon av Edge-funksjonen og frontend. Migreringene er additive og kan stå.

## Secrets (Edge Functions → Secrets)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Supabase setter `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` og `SUPABASE_ANON_KEY` selv). Ikke legg secrets i repoet.
