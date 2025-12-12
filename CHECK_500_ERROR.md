# 🔍 Sjekk 500-feil i Webhook

## Problem
Webhook mottas (ikke lenger 401!), men får `500 Internal Server Error`.

## Hva dette betyr
- ✅ JWT Verification er deaktivert (webhook mottas)
- ❌ Noe feiler i webhook-koden når den prøver å legge til coins

## Steg-for-steg debugging:

### 1. Sjekk Supabase Logs
1. Gå til Supabase Dashboard → Edge Functions → `make-server-c3c9181e` → **Logs**
2. Filtrer på "Last hour"
3. Se etter logger som starter med:
   - `🔔 Webhook received!` - webhook mottas
   - `❌ Error` - feilmeldinger
   - `🎉 Checkout session completed!` - hvis den kommer så langt

### 2. Vanlige årsaker til 500-feil:

**A) SUPABASE_SERVICE_ROLE_KEY mangler**
- Gå til Supabase Dashboard → Project Settings → Edge Functions → Secrets
- Sjekk at `SUPABASE_SERVICE_ROLE_KEY` er satt
- Hvis ikke, legg den til:
  1. Gå til Project Settings → API
  2. Kopier "service_role" key (ikke "anon" key!)
  3. Gå til Edge Functions → Secrets
  4. Legg til: `SUPABASE_SERVICE_ROLE_KEY` = (service_role key)

**B) Database RLS policy blokkerer**
- Sjekk at SQL-migrasjonen er kjørt (`supabase_migration.sql`)
- Sjekk at "Service role full access" policy eksisterer

**C) userId mangler i metadata**
- Fra Stripe Dashboard ser jeg at metadata har `userId` - så dette er OK

### 3. Sjekk Stripe metadata
Fra bildet ser jeg at metadata har:
- `userId`: `ac2038bc-483e-4c9a-8aeb-2458b3b0db27` ✅
- `coins`: `58` (interessant - ikke 50!)
- `userEmail`: `amundtb@gmail.com` ✅

### 4. Test på nytt
Etter at du har sjekket logs, test webhook på nytt:
1. Stripe Dashboard → Webhooks → "Send test webhook"
2. Sjekk Supabase logs for detaljerte feilmeldinger

## Hva å se etter i logs:

**Hvis du ser:**
- `❌ STRIPE_WEBHOOK_SECRET not set` → Legg til secret
- `❌ SUPABASE_SERVICE_ROLE_KEY not set` → Legg til service role key
- `❌ Error creating user profile` → RLS policy problem
- `❌ Error updating coins` → Database problem

**Hvis du ser:**
- `🔔 Webhook received!` → Webhook mottas ✅
- `✅ Webhook signature verified` → Signature OK ✅
- `🎉 Checkout session completed!` → Prosessering starter ✅
- `✅ Updated coins. New balance: X` → Suksess! ✅





