# 🚀 Guide: Deploy Supabase Edge Function

## Metode 1: Via Supabase Dashboard (Anbefalt - Enklest)

### Steg 1: Gå til Supabase Dashboard
1. Åpne [https://app.supabase.com](https://app.supabase.com)
2. Logg inn og velg ditt prosjekt

### Steg 2: Naviger til Edge Functions
- I venstre meny, klikk på **"Edge Functions"**
- Eller gå til **Project Settings** → **Edge Functions**

### Steg 3: Finn eller opprett funksjonen
**Hvis funksjonen allerede finnes:**
- Klikk på funksjonen `make-server-c3c9181e`
- Klikk på **"Edit"** eller **"Update"** knappen

**Hvis funksjonen ikke finnes:**
- Klikk **"Create function"** eller **"New function"**
- Navn: `make-server-c3c9181e`

### Steg 4: Kopier koden fra filen
1. Åpne filen: `src/supabase/functions/server/index-standalone.tsx`
2. Kopier **alt innholdet** (Ctrl+A / Cmd+A, deretter Ctrl+C / Cmd+C)

### Steg 5: Lim inn i Dashboard
1. I kodeeditoren i Supabase Dashboard
2. Slett all eksisterende kode (hvis noen)
3. Lim inn den kopierte koden (Ctrl+V / Cmd+V)

### Steg 6: Deaktiver JWT Verification (VIKTIG for webhook!)
**⚠️ VIKTIG:** Webhook-endepunktet må ha JWT verification deaktivert, ellers får du 401-feil!

**I Supabase Dashboard:**
1. Etter at du har limt inn koden, se etter en innstilling som heter:
   - **"Verify JWT"** eller **"JWT Verification"**
   - **"Require Authentication"** eller lignende
2. **Deaktiver** denne innstillingen (sett til "Off" eller "Disabled")
3. Hvis du ikke ser denne innstillingen, må du bruke CLI-metoden nedenfor

**Alternativt - Via CLI (anbefalt for webhook):**
Se "Metode 2" nedenfor - bruk `--no-verify-jwt` flag.

### Steg 7: Deploy
1. Klikk på **"Deploy"** eller **"Save"** knappen
2. Vent til deploy er ferdig (vanligvis 1-2 minutter)
3. Du skal se en bekreftelse når det er ferdig

### Steg 7: Verifiser
- Sjekk at funksjonen viser status "Active" eller "Deployed"
- Test at checkout fungerer i appen

---

## Metode 2: Via Supabase CLI (Avansert)

### Steg 1: Installer Supabase CLI
```bash
npm install -g supabase
```

### Steg 2: Logg inn
```bash
supabase login
```

### Steg 3: Link til prosjektet
```bash
supabase link --project-ref ofrtokcrfovjwfkcnjef
```
*(Erstatt med ditt prosjekt-ID hvis det er annerledes)*

### Steg 4: Deploy funksjonen (MED --no-verify-jwt for webhook!)
**⚠️ VIKTIG:** Bruk `--no-verify-jwt` flag for å tillate webhook-requests uten auth!

```bash
cd /Users/a01546/OneTimeQR
supabase functions deploy make-server-c3c9181e --no-verify-jwt --project-ref ofrtokcrfovjwfkcnjef
```

**Eller hvis du allerede er linket:**
```bash
supabase functions deploy make-server-c3c9181e --no-verify-jwt
```

Dette deaktiverer JWT verification for hele funksjonen, som er nødvendig for at Stripe webhook skal fungere.

---

## ✅ Sjekkliste etter deployment

- [ ] Funksjonen er deployet og viser status "Active"
- [ ] Test at checkout fungerer (Apple Pay skal nå vises)
- [ ] Test at webhook mottar events (sjekk Supabase logs)

---

## 🔍 Hvor finner jeg filen?

Filen ligger i prosjektet ditt:
```
OneTimeQR/
  └── src/
      └── supabase/
          └── functions/
              └── server/
                  └── index-standalone.tsx  ← Denne filen!
```

---

## ❓ Problemer?

**Funksjonen finnes ikke:**
- Opprett en ny funksjon med navnet `make-server-c3c9181e`

**Kan ikke deploye:**
- Sjekk at du har riktige rettigheter i Supabase-prosjektet
- Sjekk at alle secrets er satt (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)

**Får feilmeldinger:**
- Sjekk Supabase Edge Function logs i Dashboard
- Sjekk at alle miljøvariabler er satt riktig






