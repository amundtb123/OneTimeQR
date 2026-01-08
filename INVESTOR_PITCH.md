# 🚀 OneTimeQR - Investor Pitch

## Hva er OneTimeQR?

OneTimeQR er en revolusjonerende web-basert plattform for **sikker fil-deling via QR-koder** med enterprise-grade kryptering. Plattformen løser et kritisk problem: hvordan dele sensitive filer, dokumenter og informasjon på en måte som garanterer at serveren **aldri** kan dekryptere innholdet, selv ved databrudd.

---

## 🎯 Problem & Løsning

### Problemet:
- Tradisjonelle fil-delingstjenester (WeTransfer, Dropbox, Google Drive) har full tilgang til innholdet
- Ved databrudd eller kompromittering kan alle filer dekrypteres
- Ingen garanti for at tjenesteleverandøren ikke kan se innholdet
- Mangel på enkel, sikker metode for engangs-deling av sensitive data

### Vår løsning:
**Zero-Knowledge Encryption med Split-Key Technology**
- Serveren ser **aldri** dekrypteringsnøklene
- To QR-koder (split-key) må begge scannes for å få tilgang
- Kryptering skjer 100% på klienten (browser)
- Selv ved fullstendig databrudd kan innholdet ikke dekrypteres

---

## 🔐 Unik Sikkerhetsarkitektur

### Secure Mode - Zero-Knowledge Encryption

**Hvordan det fungerer:**

1. **Master Key genereres lokalt** (32-byte, tilfeldig)
2. **Split i to nøkler:** K1 og K2 (via XOR-operasjon)
3. **K1 i QR #1:** `https://onetimeqr.com/scan/{id}#k1=...`
4. **K2 i QR #2:** `https://onetimeqr.com/unlock/{id}#k2=...`
5. **URL fragments sendes ALDRI til serveren** (kun klienten ser dem)

**Resultat:**
- Serveren lagrer kun kryptert innhold (ciphertext)
- Serveren kan verifisere at QR1 er scannet uten å se K1
- Selv med full database-tilgang kan innholdet ikke dekrypteres
- Begge nøklene må være tilgjengelige for dekryptering

**Teknisk implementasjon:**
- AES-GCM 256-bit kryptering
- HKDF key derivation (binder nøkkel til QR drop ID)
- Autentisert kryptering (forhindrer tampering)
- Web Crypto API (browser-native, ingen eksterne avhengigheter)

---

## 💼 Brukstilfeller & Marked

### Primære brukstilfeller:

1. **Juridiske dokumenter**
   - Advokater som deler sensitive kontrakter
   - Møtereferater, avtaler
   - Klient-dokumenter

2. **Medisinske data**
   - Pasientjournaler
   - Diagnostiske bilder
   - Sensitive helseopplysninger

3. **Bedriftsdokumenter**
   - HR-dokumenter
   - Lønnsinformasjon
   - Strategiske planer
   - M&A-dokumenter

4. **Personlig bruk**
   - ID-dokumenter
   - Bankdokumenter
   - Personlige bilder/videoer

5. **Utviklere & Teknisk**
   - API-nøkler
   - Konfigurasjonsfiler
   - Database-backups

### Markedspotensial:

- **Global fil-deling markedsstørrelse:** $10+ milliarder (2024)
- **Sikkerhetsfokusert segment:** Raskt voksende
- **B2B potensial:** Enterprise-kunder betaler premium for sikkerhet
- **B2C potensial:** Økende bevissthet om datasikkerhet

---

## 🎨 Produktfunksjoner

### Kjernefunksjoner:

✅ **Multi-format støtte**
- Filer (alle typer, multiple filer per QR)
- Tekst (opptil 200 tegn)
- URLer (multiple URLer per QR)

✅ **Sikkerhetsfunksjoner**
- Secure Mode (zero-knowledge, to QR-koder)
- Single QR Mode (enklere bruk, fortsatt kryptert)
- Passordbeskyttelse (valgfritt)
- View-only modus (ingen nedlasting)

✅ **Expiry-kontroll**
- Tidsbasert (10 min, 1 time, 1 dag, 1 uke, 1 måned)
- Antall scanninger (f.eks. maks 5 scanninger)
- Antall nedlastinger (f.eks. maks 3 nedlastinger)
- Automatisk sletting ved utløp

