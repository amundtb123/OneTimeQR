# 🔒 SIKKERHET: Roter Stripe Webhook Secret

## Problem
Stripe Webhook Secret ble eksponert i Git (i `VERIFY_WEBHOOK_SECRET.md`).

## Hva du må gjøre NÅ:

### 1. Roter Webhook Secret i Stripe (VIKTIG!)

1. Gå til **Stripe Dashboard** → **Developers** → **Webhooks**
2. Klikk på webhook-endepunktet ditt
3. Scroll ned til **"Signing secret"**
4. Klikk på **"Reveal"** eller **"Click to reveal"**
5. **Klikk på "Rotate"** eller **"Regenerate"** for å lage en ny secret
6. **Kopier den nye secret-en** (starter med `whsec_...`)

### 2. Oppdater Secret i Supabase

1. Gå til **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**
2. Finn `STRIPE_WEBHOOK_SECRET`
3. **Slett** den gamle verdien
4. **Lim inn** den nye verdien (fra Stripe, steg 1)
5. Klikk **"Save"**

### 3. Deploy Backend på nytt

1. Gå til **Supabase Dashboard** → **Edge Functions** → `make-server-c3c9181e`
2. Kopier innholdet fra `src/supabase/functions/server/index-standalone.tsx`
3. **Deploy/Save**

### 4. Test Webhook

1. Gå til **Stripe Dashboard** → **Webhooks** → Klikk på webhook
2. Scroll ned til **"Send test webhook"**
3. Velg event: `checkout.session.completed`
4. Klikk **"Send test webhook"**
5. Sjekk **Supabase logs** - du skal se:
   - `✅ Webhook signature verified`
   - `🎉 Checkout session completed!`

## Hvorfor dette er viktig

- Den gamle secret-en er nå kompromittert og kan brukes av andre
- Ved å rotere secret-en, blir den gamle ugyldig
- Bare den nye secret-en vil fungere med webhook-endepunktet ditt

## Fremover

- **Aldri** legg secrets i Git eller dokumentasjon
- Bruk alltid Supabase Secrets eller miljøvariabler
- Hvis du må dokumentere, bruk placeholders som `whsec_...` eller `[YOUR_SECRET]`


