# OneTimeQR - ChatGPT Prompt for Investor Pitch

## Kort beskrivelse til ChatGPT:

**OneTimeQR er en sikker fil-delingstjeneste via QR-koder med zero-knowledge encryption.**

### Hva gjør produktet?

OneTimeQR lar brukere dele filer, tekst og URLer på en måte hvor serveren **aldri** kan dekryptere innholdet. Dette oppnås gjennom:

1. **Split-Key Encryption:** Master key splittes i to nøkler (K1 og K2)
2. **To QR-koder:** QR1 inneholder K1, QR2 inneholder K2
3. **Zero-Knowledge:** Nøklene sendes aldri til serveren (ligger i URL-fragmenter)
4. **Klient-side kryptering:** Alt krypteres i browseren før opplasting

### Unike funksjoner:

- ✅ Zero-knowledge encryption (serveren ser aldri nøkler)
- ✅ To QR-koder for ekstra sikkerhet (Secure Mode)
- ✅ Ingen app-nedlasting (fungerer i browser)
- ✅ Expiry-kontroll (tid, antall scanninger/nedlastinger)
- ✅ Passordbeskyttelse
- ✅ Custom QR-styling
- ✅ Coin-system for monetisering (Stripe-integrasjon)

### Teknisk stack:

- **Frontend:** React 18 + TypeScript, Vite, Tailwind CSS
- **Backend:** Deno + Hono (Supabase Edge Functions)
- **Database:** Supabase PostgreSQL
- **Storage:** Supabase Storage
- **Auth:** Google OAuth via Supabase
- **Payment:** Stripe
- **Deployment:** Netlify (frontend), Supabase (backend)

### Forretningsmodell:

- **Freemium:** Gratis tier med begrenset funksjonalitet
- **Coin-system:** Brukere kjøper coins for premium-funksjoner
- **Enterprise tier:** (fremtidig) API-tilgang, white-label

### Brukstilfeller:

- Juridiske dokumenter
- Medisinske data
- Bedriftsdokumenter (HR, lønnsinfo, strategi)
- Personlige dokumenter (ID, bank)
- Tekniske data (API-nøkler, konfig-filer)

### Konkurransefortrinn:

- Eneste QR-baserte løsning med zero-knowledge encryption
- Konkurrenter (WeTransfer, Dropbox) har full tilgang til innholdet
- Ingen app-nedlasting (fungerer i browser)
- Moderne, skalerbar teknologi

### Markedspotensial:

- Global fil-deling markedsstørrelse: $10+ milliarder
- Raskt voksende sikkerhetssegment
- B2B potensial (enterprise-kunder betaler premium)
- B2C potensial (økende bevissthet om datasikkerhet)

### Nåværende status:

- ✅ Fullstendig fungerende MVP
- ✅ Deployet på produksjon (onetimeqr.com)
- ✅ Zero-knowledge encryption implementert
- ✅ Stripe-integrasjon på plass
- ✅ Responsive design

### Roadmap:

- Kortsiktig: Analytics, e-postvarsler, mobile apps
- Mellomlang: Enterprise tier, API, team-kollaborasjon
- Langsiktig: Global ekspansjon, compliance-sertifiseringer

---

## Bruk denne teksten i ChatGPT:

**"Jeg har et produkt kalt OneTimeQR. [Lim inn teksten over]. Hjelp meg med å lage en investor pitch-deck med følgende seksjoner: Problem & Løsning, Produktoversikt, Marked & Traction, Forretningsmodell, Konkurranseanalyse, Team & Roadmap, og Investeringsbehov. Gjør det profesjonelt og overbevisende."**

---

## Alternativ: Kort elevator pitch-versjon:

**"OneTimeQR er en sikker fil-delingstjeneste via QR-koder hvor serveren aldri kan dekryptere innholdet. Vi bruker zero-knowledge encryption med split-key teknologi (to QR-koder) for å garantere at selv ved databrudd kan innholdet ikke dekrypteres. Vi tar på et $10+ milliarder marked hvor konkurrenter som WeTransfer og Dropbox har full tilgang til brukerdata. Vår unike teknologi og moderne tech stack gjør oss klare for rask skalering."**

