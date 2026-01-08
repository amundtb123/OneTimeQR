# 🔍 Kodegjennomgang - OneTimeQR

**Dato:** $(date)  
**Gjennomgått for:** Øyvind (Systemarkitekt & Utvikler)  
**Prosjekt:** OneTimeQR - Secure QR Code File Sharing Platform

---

## 📋 Executive Summary

OneTimeQR er en moderne web-applikasjon for sikker deling av filer, tekst og URLer via QR-koder. Prosjektet implementerer en sofistikert **zero-knowledge encryption** løsning med split-key kryptering, hvor serveren aldri ser dekrypteringsnøklene.

### Hovedkarakteristikker:
- ✅ **Zero-knowledge encryption** med split-key (K1/K2)
- ✅ **To QR-koder** for ekstra sikkerhet (Secure Mode)
- ✅ **Moderne tech stack:** React + TypeScript, Supabase, Hono
- ✅ **God dokumentasjon** av sikkerhetsarkitektur
- ⚠️ **Noen sikkerhetsproblemer** som bør adresseres før produksjon

---

## 🏗️ Arkitektur Oversikt

### Frontend
- **Framework:** React 18 + TypeScript
- **Build tool:** Vite 6.3.5
- **Styling:** Tailwind CSS + Radix UI komponenter
- **State management:** React hooks (useState, useEffect)
- **Internasjonalisering:** i18next (norsk/engelsk)
- **Kryptering:** Web Crypto API (AES-GCM, HKDF-SHA-256)

### Backend
- **Runtime:** Deno (Supabase Edge Functions)
- **Framework:** Hono
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage (S3-compatible)
- **Auth:** Supabase Auth (Google OAuth)
- **Payment:** Stripe (webhook-basert)

### Nøkkelfiler:
```
Frontend:
├── src/App.tsx                    # Hovedapplikasjon, routing, state
├── src/components/
│   ├── upload-section.tsx         # Filopplasting + kryptering (1424 linjer)
│   ├── scan-view.tsx              # QR scanning + dekryptering
│   └── unlock-screen.tsx          # Secure Mode unlock flow
└── src/utils/
    ├── encryption.ts              # Kryptografiske funksjoner
    └── api-client.ts              # API kommunikasjon

Backend:
└── src/supabase/functions/server/
    └── index-standalone.tsx       # Hovedserver API (1949 linjer)
```

---

## 🔐 Sikkerhetsarkitektur

### Secure Mode (Zero-Knowledge Encryption)

**Hovedprinsipp:** Split-key encryption hvor serveren **aldri** ser dekrypteringsnøklene.

#### Krypteringsprosess:
1. **Master Key genereres:** 32-byte tilfeldig nøkkel
2. **Split i to:** `K1 = random(32 bytes)`, `K2 = K1 XOR Master`
3. **K1 i QR1:** `https://onetimeqr.com/scan/{id}#k1={base64url-k1}`
4. **K2 i QR2:** `https://onetimeqr.com/unlock/{id}#k2={base64url-k2}`
5. **URL fragments:** Sendes **aldri** til serveren (kun klienten ser dem)

#### Dekrypteringsprosess:
1. Scan QR1 → Ekstraher K1 fra `#k1=...` → Lagre lokalt
2. Scan QR2 → Ekstraher K2 fra `#k2=...` → Kombiner: `Master = K1 XOR K2`
3. Hent ciphertext fra server → Dekrypter med Master + fileId

#### Sikkerhetsegenskaper:
- ✅ **Zero-Knowledge:** Serveren kan aldri dekryptere innholdet
- ✅ **Split-Key:** Begge nøklene må være tilgjengelige
- ✅ **FileId Binding:** Kryptering bundet til spesifikk QR drop ID
- ✅ **HKDF:** Key derivation forhindrer key reuse
- ✅ **AES-GCM:** Autentisert kryptering (forhindrer tampering)

**Dokumentasjon:** Se `TECHNICAL_EXPLANATION.md` for detaljert forklaring.

---

## 🎯 Hovedfunksjoner

### 1. Filopplasting & QR-generering
- Støtter filer, tekst (200 tegn), og URLer
- Multiple filer per QR drop
- Custom QR-styling (farger, logo, gradient)
- Expiry-innstillinger (tid, antall scanninger/nedlastinger)
- Passordbeskyttelse (optional)
- View-only modus

