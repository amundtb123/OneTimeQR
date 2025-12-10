# 🔧 Fiks 401-feil på Webhook

## Problem
Alle webhook-events fra Stripe får `401 ERR` (Unauthorized).

## Årsak
Supabase Edge Functions krever JWT verification som standard. Stripe sender ikke Authorization header, bare `stripe-signature` header.

## Løsning: Deaktiver JWT Verification

### Metode 1: Via Supabase Dashboard (hvis mulig)

1. Gå til Supabase Dashboard → Edge Functions → `make-server-c3c9181e`
2. Se etter innstillinger som:
   - "Verify JWT"
   - "JWT Verification" 
   - "Require Authentication"
3. **Deaktiver** denne innstillingen
4. Deploy på nytt

**⚠️ Hvis du ikke ser denne innstillingen i Dashboard, må du bruke CLI (Metode 2)**

### Metode 2: Via Supabase CLI (Anbefalt)

#### Steg 1: Installer Supabase CLI
```bash
npm install -g supabase
```

#### Steg 2: Logg inn
```bash
supabase login
```

#### Steg 3: Link til prosjektet
```bash
cd /Users/a01546/OneTimeQR
supabase link --project-ref ofrtokcrfovjwfkcnjef
```

#### Steg 4: Deploy med --no-verify-jwt
```bash
supabase functions deploy make-server-c3c9181e --no-verify-jwt
```

**Dette deaktiverer JWT verification for hele funksjonen.**

### Metode 3: Opprett separat webhook-funksjon (Avansert)

Hvis du vil beholde JWT verification for andre endepunkter, kan du opprette en separat funksjon bare for webhook:

1. Opprett ny funksjon: `stripe-webhook`
2. Kopier bare webhook-koden dit
3. Deploy med `--no-verify-jwt`
4. Oppdater webhook URL i Stripe til den nye funksjonen

## Verifiser at det fungerer

1. Test webhook i Stripe Dashboard → Webhooks → "Send test webhook"
2. Sjekk Supabase logs - du skal se `🔔 Webhook received!`
3. Sjekk Stripe Dashboard - webhook skal nå ha status `200 OK` i stedet for `401 ERR`

## Viktig

- `--no-verify-jwt` deaktiverer JWT verification for **hele funksjonen**
- Dette betyr at alle endepunkter i funksjonen ikke lenger krever auth
- For webhook er dette OK, men sørg for at andre endepunkter har egen auth-sjekk i koden (som de allerede har)
