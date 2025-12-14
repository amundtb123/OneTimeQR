# Fikse DNS for HTTPS - Steg for steg

## 🔍 Problemet

Netlify kan ikke opprette SSL-sertifikat fordi DNS-poster ikke peker på Netlify sine servere ennå.

## ✅ Løsning: Verifiser DNS

### Steg 1: Klikk på "Verify DNS configuration" i Netlify

1. I Netlify Dashboard, under HTTPS-seksjonen
2. Klikk på den grønne knappen **"Verify DNS configuration"**
3. Netlify vil sjekke om DNS-poster er riktig

### Steg 2: Sjekk hva Netlify sier

Etter at du klikker "Verify DNS configuration", vil Netlify vise deg:
- ✅ Hvilke DNS-poster som er riktige
- ❌ Hvilke DNS-poster som mangler eller er feil

---

## 🔧 Hvis DNS ikke er riktig konfigurert

### Sjekk DNS i Domeneshop.no

1. Logg inn på: https://domeneshop.no
2. Gå til ditt domene (onetimeqr.com)
3. Klikk på **"DNS"** eller **"DNS-innstillinger"**

### Hva skal være der:

Du skal ha EN av disse:

**Alternativ 1: A Record (anbefalt for Domeneshop)**
- **Type:** A Record
- **Navn:** @ (eller tom/root)
- **Verdi:** `75.2.60.5` (Netlify's IP)
- **TTL:** 3600

**Alternativ 2: CNAME (hvis støttet)**
- **Type:** CNAME
- **Navn:** @ (eller tom/root)
- **Verdi:** `magical-frangipane-c83ef8.netlify.app` (din Netlify URL)
- **TTL:** 3600

### Hvis du ikke har noen av disse:

1. **Legg til A Record:**
   - Type: A Record
   - Navn: @
   - Verdi: `75.2.60.5`
   - TTL: 3600
   - Lagre

2. **Vent 10-30 minutter** (for DNS-propager)

3. **Gå tilbake til Netlify** og klikk "Verify DNS configuration" igjen

---

## 🧪 Test om DNS propager

### Metode 1: Netlify Dashboard
- Klikk "Verify DNS configuration"
- Hvis det står "DNS is correctly configured" = Alt er riktig!

### Metode 2: whatsmydns.net
1. Gå til: https://www.whatsmydns.net
2. Skriv inn: `onetimeqr.com`
3. Velg "A" record
4. Sjekk at det viser `75.2.60.5` (eller lignende Netlify IP)

### Metode 3: Terminal (Mac)
```bash
dig onetimeqr.com
```
Se etter A-record som peker til `75.2.60.5`

---

## ⏱️ Tidslinje

1. **Legg til/oppdater DNS-poster** i domeneshop.no
2. **Vent 10-30 minutter** (DNS-propager)
3. **Klikk "Verify DNS configuration"** i Netlify
4. **Hvis OK:** Netlify starter automatisk SSL-provisionering
5. **Vent 5-15 minutter** (for SSL-sertifikat)
6. **HTTPS blir aktivt!** 🎉

---

## ✅ Når DNS er riktig

1. Netlify vil automatisk starte SSL-provisionering
2. Du vil se status endre fra feil til "Provisioning"
3. Etter 5-15 minutter blir det "Active"
4. Da kan du teste innlogging!

---

## 🆘 Hvis det fortsatt ikke fungerer

1. **Sjekk at DNS-posten er riktig:**
   - A Record: `75.2.60.5`
   - Navn: `@` eller tom

2. **Sjekk at det ikke er gamle DNS-poster:**
   - Fjern eventuelle gamle A Records
   - Behold bare den nye som peker til Netlify

3. **Vent lenger:**
   - DNS-propager kan ta opptil 24 timer
   - Men vanligvis 10-30 minutter

4. **Kontakt support:**
   - Hvis det fortsatt ikke fungerer etter 24 timer
   - Kontakt Netlify support via Dashboard











