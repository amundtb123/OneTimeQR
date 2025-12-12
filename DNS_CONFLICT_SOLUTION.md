# Løsning: DNS-konflikt - www.onetimeqr.com

## Problemet

Du har allerede en CNAME-record for `www.onetimeqr.com` som peker til Netlify (`onetimeqr.netlify.app`) for frontend. Du kan ikke ha to CNAME-records for samme hostname.

## Løsning: Bruk root-domenet for Supabase

I stedet for `www.onetimeqr.com`, bruk root-domenet `onetimeqr.com` for Supabase Auth.

### Steg 1: Legg til custom domain i Supabase (root-domenet)

1. Gå til Supabase Dashboard → Custom Domains
2. Legg til `onetimeqr.com` (uten `www`)
3. Du får to nye DNS-records å legge til

### Steg 2: Legg til DNS-records for root-domenet

Du må legge til disse records i DNS:

#### 1. CNAME-record for root-domenet
- **Type:** `CNAME`
- **Name:** `@` (eller tom/root)
- **Content:** `ofrtokcrfovjwfkcnjef.supabase.co`
- **TTL:** 3600

**Viktig:** Noen DNS-leverandører støtter ikke CNAME på root. Hvis ikke:
- Bruk A-record i stedet (spør Supabase support om IP-adresse)
- Eller bruk et annet subdomene (se alternativ løsning under)

#### 2. TXT-record for SSL-verifisering
- **Type:** `TXT`
- **Name:** `_acme-challenge` (eller `_acme-challenge.onetimeqr.com`)
- **Content:** (verifiseringskoden fra Supabase)
- **TTL:** 3600

### Steg 3: Behold eksisterende DNS-struktur

**Behold disse records:**
- `onetimeqr.com` → `75.2.60.5` (A-record for Netlify) - ELLER endre til CNAME hvis mulig
- `www.onetimeqr.com` → `onetimeqr.netlify.app` (CNAME for Netlify frontend)

**Legg til nye records:**
- `onetimeqr.com` → `ofrtokcrfovjwfkcnjef.supabase.co` (CNAME for Supabase) - hvis mulig
- `_acme-challenge.onetimeqr.com` → (TXT-verifisering)

## Alternativ løsning: Bruk subdomene for Supabase

Hvis CNAME på root ikke fungerer, bruk et annet subdomene:

### Steg 1: Legg til subdomene i Supabase
1. I Supabase Custom Domains, legg til `auth.onetimeqr.com` (eller `api.onetimeqr.com`)
2. Du får CNAME og TXT-records for dette subdomenet

### Steg 2: Legg til DNS-records
- **CNAME:** `auth` → `ofrtokcrfovjwfkcnjef.supabase.co`
- **TXT:** `_acme-challenge.auth` → (verifiseringskode)

### Steg 3: Oppdater Supabase Redirect URLs
1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/url-configuration
2. Legg til: `https://auth.onetimeqr.com` i Redirect URLs

## Anbefalt løsning: Root-domenet

**Anbefalt struktur:**
- `onetimeqr.com` → Supabase (for Auth callbacks)
- `www.onetimeqr.com` → Netlify (for frontend)

**Fordeler:**
- Enklere konfigurasjon
- Standard praksis (root for API/Auth, www for frontend)
- Mindre forvirring

## Hva skjer med frontend?

Frontend på Netlify vil fortsatt fungere på:
- `www.onetimeqr.com` (via eksisterende CNAME)
- `onetimeqr.com` (via A-record eller redirect fra Netlify)

Netlify kan automatisk redirecte `onetimeqr.com` → `www.onetimeqr.com` hvis du ønsker det.

## Sjekkliste

- [ ] Bestemt hvilken løsning du vil bruke (root eller subdomene)
- [ ] Lagt til custom domain i Supabase (root eller subdomene)
- [ ] Lagt til CNAME-record i DNS
- [ ] Lagt til TXT-record i DNS
- [ ] Ventet 15-60 minutter for DNS-propager
- [ ] Klikket "Verify" i Supabase
- [ ] Oppdatert Supabase Redirect URLs
- [ ] Testet at frontend fortsatt fungerer på `www.onetimeqr.com`
