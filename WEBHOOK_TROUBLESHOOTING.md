# 🔍 Webhook Troubleshooting - Coins ikke oppdateres

## Problem: Coins er 0 i databasen etter kjøp

Fra console ser vi at:
- ✅ Query fungerer: `Data: {coins: 0} Error: null`
- ❌ Coins er 0 i databasen
- ❌ Dette betyr webhook har IKKE kjørt eller feilet

## Steg-for-steg debugging:

### 1. Sjekk om webhook faktisk kjører

**I Supabase Dashboard:**
1. Gå til Edge Functions → `make-server-c3c9181e` → Logs
2. Filtrer på "Last hour" eller "Last 24 hours"
3. Søk etter `🔔` eller `webhook`
4. **Hvis du IKKE ser `🔔 Webhook received!`** → Webhook mottar ikke events fra Stripe

### 2. Test webhook manuelt i Stripe

**I Stripe Dashboard:**
1. Gå til Developers → Webhooks
2. Klikk på webhook-endepunktet
3. Scroll ned til "Send test webhook"
4. Velg event: `checkout.session.completed`
5. Klikk "Send test webhook"
6. **Gå tilbake til Supabase logs** - du skal nå se:
   - `🔔 Webhook received!`
   - `✅ Webhook signature verified`
   - `🎉 Checkout session completed!`
   - `✅ Verified: User [id] now has 50 coins`

### 3. Sjekk webhook secret

**I Stripe Dashboard:**
1. Webhooks → Klikk på webhook → Kopier "Signing secret" (starter med `whsec_`)

**I Supabase Dashboard:**
1. Project Settings → Edge Functions → Secrets
2. Sjekk at `STRIPE_WEBHOOK_SECRET` matcher signing secret fra Stripe
3. Hvis ikke, oppdater den

### 4. Sjekk webhook URL i Stripe

Webhook URL skal være:
```
https://ofrtokcrfovjwfkcnjef.supabase.co/functions/v1/make-server-c3c9181e/webhook
```

**Sjekk:**
- Er URL-en nøyaktig riktig?
- Er webhook "Enabled"?
- Er event `checkout.session.completed` valgt?

### 5. Test med manuell endpoint

Etter deploy, test denne URL-en (erstatt `[TOKEN]` med din auth token):
```
https://ofrtokcrfovjwfkcnjef.supabase.co/functions/v1/make-server-c3c9181e/test-coins
Authorization: Bearer [TOKEN]
```

Dette viser din nåværende coin-balance direkte fra databasen.

### 6. Sjekk Stripe webhook events

**I Stripe Dashboard:**
1. Webhooks → Klikk på webhook-endepunktet
2. Scroll til "Recent events"
3. Se om det er events med status "Succeeded" eller "Failed"
4. Klikk på en event for å se detaljer
5. Se "Response" for å se hva Supabase returnerte

## Vanlige problemer:

### Problem 1: Webhook mottar ikke events
**Symptom:** Ingen `🔔 Webhook received!` i Supabase logs
**Løsning:**
- Sjekk webhook URL i Stripe
- Sjekk at webhook er "Enabled"
- Test webhook manuelt i Stripe Dashboard

### Problem 2: Webhook signature verification feiler
**Symptom:** `❌ Webhook signature verification failed` i logs
**Løsning:**
- Sjekk at `STRIPE_WEBHOOK_SECRET` er riktig i Supabase Secrets
- Kopier signing secret på nytt fra Stripe

### Problem 3: Webhook kjører men coins ikke oppdateres
**Symptom:** Ser `🎉 Checkout session completed!` men coins er fortsatt 0
**Løsning:**
- Sjekk Supabase logs for feilmeldinger etter `🎉`
- Sjekk at `userId` finnes i session metadata
- Sjekk RLS policies i `user_profiles` tabellen

### Problem 4: userId mangler i metadata
**Symptom:** `❌ No userId in session metadata` i logs
**Løsning:**
- Sjekk checkout-endepunktet - skal legge til `userId` i metadata
- Sjekk at brukeren er logget inn når checkout-session opprettes

## Test-prosedyre:

1. ✅ Deploy backend med ny logging
2. ✅ Test webhook manuelt i Stripe Dashboard
3. ✅ Sjekk Supabase logs for `🔔 Webhook received!`
4. ✅ Gjør en test-kjøp
5. ✅ Sjekk Supabase logs for webhook-event
6. ✅ Test `/test-coins` endpoint for å verifisere balance
7. ✅ Sjekk `user_profiles` tabellen direkte i Supabase






