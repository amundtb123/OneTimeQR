# Fikse HTTPS/SSL på Netlify

## Hvorfor får du "ikke sikker" advarsel?

Når du legger til et nytt domene på Netlify, tar det litt tid før SSL-sertifikatet (HTTPS) aktiveres automatisk. Dette kan ta:
- **5-15 minutter** (vanligvis)
- **Opptil 24 timer** (sjeldent)

## ✅ Sjekk SSL-status i Netlify

### Steg 1: Gå til Domain Management
1. I Netlify Dashboard, gå til ditt site
2. Klikk på **"Site settings"**
3. Klikk på **"Domain management"** i venstre meny

### Steg 2: Sjekk SSL-status
- Du skal se ditt domene (`onetimeqr.com`)
- Under domenet skal det stå **"SSL certificate"** eller **"HTTPS"**
- Status kan være:
  - ✅ **"Active"** - Alt fungerer!
  - ⏳ **"Provisioning"** - Vent litt (5-15 min)
  - ❌ **"Failed"** - Se feilsøking under

### Steg 3: Hvis det står "Provisioning"
- Vent 5-15 minutter
- Oppdater siden
- Det skal automatisk bli "Active"

## 🔧 Hvis HTTPS ikke aktiveres automatisk

### Løsning 1: Verifiser DNS
1. Gå til **Domain management** i Netlify
2. Klikk på ditt domene
3. Klikk på **"Verify DNS configuration"**
4. Sjekk at alle DNS-poster er riktige

### Løsning 2: Force SSL
1. I **Domain management**, klikk på ditt domene
2. Se etter **"Force HTTPS"** eller **"HTTPS"** toggle
3. Aktiver den hvis den ikke allerede er aktivert

### Løsning 3: Sjekk DNS-propager
1. Gå til: https://www.whatsmydns.net
2. Skriv inn `onetimeqr.com`
3. Sjekk at DNS peker til Netlify
4. Hvis ikke, vent litt lenger (DNS kan ta tid)

## ⚠️ Vanlige problemer

### Problem: "Certificate provisioning failed"
**Løsning:**
- Sjekk at DNS peker riktig
- Vent 15 minutter og prøv igjen
- Kontakt Netlify support hvis det fortsatt feiler

### Problem: "Mixed content" (noen sider er HTTPS, noen HTTP)
**Løsning:**
- Sjekk at alle lenker i koden bruker `https://`
- Vår kode bruker `window.location.origin` som automatisk bruker riktig protokoll ✅

### Problem: Browser viser "Not secure" selv om sertifikat er aktivt
**Løsning:**
- Tøm browser cache
- Prøv i inkognito/private mode
- Prøv en annen browser

## 🎯 Rask sjekkliste

- [ ] DNS er konfigurert riktig i domeneshop.no
- [ ] Domene er lagt til i Netlify
- [ ] Ventet 5-15 minutter etter DNS-endring
- [ ] Sjekket SSL-status i Netlify Dashboard
- [ ] "Force HTTPS" er aktivert
- [ ] Testet i nettleseren (prøv hard refresh: Cmd+Shift+R)

## 📞 Hvis ingenting fungerer

1. Vent minst 1 time etter DNS-endring
2. Sjekk Netlify status: https://www.netlifystatus.com
3. Kontakt Netlify support via Dashboard





