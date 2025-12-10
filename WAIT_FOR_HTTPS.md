# Vent på HTTPS - Dette er årsaken!

## 🔍 Problemet

Supabase krever **HTTPS** for OAuth redirects. Hvis domenet ditt ikke har HTTPS aktivt ennå, vil innlogging alltid feile med:
```json
{"code":500,"error_code":"unexpected_failure"}
```

## ✅ Løsning: Vent til HTTPS er aktivt

Netlify aktiverer HTTPS automatisk, men det tar litt tid.

### Steg 1: Sjekk HTTPS-status i Netlify

1. Gå til **Netlify Dashboard**
2. Klikk på ditt site
3. Klikk på **"Site settings"** (øverst til høyre)
4. Klikk på **"Domain management"** i venstre meny
5. Se på ditt domene (`onetimeqr.com`)
6. Se etter **"SSL certificate"** eller **"HTTPS"** status

### Status-betydning:

- ⏳ **"Provisioning"** = Netlify jobber med det, vent 5-15 minutter
- ✅ **"Active"** = HTTPS er aktivt! Du kan teste innlogging nå
- ❌ **"Failed"** = Noe gikk galt, se feilsøking under

### Steg 2: Hvordan vite når det er klart

1. **Sjekk i Netlify Dashboard:**
   - Gå tilbake til Domain management hvert 5. minutt
   - Når status endres fra "Provisioning" til "Active", er det klart

2. **Test i nettleseren:**
   - Gå til `https://onetimeqr.com`
   - Hvis browser IKKE viser "Not secure" advarsel = HTTPS er aktivt
   - Hvis URL-en har et lås-ikon 🔒 = HTTPS er aktivt

3. **Test direkte:**
   - Prøv å gå til `https://onetimeqr.com`
   - Hvis siden laster uten advarsel = HTTPS fungerer

### Steg 3: Når HTTPS er aktivt

1. Vent 1-2 minutter ekstra (for at alt skal propagere)
2. Tøm browser cache (Cmd+Shift+R)
3. Prøv å logge inn igjen
4. Det skal nå fungere! 🎉

---

## ⏱️ Hvor lang tid tar det?

- **Vanligvis:** 5-15 minutter etter at DNS er konfigurert
- **Maksimalt:** Opptil 24 timer (sjeldent)
- **Hvis det tar lenger:** Se feilsøking under

---

## 🔧 Hvis HTTPS ikke aktiveres automatisk

### Løsning 1: Verifiser DNS
1. I Netlify → Domain management
2. Klikk på ditt domene
3. Klikk **"Verify DNS configuration"**
4. Sjekk at alle DNS-poster er riktige

### Løsning 2: Force HTTPS
1. I Domain management, klikk på ditt domene
2. Se etter **"Force HTTPS"** toggle
3. Aktiver den hvis den ikke allerede er aktivert

### Løsning 3: Sjekk DNS-propager
1. Gå til: https://www.whatsmydns.net
2. Skriv inn `onetimeqr.com`
3. Sjekk at DNS peker til Netlify
4. Hvis ikke, vent litt lenger

---

## 🧪 Test når HTTPS er aktivt

1. **Sjekk URL:**
   - Gå til `https://onetimeqr.com`
   - URL-en skal starte med `https://` (ikke `http://`)
   - Browser skal ikke vise "Not secure"

2. **Test innlogging:**
   - Klikk "Logg inn"
   - Velg Google-konto
   - Du skal nå bli redirectet tilbake og være innlogget

---

## 📝 Notater

- **Ikke test innlogging før HTTPS er aktivt** - det vil alltid feile
- **Vent til Netlify viser "Active"** for SSL-sertifikat
- **HTTPS aktiveres automatisk** - du trenger ikke gjøre noe annet enn å vente

---

## 🆘 Hvis det tar for lang tid

1. Vent minst 1 time etter DNS-endring
2. Sjekk Netlify status: https://www.netlifystatus.com
3. Kontakt Netlify support via Dashboard hvis det fortsatt ikke fungerer etter 24 timer





