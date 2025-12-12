# 🚀 Enkel Deploy Guide - Edge Function

## Du har allerede deaktivert JWT Verification ✅

Nå må du bare deploye på nytt:

### Steg 1: Gå til Supabase Dashboard
1. Åpne [https://app.supabase.com](https://app.supabase.com)
2. Logg inn og velg prosjektet ditt

### Steg 2: Gå til Edge Functions
- I venstre meny: Klikk **"Edge Functions"**
- Klikk på funksjonen **`make-server-c3c9181e`**

### Steg 3: Deploy på nytt
1. I kodeeditoren, se etter en knapp som heter:
   - **"Deploy"** 
   - **"Save and Deploy"**
   - **"Update"**
   - Eller en "Deploy" knapp øverst til høyre
2. Klikk på denne knappen
3. Vent 1-2 minutter til deploy er ferdig

### Steg 4: Verifiser
1. Test webhook i Stripe Dashboard → "Send test webhook"
2. Sjekk Supabase logs - du skal nå se `🔔 Webhook received!`
3. Sjekk Stripe Dashboard - webhook skal ha status `200 OK` i stedet for `401 ERR`

---

## Hvis du ikke ser "Deploy"-knappen

Prøv å:
1. Scroll ned i kodeeditoren
2. Se etter en "Save" eller "Update" knapp nederst
3. Eller trykk `Cmd+S` / `Ctrl+S` for å lagre, og se om det trigger deploy

---

## Etter deploy

Test en ny betaling og sjekk om coins oppdateres! 🎉


