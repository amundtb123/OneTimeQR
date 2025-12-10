# Stripe Coin Shop Setup Guide

## 📋 Oversikt

Dette dokumentet beskriver hvordan du setter opp Stripe-betaling for coin-shop funksjonaliteten i OneTimeQR.

## 🔧 Steg 1: Opprett Stripe-konto og produkt

1. Gå til [Stripe Dashboard](https://dashboard.stripe.com)
2. Opprett en konto eller logg inn
3. Gå til **Products** → **Add product**
4. Opprett produktet:
   - **Name**: "50 Coins"
   - **Description**: "Kjøp 50 coins for OneTimeQR"
   - **Pricing**: 
     - **Price**: 29.00
     - **Currency**: NOK (Norwegian Krone)
     - **Billing**: One time

## 🔑 Steg 2: Hent Stripe API-nøkler

1. I Stripe Dashboard, gå til **Developers** → **API keys**
2. Kopier:
   - **Publishable key** (starter med `pk_`)
   - **Secret key** (starter med `sk_`) - **VIKTIG**: Dette er sensitivt!

## 🌐 Steg 3: Konfigurer Stripe Webhook

1. I Stripe Dashboard, gå til **Developers** → **Webhooks**
2. Klikk **Add endpoint**
3. **Endpoint URL**: `https://[PROSJEKT_ID].supabase.co/functions/v1/make-server-c3c9181e/webhook`
   - Erstatt `[PROSJEKT_ID]` med ditt Supabase prosjekt-ID
4. **Events to send**: Velg `checkout.session.completed`
5. Klikk **Add endpoint**
6. **VIKTIG**: Kopier **Signing secret** (starter med `whsec_`) - du trenger dette senere!

## 🗄️ Steg 4: Opprett Supabase database-tabell

1. Gå til [Supabase Dashboard](https://app.supabase.com)
2. Velg ditt prosjekt
3. Gå til **SQL Editor**
4. Kjør SQL-filen `supabase_migration.sql` som er inkludert i prosjektet
5. Dette oppretter `user_profiles`-tabellen med `coins`-felt

## 🔐 Steg 5: Legg til miljøvariabler i Supabase

1. I Supabase Dashboard, gå til **Project Settings** → **Edge Functions** → **Secrets**
2. Legg til følgende secrets:
   - `STRIPE_SECRET_KEY`: Din Stripe secret key (fra Steg 2)
   - `STRIPE_WEBHOOK_SECRET`: Din Stripe webhook signing secret (fra Steg 3)

## ✅ Steg 6: Test

1. Deploy Supabase Edge Function (hvis ikke allerede gjort)
2. Test checkout-flow:
   - Logg inn i appen
   - Klikk "Kjøp 50 coins"
   - Gjennomfør testbetaling i Stripe test mode
   - Verifiser at coins blir lagt til i brukerens profil

## 🧪 Test Mode vs Production

- **Test Mode**: Bruk test API keys (starter med `pk_test_` og `sk_test_`)
- **Production Mode**: Bruk live API keys (starter med `pk_live_` og `sk_live_`)

## 📝 Viktige notater

- Webhook-endepunktet må være tilgjengelig via HTTPS
- Stripe webhook secret må matche nøyaktig
- Test webhook i Stripe Dashboard før du går live
- Sjekk Stripe Dashboard for betalingsstatus og webhook-events

## 🔍 Feilsøking

### Webhook mottar ikke events
- Sjekk at webhook URL er riktig
- Verifiser at webhook secret er satt riktig
- Sjekk Stripe Dashboard → Webhooks → Events for feilmeldinger

### Coins blir ikke lagt til
- Sjekk Supabase logs for Edge Function
- Verifiser at `user_profiles`-tabellen eksisterer
- Sjekk at RLS (Row Level Security) policies er satt riktig

### Checkout redirecter ikke
- Sjekk at `STRIPE_SECRET_KEY` er satt
- Verifiser at checkout-endepunktet returnerer riktig URL
- Sjekk browser console for feilmeldinger

