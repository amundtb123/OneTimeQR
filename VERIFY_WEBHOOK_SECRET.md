# ✅ Verifiser Webhook Secret

## ⚠️ VIKTIG: Webhook Secret er sensitiv informasjon
**Aldri legg webhook secret i Git eller dokumentasjon!**

## Steg-for-steg verifisering:

### 1. Sjekk i Stripe Dashboard
1. Gå til **Stripe Dashboard** → **Developers** → **Webhooks**
2. Klikk på webhook-endepunktet ditt
3. Scroll ned til **"Signing secret"**
4. Klikk **"Reveal"** eller **"Click to reveal"**
5. **Kopier** secret nøyaktig (uten ekstra mellomrom)

**Forventet format:** `whsec_...` (kan være uten "test" eller "live" prefix)

### 2. Sjekk i Supabase Dashboard
1. Gå til **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**
2. Finn `STRIPE_WEBHOOK_SECRET`
3. **Sjekk at verdien matcher** nøyaktig med secret fra Stripe (steg 1)

**⚠️ VIKTIG:**
- Secret må være **nøyaktig identisk** (ingen ekstra mellomrom, linjeskift, eller tegn)
- Hvis de ikke matcher, **slett** den gamle verdien og **lim inn** den nye

### 3. Sjekk webhook URL i Stripe
Webhook URL skal være:
```
https://ofrtokcrfovjwfkcnjef.supabase.co/functions/v1/make-server-c3c9181e/webhook
```

**Sjekk:**
- Er URL-en nøyaktig riktig?
- Er webhook "Enabled"?
- Er event `checkout.session.completed` valgt?

### 4. Test etter oppdatering
1. **Deploy backend på nytt** (hvis du endret secret)
2. **Stripe Dashboard** → **Webhooks** → **"Send test webhook"**
3. Velg event: `checkout.session.completed`
4. Klikk **"Send test webhook"**
5. Sjekk **Supabase logs** - du skal nå se:
   - `✅ Webhook signature verified` (ikke lenger feil!)
   - `🎉 Checkout session completed!`

## Hvis det fortsatt feiler:

### Sjekk Supabase logs for:
- `🔑 Webhook secret preview:` - Dette viser første/siste del av secret
- `❌ Webhook signature verification failed` - Hvis dette fortsatt vises, er secret fortsatt feil

### Vanlige problemer:
1. **Secret har ekstra mellomrom** → Slett og lim inn på nytt
2. **Bruker feil webhook-endpoint** → Sjekk at URL matcher
3. **Secret er fra feil webhook** → Sjekk at du kopierer fra riktig webhook i Stripe








