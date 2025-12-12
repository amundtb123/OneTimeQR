# Custom Domain Setup - www.onetimeqr.com

## Hva må gjøres nå

Du har lagt til `www.onetimeqr.com` som custom domain i Supabase. Nå må du verifisere domenet ved å legge til en TXT-record i DNS.

## Steg 1: Legg til BEGGE DNS-records

### Hvor finner du DNS-innstillingene?
- **Domeneshop.no**: Logg inn → Velg `onetimeqr.com` → DNS-innstillinger
- **Andre DNS-leverandører**: Se etter "DNS Settings", "DNS Management", eller "Zone Records"

### ⚠️ VIKTIG: Du må legge til BEGGE records!

#### 1. CNAME-record (peker domenet til Supabase)

**Type:** `CNAME`  
**Name:** `www` (eller `www.onetimeqr.com` hvis fullt domene kreves)  
**Content:** `ofrtokcrfovjwfkcnjef.supabase.co`  
**TTL:** 3600

**Hva gjør denne?**
- Peker `www.onetimeqr.com` til Supabase
- Nødvendig for at domenet skal fungere

#### 2. TXT-record (SSL-sertifikat verifisering)

**Type:** `TXT`  
**Name:** `_acme-challenge.www` (eller `_acme-challenge.www.onetimeqr.com` hvis fullt domene kreves)  
**Content:** `epZidwiSXYSYuTlrQHior9r9jg_VQL9DFjTZB`  
**TTL:** 3600

**Hva gjør denne?**
- Verifiserer at du eier domenet for SSL-sertifikat
- Nødvendig for HTTPS/SSL

**Viktig:** 
- Noen DNS-leverandører krever at du fjerner domenet fra "Name"-feltet
- Hvis din DNS-leverandør krever dette, bruk bare `www` og `_acme-challenge.www` som Name
- TTL kan settes til 3600 (standard)

### Eksempel på hvordan det ser ut i Domeneshop.no:

**Legg til CNAME først:**
1. Gå til DNS-innstillinger for `onetimeqr.com`
2. Klikk "Legg til post" eller "Add record"
3. Velg **Type:** `CNAME`
4. **Navn:** `www`
5. **Verdi/Content:** `ofrtokcrfovjwfkcnjef.supabase.co`
6. **TTL:** 3600
7. Lagre

**Deretter legg til TXT:**
1. Klikk "Legg til post" eller "Add record" igjen
2. Velg **Type:** `TXT`
3. **Navn:** `_acme-challenge.www` (eller `_acme-challenge.www.onetimeqr.com` hvis fullt domene kreves)
4. **Verdi/Content:** `epZidwiSXYSYuTlrQHior9r9jg_VQL9DFjTZB`
5. **TTL:** 3600
6. Lagre

## Steg 2: Vent på DNS-propager

- DNS-endringer kan ta **5 minutter til 24 timer** å propagere
- Ofte raskere (15-60 minutter)
- Du kan sjekke propager:
  - CNAME: https://www.whatsmydns.net/#CNAME/www.onetimeqr.com
  - TXT: https://www.whatsmydns.net/#TXT/_acme-challenge.www.onetimeqr.com

## Steg 3: Verifiser i Supabase

1. Gå tilbake til Supabase Dashboard → Custom Domains
2. Klikk på **"Verify"**-knappen ved siden av `www.onetimeqr.com`
3. Hvis det feiler, vent litt lenger og prøv igjen (DNS kan ta tid)

## Steg 4: Etter verifisering

Når verifiseringen er vellykket:

1. **SSL-sertifikat genereres automatisk** (kan ta 5-15 minutter)
2. Domenet blir aktivt og klar til bruk
3. Du kan nå bruke `https://www.onetimeqr.com` for Supabase Auth

## Steg 5: Oppdater Supabase Redirect URLs (hvis ikke allerede gjort)

Etter at domenet er verifisert, sjekk at Redirect URLs er konfigurert:

1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/url-configuration
2. Under **Redirect URLs**, sjekk at du har:
   ```
   https://onetimeqr.com
   https://www.onetimeqr.com
   ```
3. Lagre hvis endringer er gjort

## Hva brukes custom domain til?

Custom domain (`www.onetimeqr.com`) brukes av Supabase for:
- **OAuth redirects** - Når brukere logger inn via Google, redirecter Supabase til dette domenet
- **Auth callbacks** - Supabase Auth bruker dette domenet for callbacks
- **Mer profesjonelt** - I stedet for `ofrtokcrfovjwfkcnjef.supabase.co`

## Viktig å vite

- **Frontend (Netlify)**: Din app kjører fortsatt på `onetimeqr.com` (Netlify)
- **Backend (Supabase Auth)**: Bruker nå `www.onetimeqr.com` for OAuth
- **Begge må fungere**: Både `onetimeqr.com` (Netlify) og `www.onetimeqr.com` (Supabase) må være konfigurert

## Feilsøking

### "Unable to verify records from DNS provider yet"
- Vent 15-60 minutter etter at du har lagt til TXT-record
- Sjekk DNS-propager på whatsmydns.net
- Prøv "Verify" på nytt

### TXT-record vises ikke i DNS-check
- Sjekk at du har lagt den til riktig (Type: TXT)
- Noen DNS-leverandører tar lengre tid
- Prøv å slette og legge til på nytt

### Verifisering feiler fortsatt etter 24 timer
- Sjekk at TXT-record er riktig kopiert (ingen mellomrom, riktig format)
- Kontakt Supabase support hvis problemet vedvarer

## Sjekkliste

- [ ] **CNAME-record lagt til** (`www` → `ofrtokcrfovjwfkcnjef.supabase.co`)
- [ ] **TXT-record lagt til** (`_acme-challenge.www` → verifiseringskode)
- [ ] Ventet 15-60 minutter for DNS-propager
- [ ] Klikket "Verify" i Supabase Custom Domains
- [ ] Verifisering vellykket
- [ ] SSL-sertifikat generert (skjer automatisk)
- [ ] Supabase Redirect URLs inkluderer `https://www.onetimeqr.com`
- [ ] Testet innlogging på `onetimeqr.com` (frontend)
