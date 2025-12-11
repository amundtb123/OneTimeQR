# Steg-for-steg Guide: Deploy til Netlify

## 📋 Oversikt
Vi skal deploye OneTimeQR til Netlify steg for steg. Følg instruksjonene nøye.

---

## STEG 1: Installer dependencies lokalt (hvis ikke allerede gjort)

### Hva skal du gjøre:
1. Åpne Terminal (på Mac: trykk `Cmd + Space`, skriv "Terminal")
2. Naviger til prosjektmappen:
   ```bash
   cd /Users/a01546/OneTimeQR
   ```
3. Installer alle pakker:
   ```bash
   npm install
   ```
   Dette kan ta 1-2 minutter.

### ✅ Hvordan vet du at det fungerte?
Du skal se noe som:
```
added 500 packages, and audited 501 packages in 2m
```

### ❌ Hvis det feiler:
- Sjekk at du er i riktig mappe (`/Users/a01546/OneTimeQR`)
- Prøv igjen: `npm install`

---

## STEG 2: Test at build fungerer lokalt

### Hva skal du gjøre:
I samme Terminal, skriv:
```bash
npm run build
```

### ✅ Hvordan vet du at det fungerte?
Du skal se noe som:
```
vite v6.3.5 building for production...
✓ built in 5.23s
```

Og det skal opprettes en `dist`-mappe.

### ❌ Hvis det feiler:
- Send meg feilmeldingen, så fikser vi det sammen

---

## STEG 3: Opprett Netlify-konto (hvis du ikke har det)

### Hva skal du gjøre:
1. Gå til: https://app.netlify.com/signup
2. Klikk på "Sign up with GitHub" (anbefalt) eller "Sign up with email"
3. Følg instruksjonene for å opprette konto
4. Bekreft e-posten din hvis nødvendig

### ✅ Hvordan vet du at det fungerte?
Du skal være logget inn på Netlify Dashboard.

---

## STEG 4: Deploy til Netlify (ENKLESTE METODEN)

### Hva skal du gjøre:

#### 4a. Bygg prosjektet (hvis du ikke gjorde det i STEG 2):
```bash
cd /Users/a01546/OneTimeQR
npm run build
```

#### 4b. Deploy via Netlify Dashboard:
1. Gå til: https://app.netlify.com
2. Du skal se en stor boks med "Want to deploy a new site without connecting to Git?"
3. Under den boksen, se etter "Sites" → "Add new site" → "Deploy manually"
4. Eller dra og slipp `dist`-mappen direkte inn i Netlify Dashboard

**Hvordan finne dist-mappen:**
- Åpne Finder
- Gå til `/Users/a01546/OneTimeQR`
- Du skal se en mappe som heter `dist`
- Dra hele `dist`-mappen inn i Netlify Dashboard

### ✅ Hvordan vet du at det fungerte?
- Netlify vil starte deployment
- Du får en URL som `https://random-name-123.netlify.app`
- Status skal bli "Published"

### ❌ Hvis det feiler:
- Sjekk at du dro `dist`-mappen (ikke en fil)
- Prøv å bygge på nytt: `npm run build`

---

## STEG 5: Legg til ditt domene (onetimeqr.com)

### Hva skal du gjøre:

#### 5a. I Netlify:
1. Gå til ditt site i Netlify Dashboard
2. Klikk på "Site settings" (øverst til høyre)
3. Klikk på "Domain management" i venstre meny
4. Klikk på "Add custom domain"
5. Skriv: `onetimeqr.com`
6. Klikk "Verify"

#### 5b. I Domeneshop.no:
1. Logg inn på: https://domeneshop.no
2. Gå til ditt domene (onetimeqr.com)
3. Klikk på "DNS" eller "DNS-innstillinger"
4. Legg til en ny DNS-post:
   - **Type:** CNAME (eller A Record hvis CNAME ikke fungerer)
   - **Navn:** @ (eller tom/root)
   - **Verdi:** `onetimeqr.netlify.app` (eller IP: `75.2.60.5` for A Record)
   - **TTL:** 3600
5. Lagre

### ✅ Hvordan vet du at det fungerer?
- I Netlify Dashboard, under "Domain management", skal du se at domenet er "Pending"
- Etter 10 minutter til 24 timer, skal det bli "Active"
- Du kan sjekke på: https://www.whatsmydns.net (skriv inn `onetimeqr.com`)

---

## STEG 6: Oppdater Supabase (for at innlogging skal fungere)

### Hva skal du gjøre:
1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/url-configuration
2. Under "Site URL", sett: `https://onetimeqr.com`
3. Under "Redirect URLs", legg til (hver på egen linje):
   ```
   https://onetimeqr.com
   https://onetimeqr.com/**
   https://www.onetimeqr.com
   https://www.onetimeqr.com/**
   ```
4. Klikk "Save"

### ✅ Hvordan vet du at det fungerer?
- Du kan teste ved å gå til `https://onetimeqr.com` og prøve å logge inn

---

## STEG 7: Test alt!

### Hva skal du gjøre:
1. Gå til: `https://onetimeqr.com` (eller ditt Netlify URL hvis DNS ikke er klar)
2. Test at siden laster
3. Test innlogging
4. Test opplasting av filer
5. Test QR-kode generering

### ✅ Alt fungerer!
Gratulerer! 🎉

---

## 🆘 Trenger du hjelp?

Hvis du står fast på noe:
1. Send meg hvilket steg du er på
2. Send meg eventuelle feilmeldinger
3. Jeg hjelper deg videre!

---

## 📝 Notater

- **DNS-propager kan ta tid:** Opptil 24 timer, men ofte raskere (10 minutter - 2 timer)
- **HTTPS aktiveres automatisk:** Netlify setter opp SSL-sertifikat automatisk
- **Fremtidige endringer:** Hvis du endrer kode, bygg på nytt (`npm run build`) og deploy `dist`-mappen igjen






