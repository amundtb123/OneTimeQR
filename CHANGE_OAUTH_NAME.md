# Endre OAuth-navn fra Supabase til OneTimeQR

## Problem
Når brukere logger inn via Google, ser de:
**"Fortsett til ofrtokcrfovjwfkcnjef.supabase.co"**

Dette ser ikke profesjonelt ut. Vi vil endre det til:
**"Fortsett til OneTimeQR"**

## Løsning: Endre prosjektnavn i Supabase

### Steg 1: Gå til Project Settings
1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/settings/general
2. Eller naviger manuelt:
   - Gå til [Supabase Dashboard](https://app.supabase.com)
   - Velg prosjektet ditt (`ofrtokcrfovjwfkcnjef`)
   - Klikk på **Settings** (⚙️) i venstre meny
   - Klikk på **General**

### Steg 2: Endre Project Name
1. Under **"Project Name"**, endre fra:
   - `ofrtokcrfovjwfkcnjef` (eller hva det nå heter)
   
   Til:
   - `OneTimeQR`

2. Klikk **Save**

### Steg 3: Verifiser
1. Vent 1-2 minutter (endringer kan ta litt tid å propagere)
2. Test innlogging på nytt:
   - Gå til `https://onetimeqr.com`
   - Klikk "Logg inn med Google"
   - Du skal nå se **"Fortsett til OneTimeQR"** i stedet for Supabase-domenet

## Alternativ: Endre via API (hvis Project Name ikke fungerer)

Hvis Project Name ikke endrer OAuth-teksten, kan det være at Supabase bruker en annen innstilling. I så fall:

### Sjekk Authentication Settings
1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/url-configuration
2. Se etter felt som heter:
   - "Application Name"
   - "Site Name"
   - "OAuth Display Name"
   
   Hvis noen av disse finnes, endre dem til `OneTimeQR`

## ⚠️ Viktig
- Endringer kan ta 1-5 minutter å propagere
- Test i inkognito/private mode for å unngå cache-problemer
- Hvis det ikke fungerer, kan det være at Google OAuth bruker en egen "Application Name" som må endres i Google Cloud Console

## 🔍 Hvis det fortsatt ikke fungerer

Hvis Project Name ikke endrer OAuth-teksten, kan det være at Google OAuth bruker en egen innstilling:

### Sjekk Google Cloud Console
1. Gå til: https://console.cloud.google.com/apis/credentials
2. Finn OAuth 2.0 Client ID-en din
3. Klikk på den for å redigere
4. Se etter "Application name" eller "Product name"
5. Endre dette til `OneTimeQR`
6. Lagre

Denne innstillingen kan også påvirke hva som vises i OAuth-flyten.