### 2. Secure Mode
- To QR-koder (QR1: Access Code, QR2: Unlock Code)
- Zero-knowledge encryption
- Server verifiserer QR1 scanning uten å se K1
- Tidsbegrenset tilgang (QR2 må scannes innen 5 minutter)

### 3. Brukerautentisering
- Google OAuth via Supabase
- Gratis vs. betalt (coins-system)
- Stripe-integrasjon for coin-kjøp

### 4. QR Scanning & Dekryptering
- HTML5 QR scanner (kamera)
- Automatisk dekryptering ved scanning
- Håndtering av mobile browser quirks (fragment loss)

---

## 📊 Kodekvalitet

### Sterke sider:
1. **God dokumentasjon**
   - `TECHNICAL_EXPLANATION.md` forklarer Secure Mode grundig
   - `SECURITY_ASSESSMENT.md` identifiserer sikkerhetsproblemer
   - Inline kommentarer i komplekse deler

2. **Moderne tech stack**
   - TypeScript for type safety
   - React hooks for state management
   - Web Crypto API for kryptering

3. **God feilhåndtering**
   - Try-catch blokker på kritiske operasjoner
   - User-friendly error messages
   - Fallback-strategier for mobile browsers

4. **Edge case håndtering**
   - QR scanner `#` → `@` konvertering
   - localStorage quota management
   - Legacy salt-lengde kompatibilitet (12 vs 16 bytes)

### Utfordringer:

1. **Store filer**
   - `upload-section.tsx`: 1424 linjer
   - `index-standalone.tsx`: 1949 linjer
   - `App.tsx`: 1486 linjer
   - **Anbefaling:** Splitt opp i mindre komponenter/moduler

2. **Kompleks state management**
   - Mye lokal state i `App.tsx` (QR scanning flow)
   - **Anbefaling:** Vurder Context API eller state management library

3. **Mobile browser quirks**
   - Mye kode for å håndtere fragment loss
   - **Anbefaling:** Vurder alternativ tilnærming (f.eks. query params med encryption)

---

## 🔒 Sikkerhetsproblemer (Fra SECURITY_ASSESSMENT.md)

### 🔴 KRITISKE (Må fikses før produksjon):

1. **CORS er for åpen**
   - **Lokasjon:** `index-standalone.tsx:10`
   - **Problem:** Tillater alle origins
   - **Fix:** Begrens til kun `onetimeqr.com` og `www.onetimeqr.com`

2. **DELETE-endepunkt mangler autorisasjon**
   - **Lokasjon:** `index-standalone.tsx:1093`
   - **Problem:** Ingen eierskapssjekk før sletting
   - **Fix:** Verifiser at bruker eier QR drop før sletting

3. **Path traversal i filnavn**
   - **Lokasjon:** `index-standalone.tsx:402`
   - **Problem:** Filnavn brukes direkte i filstier
   - **Fix:** Sanitize filnavn (fjern `../`, `//`, etc.)

### 🟠 HØYE (Bør fikses før produksjon):

4. **XSS via dangerouslySetInnerHTML**
   - **Lokasjon:** `upload-section.tsx:604, 968`
   - **Problem:** i18n-oversettelser kan inneholde HTML
   - **Fix:** Sanitize HTML eller unngå HTML i oversettelser

5. **Ingen rate limiting**
   - **Problem:** Ingen rate limiting på API-endepunkter
   - **Fix:** Implementer rate limiting per IP/bruker

6. **Filstørrelse-validering kun på klient**
   - **Problem:** Server validerer ikke filstørrelse
   - **Fix:** Valider filstørrelse på serveren

7. **Ingen filtype-validering**
   - **Problem:** Alle filtyper tillatt
   - **Fix:** Whitelist tillatte filtyper

**Se `SECURITY_ASSESSMENT.md` for fullstendig liste (21 problemer totalt).**

---

## 🧪 Testing & Kvalitetssikring

### Eksisterende:
- ✅ `TEST_PLAN.md` dokumenterer test-scenarier
- ✅ Error handling og logging på plass
- ⚠️ Ingen automatiserte tester funnet

### Anbefalinger:
1. **Unit tests** for kryptografiske funksjoner (`encryption.ts`)
2. **Integration tests** for API-endepunkter
3. **E2E tests** for QR scanning flow
4. **Security tests** for sikkerhetsproblemer

---

## 📦 Dependencies

