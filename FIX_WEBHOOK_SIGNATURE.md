# 🔧 Fiks Webhook Signature Verification Feil

## Problem
Webhook mottas, men signature verification feiler:
```
❌ Webhook signature verification failed: Error: SubtleCryptoProvide
```

## Årsak
`STRIPE_WEBHOOK_SECRET` i Supabase matcher ikke signing secret i Stripe Dashboard.

## Løsning: Sjekk og oppdater Webhook Secret

### Steg 1: Hent riktig signing secret fra Stripe

1. Gå til **Stripe Dashboard** → **Developers** → **Webhooks**
2. Klikk på webhook-endepunktet ditt (den som peker til Supabase)
3. Scroll ned til **"Signing secret"** seksjonen
4. Klikk på **"Reveal"** eller **"Click to reveal"**
5. **Kopier** signing secret (starter med `whsec_...`)

**⚠️ VIKTIG:** 
- Hvis du har **test mode** og **live mode** webhooks, må du bruke riktig secret for hver
- Test mode secret starter med `whsec_test_...`
- Live mode secret starter med `whsec_live_...`

### Steg 2: Sjekk webhook URL i Stripe

Webhook URL skal være:
```
https://ofrtokcrfovjwfkcnjef.supabase.co/functions/v1/make-server-c3c9181e/webhook
```

**Sjekk:**
- Er URL-en nøyaktig riktig?
- Er webhook "Enabled"?
- Er event `checkout.session.completed` valgt?

### Steg 3: Oppdater secret i Supabase

1. Gå til **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**
2. Finn `STRIPE_WEBHOOK_SECRET`
3. **Slett** den gamle verdien
4. **Legg til** den nye verdien (fra Stripe, steg 1)
5. Klikk **"Save"**

### Steg 4: Test på nytt

1. Gå til **Stripe Dashboard** → **Webhooks** → Klikk på webhook
2. Scroll ned til **"Send test webhook"**
3. Velg event: `checkout.session.completed`
4. Klikk **"Send test webhook"**
5. Sjekk **Supabase logs** - du skal nå se:
   - `🔔 Webhook received!`
   - `✅ Webhook signature verified` (ikke lenger feil!)
   - `🎉 Checkout session completed!`
   - `✅ Updated coins. New balance: X`

## Vanlige feil

### Feil 1: Bruker test secret for live webhook (eller omvendt)
- **Løsning:** Sjekk at du bruker riktig secret for riktig mode (test/live)

### Feil 2: Secret har ekstra mellomrom eller linjeskift
- **Løsning:** Kopier secret nøyaktig, uten ekstra tegn

### Feil 3: Bruker feil webhook-endpoint
- **Løsning:** Sjekk at webhook URL i Stripe matcher Supabase Edge Function URL

### Feil 4: Webhook body transformeres før signature verification
- **Løsning:** Sjekk at `c.req.text()` brukes (ikke `c.req.json()`), da Stripe krever raw body

## Verifiser at det fungerer

Etter at du har oppdatert secret:

1. **Test webhook i Stripe** → Du skal få `200 OK` i stedet for `400 Bad Request`
2. **Sjekk Supabase logs** → Du skal se `✅ Webhook signature verified`
3. **Test ekte betaling** → Coins skal oppdateres automatisk
