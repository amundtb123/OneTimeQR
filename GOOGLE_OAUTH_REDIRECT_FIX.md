# Fikse Google OAuth redirect_uri_mismatch Feil

## Problemet

Du får feilmelding: **"Feil 400: redirect_uri_mismatch"**

Dette betyr at redirect URI-en som brukes i OAuth-flyten ikke matcher det som er konfigurert i Google Cloud Console.

## Årsak

Etter at du har lagt til custom domain (`auth.onetimeqr.com`) i Supabase, må Google OAuth credentials oppdateres til å bruke den nye callback URL-en.

## Løsning: Oppdater Google OAuth Redirect URIs

### Steg 1: Gå til Google Cloud Console

1. Gå til: https://console.cloud.google.com/apis/credentials
2. Velg riktig prosjekt (hvis du har flere)
3. Finn OAuth 2.0 Client ID-en din (den som brukes for Supabase)
4. Klikk på den for å redigere

### Steg 2: Oppdater Authorized redirect URIs

Under **"Authorized redirect URIs"**, legg til BEGGE disse URLs:

1. **Gammel callback URL** (behold denne):
   ```
   https://ofrtokcrfovjwfkcnjef.supabase.co/auth/v1/callback
   ```

2. **Ny callback URL med custom domain** (legg til denne):
   ```
   https://auth.onetimeqr.com/auth/v1/callback
   ```

**Viktig:** 
- Begge må være med `https://`
- Ingen trailing slash `/` på slutten
- Eksakt match med det Supabase sender

### Steg 3: Oppdater Authorized JavaScript origins (valgfritt, men anbefalt)

Under **"Authorized JavaScript origins"**, legg til:

```
https://onetimeqr.com
https://www.onetimeqr.com
https://auth.onetimeqr.com
```

### Steg 4: Lagre

1. Klikk **"Save"** nederst på siden
2. Vent 1-2 minutter (endringer kan ta litt tid å propagere)

### Steg 5: Test på nytt

1. Tøm browser cache (Cmd+Shift+R eller Ctrl+Shift+R)
2. Gå til `https://onetimeqr.com`
3. Klikk "Logg inn med Google"
4. Du skal nå ikke få `redirect_uri_mismatch` feil

## Hvorfor begge URLs?

- **Gammel URL** (`ofrtokcrfovjwfkcnjef.supabase.co`): Fungerer fortsatt som fallback
- **Ny URL** (`auth.onetimeqr.com`): Brukes når custom domain er aktivt

Supabase kan bruke begge avhengig av konfigurasjon, så det er tryggest å ha begge.

## Sjekkliste

- [ ] Gått til Google Cloud Console → Credentials
- [ ] Funnet OAuth 2.0 Client ID
- [ ] Lagt til `https://ofrtokcrfovjwfkcnjef.supabase.co/auth/v1/callback` i Redirect URIs
- [ ] Lagt til `https://auth.onetimeqr.com/auth/v1/callback` i Redirect URIs
- [ ] Lagt til JavaScript origins (`onetimeqr.com`, `www.onetimeqr.com`, `auth.onetimeqr.com`)
- [ ] Klikket "Save"
- [ ] Ventet 1-2 minutter
- [ ] Testet innlogging på nytt

## Hvis det fortsatt ikke fungerer

### Sjekk hvilken callback URL Supabase faktisk bruker

1. Åpne browser Developer Tools (F12)
2. Gå til "Network" tab
3. Prøv å logge inn
4. Se etter requests til `accounts.google.com` eller `oauth2.googleapis.com`
5. Sjekk `redirect_uri` parameteren i requesten
6. Sørg for at denne URL-en er i Google Cloud Console

### Sjekk Supabase Custom Domain konfigurasjon

1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/url-configuration
2. Sjekk at custom domain er aktivt
3. Sjekk at Site URL er satt riktig

### Sjekk Supabase Auth Providers

1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/providers
2. Klikk på **Google** provider
3. Verifiser at Client ID og Client Secret er riktig
4. Sjekk at "Enable Google provider" er aktivert

## Alternativ: Bruk bare gammel URL

Hvis custom domain ikke er kritisk akkurat nå, kan du:

1. Fjern custom domain fra Supabase (midlertidig)
2. Bruk bare `https://ofrtokcrfovjwfkcnjef.supabase.co/auth/v1/callback` i Google
3. Test at innlogging fungerer
4. Legg til custom domain senere når alt fungerer

## Viktig å vite

- Google OAuth redirect URIs må matche **nøyaktig** (inkludert `https://`, ingen trailing slash)
- Endringer kan ta 1-5 minutter å propagere
- Test i inkognito/private mode for å unngå cache-problemer
