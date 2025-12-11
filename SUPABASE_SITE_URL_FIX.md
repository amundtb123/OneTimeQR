# Fikse Site URL med mellomrom - Dette er problemet!

## 🔍 Problemet

I callback URL-en ser jeg at `site_url` har ekstra mellomrom:
```
"site_url":"   https://onetimeqr.com"
```

Dette kan forårsake 500-feilen! Supabase er sensitiv til formatering.

## ✅ Løsning: Fiks Site URL i Supabase

### Steg 1: Gå til Supabase URL Configuration
1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/url-configuration

### Steg 2: Fiks Site URL
1. Under **"Site URL"** (ikke Redirect URLs)
2. **Slett alt** i feltet
3. **Skriv inn på nytt** (uten mellomrom):
   ```
   https://onetimeqr.com
   ```
4. **VIKTIG:** 
   - Ingen mellomrom før eller etter
   - Ingen trailing slash `/` på slutten
   - Start direkte med `https://`

### Steg 3: Sjekk Redirect URLs også
Under **"Redirect URLs"**, sjekk at alle URLs er riktig formatert:
- Ingen mellomrom
- Ingen trailing slash
- Starter med `https://`

Eksempel på riktig:
```
https://onetimeqr.com
https://www.onetimeqr.com
https://magical-frangipane-c83ef8.netlify.app
```

### Steg 4: Lagre
1. Klikk **"Save"** nederst på siden
2. Vent 10-30 sekunder

### Steg 5: Test på nytt
1. Tøm browser cache (Cmd+Shift+R)
2. Gå til `https://onetimeqr.com`
3. Prøv å logge inn igjen

## 🔍 Hvordan sjekke om det er fikset

Etter at du har lagret, kan du sjekke ved å:
1. Gå tilbake til URL Configuration
2. Se på Site URL - den skal være nøyaktig: `https://onetimeqr.com`
3. Ingen mellomrom, ingen trailing slash

## ⚠️ Vanlige feil

- ❌ `   https://onetimeqr.com` (mellomrom før)
- ❌ `https://onetimeqr.com   ` (mellomrom etter)
- ❌ `https://onetimeqr.com/` (trailing slash)
- ✅ `https://onetimeqr.com` (riktig!)

## 🧪 Test etter fiksing

1. **Tøm browser cache:**
   - Cmd+Shift+R (Mac) eller Ctrl+Shift+R (Windows)
   - Eller prøv i inkognito/private mode

2. **Test innlogging:**
   - Gå til `https://onetimeqr.com`
   - Klikk "Logg inn"
   - Velg Google-konto
   - Du skal nå bli redirectet tilbake og være innlogget

3. **Sjekk browser console:**
   - Trykk F12 (eller Cmd+Option+I på Mac)
   - Gå til "Console" tab
   - Se etter feilmeldinger

## 🆘 Hvis det fortsatt ikke fungerer

1. **Sjekk at HTTPS er aktivt:**
   - Gå til Netlify → Domain management
   - SSL-status skal være "Active"

2. **Sjekk Supabase logs:**
   - Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/logs/explorer
   - Se etter auth-relaterte feil

3. **Send meg:**
   - Hva som står i Site URL (kopier og lim inn)
   - Hva som står i Redirect URLs
   - Eventuelle feilmeldinger fra browser console






