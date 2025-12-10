# Coin Shop Implementasjon - Oppsummering

## ✅ Hva er implementert

### 1. Database Schema
- ✅ `supabase_migration.sql` - Oppretter `user_profiles`-tabell med `coins`-felt
- ✅ Automatisk opprettelse av profil ved brukeropprettelse
- ✅ RLS (Row Level Security) policies for sikkerhet

### 2. Backend (Supabase Edge Function)
- ✅ `/checkout` endpoint - Oppretter Stripe Checkout session
- ✅ `/webhook` endpoint - Håndterer Stripe webhook events
- ✅ `/deduct-coins` endpoint - Trekker coins fra brukerens profil

### 3. Frontend Komponenter
- ✅ `CoinShop.tsx` - Viser coin-balanse og kjøp-knapp
- ✅ `SuccessPage.tsx` - Takk-siden etter kjøp
- ✅ Oppdatert `upload-section.tsx` med:
  - Coin-kostnad kalkulasjon
  - Coin-trekk ved QR-generering
  - Visning av coin-kostnad i UI
  - Disable av "Generer QR"-knapp ved mangel på coins

### 4. Auth Context
- ✅ Utvidet med `coins` state
- ✅ `refreshCoins()` funksjon for å oppdatere balanse
- ✅ Automatisk henting av coins ved innlogging

### 5. API Client
- ✅ `createCheckoutSession()` - Starter Stripe checkout
- ✅ `deductCoins()` - Trekker coins fra profil

### 6. Routing
- ✅ `/success` route lagt til i App.tsx

### 7. Oversettelser
- ✅ Norske og engelske oversettelser for alle nye strings
- ✅ Coin-relaterte meldinger
- ✅ Success page meldinger

## 📋 Coin-kostnad logikk

Gratis tier (0 coins):
- Opptil 1 MB filstørrelse
- 10 minutter levetid
- Ingen passordbeskyttelse

Premium features (koster coins):
- **+1 coin** for passordbeskyttelse
- **+1 coin per 2 MB** ekstra (utover 1 MB)
- **+1 coin per 24 timer** ekstra levetid (utover 10 minutter)

Eksempler:
- 1 MB, 10 min, ingen passord = **0 coins** (gratis)
- 3 MB, 10 min, ingen passord = **1 coin** (1 MB ekstra = 0.5 → 1 coin)
- 1 MB, 24 timer, ingen passord = **1 coin** (14 timer ekstra = 0.58 → 1 coin)
- 5 MB, 24 timer, med passord = **4 coins** (4 MB ekstra = 2 coins + 14 timer = 1 coin + passord = 1 coin)

## 🔧 Neste steg (må gjøres manuelt)

### 1. Kjør database-migrasjon
```sql
-- Kjør filen supabase_migration.sql i Supabase SQL Editor
```

### 2. Sett opp Stripe
- Følg instruksjonene i `STRIPE_SETUP.md`
- Legg til Stripe API keys i Supabase Edge Function secrets
- Konfigurer webhook i Stripe Dashboard

### 3. Test
- Test checkout-flow
- Test webhook-håndtering
- Test coin-trekk ved QR-generering

## 🐛 Kjente issues / Forbedringer

1. **Rollback ved feil**: Hvis QR-generering lykkes men coin-trekk feiler, er det ingen automatisk rollback. Dette bør håndteres bedre i produksjon.

2. **Coin-balance refresh**: Success-siden refresher coins, men det kan ta noen sekunder før webhook har prosessert betalingen.

3. **Error handling**: Flere error-meldinger kan forbedres med mer spesifikke feilmeldinger.

## 📝 Miljøvariabler som trengs

I Supabase Edge Function secrets:
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret

## 🎯 Testing Checklist

- [ ] Database-migrasjon kjørt
- [ ] Stripe-konto opprettet
- [ ] Stripe produkt opprettet (50 coins, 29 NOK)
- [ ] Webhook konfigurert i Stripe
- [ ] Miljøvariabler satt i Supabase
- [ ] Test checkout-flow
- [ ] Test webhook (via Stripe Dashboard)
- [ ] Test coin-trekk ved QR-generering
- [ ] Test med utilstrekkelig coins (skal blokkere generering)
- [ ] Test gratis tier (skal fungere uten coins)


