# 🔍 Webhook Debugging Guide

## Problem: Coins ikke oppdateres etter kjøp

### Sjekkliste:

#### 1. Sjekk om webhook kjører i Supabase
- Gå til Supabase Dashboard → Edge Functions → `make-server-c3c9181e` → Logs
- Se etter logger som starter med `🔔 Webhook received!`
- Hvis du IKKE ser disse, betyr det at webhook ikke mottar events fra Stripe

#### 2. Sjekk Stripe Webhook-konfigurasjon
1. Gå til [Stripe Dashboard](https://dashboard.stripe.com) → Developers → Webhooks
2. Sjekk at du har en webhook med URL:
   ```
   https://ofrtokcrfovjwfkcnjef.supabase.co/functions/v1/make-server-c3c9181e/webhook
   ```
3. Sjekk at webhook lytter til event: `checkout.session.completed`
4. Sjekk webhook status - skal være "Enabled"

#### 3. Test webhook manuelt
1. I Stripe Dashboard → Webhooks → Klikk på webhook-endepunktet
2. Klikk "Send test webhook"
3. Velg event: `checkout.session.completed`
4. Klikk "Send test webhook"
5. Sjekk Supabase logs - du skal se `🔔 Webhook received!`

#### 4. Sjekk webhook secret
1. I Stripe Dashboard → Webhooks → Klikk på webhook-endepunktet
2. Kopier "Signing secret" (starter med `whsec_`)
3. Gå til Supabase Dashboard → Project Settings → Edge Functions → Secrets
4. Sjekk at `STRIPE_WEBHOOK_SECRET` er satt og matcher

#### 5. Sjekk om coins faktisk er i databasen
1. Gå til Supabase Dashboard → Table Editor → `user_profiles`
2. Søk etter din bruker-ID: `ac2038bc-483e-4c9a-8aeb-2458b3b0db27`
3. Sjekk `coins`-kolonnen
4. Hvis coins er 0 eller NULL, betyr det at webhook ikke har kjørt

### Vanlige problemer:

**Problem 1: Webhook mottar ikke events**
- **Løsning**: Sjekk webhook URL i Stripe Dashboard
- **Løsning**: Sjekk at webhook er "Enabled" i Stripe

**Problem 2: Webhook secret feil**
- **Løsning**: Oppdater `STRIPE_WEBHOOK_SECRET` i Supabase Secrets

**Problem 3: Webhook kjører men coins ikke oppdateres**
- **Løsning**: Sjekk Supabase logs for feilmeldinger
- **Løsning**: Sjekk RLS policies i `user_profiles` tabellen

**Problem 4: Frontend kan ikke hente coins**
- **Løsning**: Sjekk browser console for feilmeldinger
- **Løsning**: Sjekk at brukeren er logget inn
- **Løsning**: Sjekk RLS policy for SELECT på `user_profiles`

