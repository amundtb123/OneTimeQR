# 📋 OneTimeQR - Kort Sammendrag for Code Review

Hei Øyvind! 👋

Dette er en kort oversikt over OneTimeQR-prosjektet før vårt møte. Jeg har forberedt en grundig kodegjennomgang som du kan lese gjennom.

---

## 🎯 Hva er OneTimeQR?

OneTimeQR er en web-applikasjon for sikker deling av filer, tekst og URLer via QR-koder. Hovedfunksjonen er **Secure Mode** - en zero-knowledge encryption løsning hvor serveren **aldri** ser dekrypteringsnøklene.

### Hovedfunksjoner:
- 📁 Filopplasting (multiple filer)
- 🔐 Secure Mode med to QR-koder (zero-knowledge encryption)
- ⏱️ Expiry-innstillinger (tid, antall scanninger/nedlastinger)
- 🔒 Passordbeskyttelse
- 💳 Coin-system for betalte funksjoner

---

## 🏗️ Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite 6.3.5
- Tailwind CSS + Radix UI
- Web Crypto API (kryptering)

**Backend:**
- Deno (Supabase Edge Functions)
- Hono framework
- Supabase (PostgreSQL, Storage, Auth)
- Stripe (betalinger)

---

## 🔐 Secure Mode - Hvordan det fungerer

**Kort forklaring:**
1. Master key genereres og splittes i to: **K1** og **K2**
2. K1 legges i QR1: `https://onetimeqr.com/scan/{id}#k1=...`
3. K2 legges i QR2: `https://onetimeqr.com/unlock/{id}#k2=...`
4. URL fragments (`#k1=` og `#k2=`) sendes **aldri** til serveren
5. Ved scanning kombineres K1 + K2 lokalt for å dekryptere

**Resultat:** Serveren kan aldri dekryptere innholdet, selv med full database-tilgang.

**Les mer:** `TECHNICAL_EXPLANATION.md` har detaljert forklaring.

---

## 📊 Kodekvalitet - Hovedfunn

### ✅ Sterke sider:
- Solid krypteringsimplementasjon
- God dokumentasjon
- Moderne tech stack
- God feilhåndtering

### ⚠️ Utfordringer:
- **Store filer:** `upload-section.tsx` (1424 linjer), `index-standalone.tsx` (1949 linjer)
- **Sikkerhetsproblemer:** 4 kritiske, 6 høye (se `SECURITY_ASSESSMENT.md`)
- **Manglende tester:** Ingen automatiserte tester funnet

---

## 🔒 Sikkerhetsproblemer (Kritiske)

Før produksjon må disse fikses:

1. **CORS er for åpen** - Tillater alle origins
2. **DELETE-endepunkt mangler autorisasjon** - Ingen eierskapssjekk
3. **Path traversal i filnavn** - Filnavn brukes direkte i filstier
4. **XSS via dangerouslySetInnerHTML** - i18n-oversettelser kan inneholde HTML

**Full liste:** Se `SECURITY_ASSESSMENT.md` (21 problemer totalt)

---

## 📁 Viktige Dokumenter

### Må lese:
1. **`KODEGJENNOMGANG.md`** - Fullstendig kodegjennomgang
2. **`SECURITY_ASSESSMENT.md`** - Sikkerhetsvurdering
3. **`TECHNICAL_EXPLANATION.md`** - Teknisk forklaring av Secure Mode

### Nyttige:
- **`MOTE_GUIDE.md`** - Møteguide med agenda
- **`TEST_PLAN.md`** - Test plan
- **`DEPLOYMENT.md`** - Deployment guide

---

## ❓ Spørsmål jeg håper vi kan diskutere

### Arkitektur:
1. Er split-key encryption med URL fragments best løsning?
2. Er nåværende arkitektur optimal for skala?
3. Bør vi vurdere alternativ tilnærming for mobile browsers?

### Sikkerhet:
1. Hvilke sikkerhetsproblemer er mest kritiske?
2. Hvordan bør vi implementere rate limiting?
3. Hvilke filtyper skal vi tillate?

### Kvalitet:
1. Hvor bør vi starte refaktoring?
2. Hvilke tester er mest kritiske?
3. Er vi klare for produksjon?

---

## 🚀 Neste Steg

1. **Les gjennom dokumentene** (start med `KODEGJENNOMGANG.md`)
2. **Test applikasjonen** lokalt hvis mulig (`npm run dev`)
3. **Kom med tilbakemelding** på arkitektur og sikkerhet
4. **Diskuter prioritering** av fikser

---

## 📞 Kontakt

Hvis du har spørsmål før møtet, bare send meg en melding!

**Lykke til med gjennomgangen! 🎉**

---

*Dokument opprettet: $(date)*