✅ **Brukervennlighet**
- Custom QR-styling (farger, logo, gradient)
- HTML5 QR-scanner (ingen app-nedlasting)
- Responsive design (fungerer på alle enheter)
- Internasjonalisering (norsk/engelsk, utvidbar)

✅ **Monetisering**
- Gratis tier (begrenset funksjonalitet)
- Coin-system for premium-funksjoner
- Stripe-integrasjon for betalinger
- Skalerbar pricing-modell

---

## 💰 Forretningsmodell

### Revenue Streams:

1. **Freemium Model**
   - Gratis: Begrenset antall QR-drops, grunnleggende funksjoner
   - Premium: Ubegrenset, Secure Mode, avansert styling

2. **Coin System**
   - Brukere kjøper "coins" via Stripe
   - Coins brukes for premium-funksjoner:
     - Secure Mode QR-drops
     - Lengre expiry-tider
     - Høyere filstørrelser
     - Avansert QR-styling

3. **Enterprise Tier** (fremtidig)
   - API-tilgang
   - White-label løsning
   - Dedikert support
   - Custom branding

### Pricing Potensial:

- **B2C:** $5-20/måned for premium
- **B2B:** $50-500/måned per bruker
- **Enterprise:** Custom pricing ($1000+/måned)

---

## 🏗️ Teknisk Stack & Skalerbarhet

### Frontend:
- **React 18 + TypeScript** (moderne, type-safe)
- **Vite** (rask build, optimalisert)
- **Tailwind CSS + Radix UI** (moderne design-system)
- **Web Crypto API** (browser-native kryptering)

### Backend:
- **Deno + Hono** (rask, moderne runtime)
- **Supabase** (PostgreSQL, Storage, Auth)
- **Stripe** (betalinger)
- **Netlify** (CDN, edge deployment)

### Skalerbarhet:
- ✅ Serverless arkitektur (automatisk skalering)
- ✅ Edge functions (lav latency globalt)
- ✅ CDN for statiske assets
- ✅ Database kan skaleres vertikalt/horisontalt
- ✅ Storage kan skaleres til petabytes

### Sikkerhet & Compliance:
- ✅ Zero-knowledge arkitektur (serveren ser aldri nøkler)
- ✅ HTTPS/TLS for all kommunikasjon
- ✅ GDPR-kompatibel (ingen personlig data i klartekst)
- ✅ SOC 2 potensial (kan sertifiseres)

---

## 🚀 Konkurransefortrinn

### Hva gjør oss unike:

1. **Zero-Knowledge Encryption**
   - Konkurrenter (WeTransfer, Dropbox) har full tilgang
   - Vi er den eneste QR-baserte løsningen med zero-knowledge

2. **Split-Key Technology**
   - To QR-koder gir ekstra sikkerhetslag
   - Unikt i markedet

3. **Ingen App-Nedlasting**
   - Fungerer i browser (HTML5 QR-scanner)
   - Lavere barrierer for brukere

4. **Moderne Tech Stack**
   - Rask utvikling
   - Lav vedlikeholdskostnad
   - Skalerbar arkitektur

5. **Brukerfokusert Design**
   - Nordisk design-estetikk
   - Enkel brukeropplevelse
   - Responsive på alle enheter

### Konkurrenter:

- **WeTransfer:** Ingen kryptering, serveren ser alt
- **Dropbox Transfer:** Serveren har tilgang
- **SendAnywhere:** Ingen zero-knowledge
- **Tresorit Send:** Dyrt, komplekst
- **Firefox Send (nedlagt):** Viste at markedet eksisterer

**Vår posisjon:** Eneste QR-baserte løsning med zero-knowledge encryption

---

## 📈 Traction & Roadmap

### Nåværende status:
- ✅ Fullstendig fungerende MVP
- ✅ Zero-knowledge encryption implementert
- ✅ Stripe-integrasjon på plass
- ✅ Deployet på produksjon (onetimeqr.com)
- ✅ Google OAuth autentisering
- ✅ Responsive design

### Kortsiktig roadmap (3-6 måneder):
- 📊 Analytics dashboard
- 🔔 E-postvarsler ved scanning/nedlasting
- 📱 Native mobile apps (iOS/Android)
- 🌍 Flere språk (tysk, fransk, spansk)
- 🔐 To-faktor autentisering (2FA)

