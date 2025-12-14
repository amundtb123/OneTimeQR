# Deployment Guide for OneTimeQR

Denne guiden forklarer hvordan du setter opp OneTimeQR på Netlify med ditt eget domene (onetimeqr.com).

## Forutsetninger

- ✅ Netlify-konto (opprett på [netlify.com](https://netlify.com))
- ✅ Supabase-prosjekt (du har allerede dette)
- ✅ Domene kjøpt via domeneshop.no (onetimeqr.com)

## Steg 1: Opprett Netlify-konto

1. Gå til [https://app.netlify.com/signup](https://app.netlify.com/signup)
2. Velg "Sign up with GitHub" (anbefalt) eller opprett konto med e-post
3. Bekreft e-posten din hvis nødvendig

## Steg 2: Deploy til Netlify

### Alternativ A: Via Netlify Dashboard (enklest)

1. Logg inn på [Netlify Dashboard](https://app.netlify.com)
2. Klikk på "Add new site" → "Import an existing project"
3. Velg "Deploy manually" eller koble til GitHub/GitLab hvis du har koden der
4. Hvis du velger "Deploy manually":
   - Bygg prosjektet lokalt: `npm run build`
   - Dra og slipp `dist`-mappen inn i Netlify-dashboardet

### Alternativ B: Via Netlify CLI (anbefalt for kontinuerlig deployment)

1. Installer Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Logg inn:
   ```bash
   netlify login
   ```

3. Initialiser Netlify i prosjektet:
   ```bash
   netlify init
   ```
   - Velg "Create & configure a new site"
   - Velg team/organization
   - Gi siden et navn (f.eks. "onetimeqr")

4. Deploy:
   ```bash
   netlify deploy --prod
   ```

## Steg 3: Konfigurer domenet (onetimeqr.com)

### I Netlify Dashboard:

1. Gå til ditt site i Netlify Dashboard
2. Gå til **Site settings** → **Domain management**
3. Klikk på **Add custom domain**
4. Skriv inn `onetimeqr.com` og klikk **Verify**
5. Netlify vil gi deg DNS-innstillinger

### I Domeneshop.no:

1. Logg inn på [domeneshop.no](https://domeneshop.no)
2. Gå til ditt domene (onetimeqr.com)
3. Gå til DNS-innstillinger
4. Legg til følgende DNS-poster:

   **For å peke til Netlify:**
   - **Type:** A Record
   - **Name:** @ (eller tom)
   - **Value:** `75.2.60.5` (Netlify's IP)
   - **TTL:** 3600

   **For www-subdomene:**
   - **Type:** CNAME
   - **Name:** www
   - **Value:** `onetimeqr.netlify.app` (eller ditt Netlify site navn)
   - **TTL:** 3600

   **Alternativt (anbefalt):**
   - **Type:** CNAME
   - **Name:** @
   - **Value:** `onetimeqr.netlify.app` (hvis domeneshop støtter CNAME på root)
   - **TTL:** 3600

5. Vent på at DNS-propagerer (kan ta opptil 24 timer, men ofte raskere)

### Verifiser domenet i Netlify:

1. Gå tilbake til Netlify Dashboard
2. Under **Domain management**, klikk på **Verify DNS configuration**
3. Når DNS er verifisert, kan du aktivere HTTPS (skjer automatisk)

## Steg 4: Konfigurer Supabase Redirect URLs

For at autentisering skal fungere, må du legge til ditt nye domene i Supabase:

1. Gå til [Supabase Dashboard](https://app.supabase.com)
2. Velg ditt prosjekt
3. Gå til **Authentication** → **URL Configuration**
4. Under **Site URL**, sett: `https://onetimeqr.com`
5. Under **Redirect URLs**, legg til:
   - `https://onetimeqr.com`
   - `https://onetimeqr.com/**`
   - `https://www.onetimeqr.com`
   - `https://www.onetimeqr.com/**`
6. Klikk **Save**

## Steg 5: Test deployment

1. Gå til `https://onetimeqr.com` (eller ditt Netlify URL mens du venter på DNS)
2. Test at applikasjonen laster
3. Test autentisering (logg inn/logg ut)
4. Test opplasting av filer
5. Test QR-kode generering og scanning

## Steg 6: Kontinuerlig Deployment (valgfritt)

Hvis du har koden på GitHub/GitLab:

1. I Netlify Dashboard, gå til **Site settings** → **Build & deploy**
2. Under **Continuous Deployment**, klikk **Link to Git**
3. Velg repository og branch
4. Netlify vil automatisk deploye ved hver push

## Feilsøking

### Appen laster ikke
- Sjekk at build-kommandoen fungerer lokalt: `npm run build`
- Sjekk Netlify build logs i Dashboard

### Autentisering fungerer ikke
- Verifiser at redirect URLs er satt riktig i Supabase
- Sjekk at domenet matcher nøyaktig (inkludert https://)

### DNS fungerer ikke
- Bruk [whatsmydns.net](https://www.whatsmydns.net) for å sjekke DNS-propager
- Vent minst 1-2 timer etter endringer
- Sjekk at DNS-poster er riktig i domeneshop

### 404-feil på ruter
- Sjekk at `_redirects`-filen er i `public/`-mappen
- Sjekk at `netlify.toml` har riktig redirect-konfigurasjon

## Nettverk og ytelse

Netlify vil automatisk:
- Aktivere HTTPS (SSL-sertifikat)
- CDN-distribusjon for rask lastetid
- Automatisk komprimering av assets

## Support

- Netlify Docs: [https://docs.netlify.com](https://docs.netlify.com)
- Supabase Docs: [https://supabase.com/docs](https://supabase.com/docs)











