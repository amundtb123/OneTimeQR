# Fikse Supabase Redirect URLs - Steg for steg

## Problem: URLs blir "ugyldige" når du legger dem inn

Dette kan skyldes flere ting. La oss fikse det steg for steg.

---

## ✅ Riktig format for Supabase Redirect URLs

### Format-regler:
1. **Må starte med `https://`** (ikke `http://`)
2. **Ingen trailing slash** på slutten (ikke `https://onetimeqr.com/`)
3. **Wildcards:** Bruk `*` for wildcard, ikke `**`
4. **Hver URL på egen linje**

### ❌ FEIL format:
```
https://onetimeqr.com/
https://onetimeqr.com/**
http://onetimeqr.com
onetimeqr.com
```

### ✅ RIKTIG format:
```
https://onetimeqr.com
https://*.onetimeqr.com
https://magical-frangipane-c83ef8.netlify.app
https://*.netlify.app
```

---

## 🔧 Steg-for-steg: Legg inn URLs riktig

### Steg 1: Gå til riktig sted
1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/url-configuration
2. Scroll ned til **"Redirect URLs"**

### Steg 2: Legg inn URLs EN OM GANGEN

**VIKTIG:** Prøv å legge inn EN URL om gangen for å se hvilken som feiler.

#### Test 1: Enkel URL (uten wildcard)
Skriv inn:
```
https://onetimeqr.com
```
- Klikk utenfor boksen
- Hvis den blir rød/ugyldig, sjekk at:
  - Du har `https://` (ikke `http://`)
  - Ingen trailing slash `/` på slutten
  - Ingen mellomrom

#### Test 2: Wildcard for alle paths
Hvis Test 1 fungerte, legg til:
```
https://*.onetimeqr.com
```
Dette tillater alle subdomener og paths.

#### Test 3: Netlify URL (hvis du tester der)
```
https://magical-frangipane-c83ef8.netlify.app
```

#### Test 4: Wildcard for Netlify
```
https://*.netlify.app
```

### Steg 3: Site URL
Under **"Site URL"** (ikke Redirect URLs), sett:
```
https://onetimeqr.com
```
(Enkel URL, ingen wildcard)

---

## 🎯 Minimum som må fungere

For at innlogging skal fungere, trenger du MINST:

1. **Site URL:**
   ```
   https://onetimeqr.com
   ```

2. **Redirect URLs (minst én av disse):**
   ```
   https://onetimeqr.com
   ```
   ELLER
   ```
   https://*.onetimeqr.com
   ```

---

## ⚠️ Vanlige feil og løsninger

### Feil: "Invalid URL format"
**Løsning:**
- Sjekk at du har `https://` (ikke `http://`)
- Sjekk at det ikke er mellomrom
- Sjekk at det ikke er trailing slash `/` på slutten

### Feil: "Domain not verified"
**Løsning:**
- Dette kan bety at HTTPS ikke er aktivt ennå
- Vent til HTTPS er aktivt i Netlify (5-15 min)
- Prøv igjen

### Feil: URLs blir røde/ugyldige
**Løsning:**
- Prøv EN URL om gangen
- Start med den enkleste: `https://onetimeqr.com`
- Hvis den fungerer, legg til flere

### Feil: Wildcard fungerer ikke
**Løsning:**
- Supabase bruker `*` for wildcard, ikke `**`
- `https://*.onetimeqr.com` = riktig
- `https://onetimeqr.com/**` = feil

---

## 🧪 Test etter at du har lagt inn URLs

1. Klikk **"Save"** nederst på siden
2. Vent 10-30 sekunder
3. Gå til `https://onetimeqr.com`
4. Prøv å logge inn
5. Hvis det fortsatt feiler, sjekk browser console (F12)

---

## 📝 Eksempel på riktig oppsett

**Site URL:**
```
https://onetimeqr.com
```

**Redirect URLs (hver på egen linje):**
```
https://onetimeqr.com
https://*.onetimeqr.com
https://magical-frangipane-c83ef8.netlify.app
```

---

## 🆘 Hvis ingenting fungerer

1. **Prøv med bare Site URL først:**
   - Sett bare Site URL til `https://onetimeqr.com`
   - La Redirect URLs være tom
   - Lagre og test

2. **Sjekk HTTPS-status:**
   - Gå til Netlify → Domain management
   - Sjekk at SSL er "Active" (ikke "Provisioning")

3. **Test med Netlify URL:**
   - Legg til Netlify URL i Redirect URLs
   - Test innlogging på Netlify URL
   - Hvis det fungerer der, er problemet med domenet

4. **Send meg:**
   - Hvilken feilmelding du får (ord for ord)
   - Hva som står i Site URL
   - Hva du har prøvd å legge inn i Redirect URLs



