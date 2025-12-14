# Fikse Google Login Feil

## Feilmelding du får:
```json
{"code":500,"error_code":"unexpected_failure","msg":"Unexpected failure, please check server logs for more information"}
```

## 🔍 Mulige årsaker (i rekkefølge):

### 1. ⚠️ Supabase Redirect URLs ikke konfigurert (MEST SANNSYNLIG)

Supabase må vite hvilke URLs den kan redirecte til etter innlogging.

#### Sjekk og fiks:
1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/url-configuration
2. Under **Site URL**, sett:
   ```
   https://onetimeqr.com
   ```
3. Under **Redirect URLs**, legg til (hver på egen linje):
   ```
   https://onetimeqr.com
   https://onetimeqr.com/**
   https://www.onetimeqr.com
   https://www.onetimeqr.com/**
   ```
4. **VIKTIG:** Hvis du også bruker Netlify URL (magical-frangipane-c83ef8.netlify.app), legg den også til:
   ```
   https://magical-frangipane-c83ef8.netlify.app
   https://magical-frangipane-c83ef8.netlify.app/**
   ```
5. Klikk **Save**

### 2. ⚠️ HTTPS ikke aktivt ennå

Supabase krever HTTPS for OAuth redirects. Hvis domenet ditt ikke har HTTPS aktivt ennå, vil innlogging feile.

#### Sjekk:
1. Gå til Netlify Dashboard → Site settings → Domain management
2. Sjekk SSL-status for `onetimeqr.com`
3. Hvis det står "Provisioning", vent 5-15 minutter
4. Hvis det står "Failed", se HTTPS_FIX.md

#### Test:
- Gå til `https://onetimeqr.com` (ikke `http://`)
- Browser skal ikke vise "Not secure" advarsel
- URL-en skal starte med `https://`

### 3. ⚠️ Google OAuth ikke konfigurert i Supabase

Google OAuth må være aktivert og konfigurert i Supabase.

#### Sjekk og fiks:
1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/providers
2. Klikk på **Google** provider
3. Sjekk at **"Enable Google provider"** er aktivert
4. Hvis det mangler Client ID og Client Secret:
   - Du må opprette Google OAuth credentials
   - Se "Google OAuth Setup" under

### 4. ⚠️ Feil domene i redirect

Hvis du tester på Netlify URL, men Supabase Redirect URLs bare har onetimeqr.com, vil det feile.

#### Løsning:
Legg til BÅDE domenet ditt OG Netlify URL i Redirect URLs (se steg 1 over).

---

## 🔧 Google OAuth Setup (hvis ikke allerede gjort)

Hvis Google OAuth ikke er konfigurert i Supabase:

### Steg 1: Opprett Google OAuth Credentials
1. Gå til: https://console.cloud.google.com/apis/credentials
2. Klikk "Create Credentials" → "OAuth client ID"
3. Velg "Web application"
4. **Authorized JavaScript origins:**
   - Legg til: `https://onetimeqr.com`
   - Legg til: `https://magical-frangipane-c83ef8.netlify.app`
5. **Authorized redirect URIs:**
   - Legg til: `https://ofrtokcrfovjwfkcnjef.supabase.co/auth/v1/callback`
6. Klikk "Create"
7. Kopier **Client ID** og **Client Secret**

### Steg 2: Konfigurer i Supabase
1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/providers
2. Klikk på **Google**
3. Lim inn **Client ID** og **Client Secret**
4. Klikk **Save**

---

## ✅ Sjekkliste

Gå gjennom hver punkt:

- [ ] Supabase Redirect URLs inkluderer `https://onetimeqr.com`
- [ ] Supabase Redirect URLs inkluderer `https://onetimeqr.com/**`
- [ ] Supabase Redirect URLs inkluderer Netlify URL (hvis du tester der)
- [ ] Site URL er satt til `https://onetimeqr.com`
- [ ] HTTPS er aktivt på onetimeqr.com (ikke "Provisioning")
- [ ] Google OAuth er aktivert i Supabase
- [ ] Google OAuth har Client ID og Client Secret
- [ ] Google OAuth redirect URI inkluderer Supabase callback URL

---

## 🧪 Test etter fiksing

1. **Tøm browser cache:**
   - Cmd+Shift+R (Mac) eller Ctrl+Shift+R (Windows)
   - Eller prøv i inkognito/private mode

2. **Test innlogging:**
   - Gå til `https://onetimeqr.com`
   - Klikk "Logg inn"
   - Velg Google-konto
   - Du skal bli redirectet tilbake og være innlogget

3. **Sjekk browser console:**
   - Trykk F12 (eller Cmd+Option+I på Mac)
   - Gå til "Console" tab
   - Se etter feilmeldinger

---

## 🆘 Hvis det fortsatt ikke fungerer

1. **Sjekk Supabase logs:**
   - Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/logs/explorer
   - Se etter auth-relaterte feil

2. **Test med Netlify URL:**
   - Prøv å logge inn på `https://magical-frangipane-c83ef8.netlify.app`
   - Hvis det fungerer der, er problemet med domenet/HTTPS

3. **Send meg:**
   - Hva du ser i browser console (F12)
   - Hva som står i Supabase Redirect URLs
   - Om HTTPS er aktivt