### Frontend:
- React 18.3.1
- TypeScript
- Vite 6.3.5
- Radix UI komponenter
- i18next for internasjonalisering
- qrcode-styling for QR-generering

### Backend:
- Deno runtime
- Hono framework
- Supabase SDK
- Stripe SDK

### Sikkerhetsvurdering:
- ✅ Ingen kjente sårbarheter i dependencies (basert på package.json)
- ⚠️ Anbefaler å kjøre `npm audit` før produksjon

---

## 🚀 Deployment

### Nåværende setup:
- **Frontend:** Netlify (basert på `netlify.toml`)
- **Backend:** Supabase Edge Functions
- **Database:** Supabase PostgreSQL
- **Storage:** Supabase Storage

### Dokumentasjon:
- `DEPLOYMENT.md` - Deployment guide
- `DEPLOY_STEPS_SIMPLE.md` - Enkel deployment guide
- `CUSTOM_DOMAIN_SETUP.md` - Custom domain setup

---

## 💡 Anbefalinger for Forbedring

### Kortsiktig (Før produksjon):
1. **Fiks kritiske sikkerhetsproblemer** (CORS, DELETE-auth, path traversal)
2. **Implementer rate limiting**
3. **Server-side filvalidering** (størrelse, type)
4. **Sanitize HTML** i i18n-oversettelser

### Mellomlang sikt:
1. **Refaktorer store filer** (splitt opp i mindre komponenter)
2. **Implementer automatiserte tester**
3. **Forbedre error handling** (strukturert logging)
4. **Optimaliser mobile browser support** (vurder alternativ tilnærming)

### Langsiktig:
1. **Monitoring & observability** (error tracking, performance)
2. **CI/CD pipeline** (automatisert testing og deployment)
3. **Dokumentasjon** (API docs, architecture diagrams)
4. **Skalering** (vurder caching, CDN, etc.)

---

## ❓ Spørsmål for Diskusjon

### Arkitektur:
1. **State management:** Bør vi vurdere Context API eller Redux for kompleks state?
2. **Mobile browser support:** Er fragment-basert løsning best, eller bør vi vurdere alternativer?
3. **File storage:** Er Supabase Storage best, eller bør vi vurdere S3 direkte?

### Sikkerhet:
1. **Rate limiting:** Hvilken strategi bør vi bruke? (Supabase built-in, eller ekstern tjeneste?)
2. **File type validation:** Hvilke filtyper skal vi tillate? (whitelist vs. blacklist)
3. **Anonymous uploads:** Skal vi tillate anonyme opplastinger, eller kreve autentisering?

### Skalering:
1. **Caching:** Bør vi implementere caching for QR-generering?
2. **CDN:** Bør vi bruke CDN for statiske assets?
3. **Database:** Er nåværende database-struktur optimal for skala?

### UX/UI:
1. **Error messages:** Er error messages brukervennlige nok?
2. **Loading states:** Er loading states tilstrekkelige?
3. **Mobile experience:** Er mobile browser quirks håndtert godt nok?

---

## 📝 Konklusjon

OneTimeQR er et **veldesignet prosjekt** med solid sikkerhetsarkitektur og moderne tech stack. Prosjektet implementerer en sofistikert zero-knowledge encryption løsning som er godt dokumentert.

### Hovedstyrker:
- ✅ Solid krypteringsimplementasjon
- ✅ God dokumentasjon
- ✅ Moderne tech stack
- ✅ God feilhåndtering

### Hovedutfordringer:
- ⚠️ Noen sikkerhetsproblemer som må fikses
- ⚠️ Store filer som bør refaktoreres
- ⚠️ Manglende automatiserte tester

### Anbefaling:
**Prosjektet er klart for code review**, men **kritiske sikkerhetsproblemer bør fikses før produksjon**. Resten av koden er av god kvalitet og følger moderne best practices.

---

## 📚 Relaterte Dokumenter

- `TECHNICAL_EXPLANATION.md` - Detaljert teknisk forklaring av Secure Mode
- `SECURITY_ASSESSMENT.md` - Fullstendig sikkerhetsvurdering (21 problemer)
- `TEST_PLAN.md` - Test plan og scenarier
- `DEPLOYMENT.md` - Deployment guide
- `README.md` - Prosjektoversikt

---

**Dokument opprettet:** $(date)  
**Gjennomgått av:** AI Code Reviewer  
**Versjon:** 1.0


