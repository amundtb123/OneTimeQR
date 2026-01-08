# Quick Start - Netlify Deployment

## ✅ Hva er gjort

1. ✅ `netlify.toml` - Netlify konfigurasjon opprettet
2. ✅ `public/_redirects` - SPA routing konfigurert
3. ✅ `vite.config.ts` - Build output satt til `dist`
4. ✅ `.gitignore` - Opprettet
5. ✅ Koden bruker `window.location.origin` - vil fungere automatisk med ditt domene

## 🚀 Neste steg (følg i rekkefølge)

### 1. Opprett Netlify-konto
- Gå til [https://app.netlify.com/signup](https://app.netlify.com/signup)
- Logg inn med GitHub eller e-post

### 2. Deploy til Netlify

**Alternativ A: Drag & Drop (raskeste)**
```bash
npm run build
```
Dra og slipp `dist`-mappen inn i Netlify Dashboard

**Alternativ B: Netlify CLI**
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

### 3. Legg til domenet i Netlify
1. Netlify Dashboard → Site settings → Domain management
2. Klikk "Add custom domain"
3. Skriv `onetimeqr.com`
4. Følg instruksjonene for DNS

### 4. Konfigurer DNS i Domeneshop.no
Legg til disse DNS-posterne:
- **Type:** CNAME (eller A Record)
- **Name:** @ (root) eller www
- **Value:** `onetimeqr.netlify.app` (eller IP: `75.2.60.5` for A Record)
- **TTL:** 3600

### 5. Oppdater Supabase Redirect URLs
1. Supabase Dashboard → Authentication → URL Configuration
2. Site URL: `https://onetimeqr.com`
3. Redirect URLs: Legg til:
   - `https://onetimeqr.com`
   - `https://onetimeqr.com/**`
   - `https://www.onetimeqr.com`
   - `https://www.onetimeqr.com/**`

### 6. Test!
- Gå til `https://onetimeqr.com`
- Test alle funksjoner

## 📋 Sjekkliste

- [ ] Netlify-konto opprettet
- [ ] Prosjekt deployet til Netlify
- [ ] Domene lagt til i Netlify
- [ ] DNS konfigurert i domeneshop.no
- [ ] DNS propager (vent 1-24 timer)
- [ ] Supabase redirect URLs oppdatert
- [ ] HTTPS aktivert (automatisk i Netlify)
- [ ] Appen fungerer på onetimeqr.com

## ⚠️ Viktig

- DNS-propager kan ta opptil 24 timer (ofte raskere)
- Sjekk DNS-propager på [whatsmydns.net](https://www.whatsmydns.net)
- Supabase redirect URLs må matche nøyaktig (inkludert https://)

## 📚 Full guide

Se `DEPLOYMENT.md` for detaljert guide.