### Mellomlang sikt (6-12 måneder):
- 🏢 Enterprise tier med API
- 👥 Team-kollaborasjon
- 📋 Admin dashboard
- 🔍 Avansert analytics
- 🎨 White-label løsning

### Langsiktig (12+ måneder):
- 🌐 Global ekspansjon
- 🤝 Partnerskap med sikkerhetsleverandører
- 📜 Compliance-sertifiseringer (SOC 2, ISO 27001)
- 🚀 Enterprise sales team

---

## 💡 Investeringsmuligheter

### Hva vi trenger:

1. **Markedsføring & Growth**
   - Digital markedsføring (SEO, SEM, sosiale medier)
   - Content marketing (sikkerhetsblogg)
   - Partnership-strategi

2. **Produktutvikling**
   - Mobile apps (iOS/Android)
   - Enterprise features
   - API-utvikling

3. **Salg & Business Development**
   - B2B sales team
   - Enterprise partnerships
   - Channel partners

4. **Infrastruktur & Skalering**
   - Server-kapasitet
   - CDN-optimalisering
   - Database-optimalisering

### Forventet ROI:

- **B2C:** Høy konvertering fra gratis til premium
- **B2B:** Høyere LTV (lifetime value), lavere churn
- **Enterprise:** Stabile, langvarige kontrakter

---

## 🎯 Key Metrics & Milestones

### Nøkkeltall vi tracker:

- **MAU (Monthly Active Users)**
- **Conversion rate** (gratis → premium)
- **ARPU (Average Revenue Per User)**
- **Churn rate**
- **NPS (Net Promoter Score)**
- **Security incidents** (mål: 0)

### Milestones:

- **Q1 2025:** 1,000 MAU, 5% conversion rate
- **Q2 2025:** 10,000 MAU, første enterprise-kunde
- **Q3 2025:** 50,000 MAU, break-even
- **Q4 2025:** 100,000 MAU, lønnsomhet

---

## 👥 Team & Ekspertise

### Nåværende team:
- **Utvikling:** Fullstack-utviklere med sikkerhetserfaring
- **Design:** Nordisk design-estetikk, brukersentrert
- **Arkitektur:** Moderne, skalerbar tech stack

### Fremtidige behov:
- **CTO/Technical Lead** (sikkerhetsfokus)
- **Head of Sales** (B2B/Enterprise)
- **Marketing Lead** (Growth)
- **Customer Success** (Enterprise support)

---

## 🔒 Sikkerhet & Compliance

### Sikkerhetsgarantier:

✅ **Zero-Knowledge Architecture**
- Serveren ser aldri dekrypteringsnøkler
- Selv ved databrudd kan innholdet ikke dekrypteres

✅ **Moderne Kryptering**
- AES-GCM 256-bit
- HKDF key derivation
- Autentisert kryptering

✅ **Privacy-First**
- GDPR-kompatibel
- Minimal datainnsamling
- Ingen tracking uten samtykke

### Compliance-potensial:
- **SOC 2 Type II** (kan sertifiseres)
- **ISO 27001** (informasjonssikkerhet)
- **HIPAA** (medisinsk data, med tilpasninger)

---

## 📞 Kontakt & Neste Steg

### Hvorfor investere i OneTimeQR?

1. **Unik teknisk løsning** - Zero-knowledge encryption med split-key
2. **Stort marked** - $10+ milliarder fil-deling markedsstørrelse
3. **Skalerbar teknologi** - Serverless, edge-deployed
4. **Sterk sikkerhetsfokus** - Kritisk for enterprise-kunder
5. **Moderne brukeropplevelse** - Ingen app-nedlasting, fungerer overalt

### Vi søker:
- **Seed/Pre-seed funding** for markedsføring og produktutvikling
- **Strategic partners** med sikkerhetsfokus
- **Advisors** med enterprise sales-erfaring

---

**OneTimeQR - Sikker fil-deling. Zero-knowledge. Ingen kompromisser.**

---

*Dette dokumentet kan brukes som input til ChatGPT eller andre AI-verktøy for å generere investor pitch-dekker, pitch-decks, eller andre markedsføringsmateriell.*

