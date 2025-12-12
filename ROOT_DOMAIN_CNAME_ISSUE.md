# Løsning: CNAME på root-domenet fungerer ikke

## Problemet

Du prøver å legge til `onetimeqr.com` (uten www) i Supabase, men får feilmelding:
> "Failed to check CNAME record: Your CNAME record for OneTimeQR.com cannot be found"

## Hvorfor dette skjer

1. **CNAME på root støttes ikke av alle DNS-leverandører**
   - Mange DNS-leverandører tillater ikke CNAME på root-domenet (`@`)
   - Du har allerede en A-record for root-domenet (`onetimeqr.com` → `75.2.60.5`)
   - Du kan ikke ha både A-record og CNAME på samme hostname

2. **DNS-propager kan ta tid**
   - Hvis du nettopp har lagt til CNAME, kan det ta 15-60 minutter før den er synlig

## Løsning: Bruk subdomene i stedet

**Anbefalt:** Bruk `auth.onetimeqr.com` (eller `api.onetimeqr.com`) for Supabase.

### Steg 1: Legg til subdomene i Supabase

1. Gå til Supabase Dashboard → Custom Domains
2. **Slett** `onetimeqr.com` (hvis den er lagt til)
3. **Legg til** `auth.onetimeqr.com` i stedet
4. Du får to nye DNS-records å legge til

### Steg 2: Legg til DNS-records for subdomene

I DNS-innstillingene, legg til:

#### 1. CNAME-record
- **Type:** `CNAME`
- **Name:** `auth` (eller `auth.onetimeqr.com` hvis fullt domene kreves)
- **Content:** `ofrtokcrfovjwfkcnjef.supabase.co`
- **TTL:** 3600

#### 2. TXT-record (SSL-verifisering)
- **Type:** `TXT`
- **Name:** `_acme-challenge.auth` (eller `_acme-challenge.auth.onetimeqr.com`)
- **Content:** (verifiseringskoden fra Supabase)
- **TTL:** 3600

### Steg 3: Oppdater Supabase Redirect URLs

1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/url-configuration
2. Under **Redirect URLs**, legg til:
   ```
   https://onetimeqr.com
   https://www.onetimeqr.com
   https://auth.onetimeqr.com
   ```
3. Klikk **Save**

## Sluttresultat

- `onetimeqr.com` → Netlify (A-record) ✅
- `www.onetimeqr.com` → Netlify (CNAME) ✅
- `auth.onetimeqr.com` → Supabase (CNAME) ✅

## Hva skjer med OAuth?

Supabase Auth vil bruke `auth.onetimeqr.com` for OAuth callbacks, men redirects kan fortsatt gå til `onetimeqr.com` eller `www.onetimeqr.com` (som er konfigurert i Redirect URLs).

## Alternativ løsning: Vente på DNS-propager

Hvis du allerede har lagt til CNAME for root-domenet:

1. **Vent 15-60 minutter** (DNS-propager kan ta tid)
2. Sjekk DNS-propager på: https://www.whatsmydns.net/#CNAME/onetimeqr.com
3. Prøv "Verify" på nytt i Supabase

**Men:** Dette vil sannsynligvis ikke fungere hvis din DNS-leverandør ikke støtter CNAME på root.

## Sjekkliste

- [ ] Slettet `onetimeqr.com` fra Supabase Custom Domains
- [ ] Lagt til `auth.onetimeqr.com` i Supabase Custom Domains
- [ ] Lagt til CNAME-record: `auth` → `ofrtokcrfovjwfkcnjef.supabase.co`
- [ ] Lagt til TXT-record: `_acme-challenge.auth` → (verifiseringskode)
- [ ] Ventet 15-60 minutter for DNS-propager
- [ ] Klikket "Verify" i Supabase
- [ ] Oppdatert Supabase Redirect URLs til å inkludere `https://auth.onetimeqr.com`
- [ ] Testet innlogging

## Hvorfor subdomene er bedre

- ✅ Fungerer med alle DNS-leverandører
- ✅ Ingen konflikt med eksisterende A-record
- ✅ Tydelig separasjon: `auth.onetimeqr.com` for Auth, `www.onetimeqr.com` for frontend
- ✅ Enklere å feilsøke
