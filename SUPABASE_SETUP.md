# Supabase Redirect URLs Setup

## 📍 Direkte linker til ditt Supabase-prosjekt

**Ditt Supabase-prosjekt ID:** `ofrtokcrfovjwfkcnjef`

**Direkte link til Authentication settings:**
https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/url-configuration

## 🔧 Steg-for-steg instruksjoner

### Steg 1: Gå til Authentication Settings
1. Gå til: https://app.supabase.com/project/ofrtokcrfovjwfkcnjef/auth/url-configuration
2. Eller naviger manuelt:
   - Gå til [Supabase Dashboard](https://app.supabase.com)
   - Velg prosjektet ditt
   - Klikk på **Authentication** i venstre meny
   - Klikk på **URL Configuration**

### Steg 2: Oppdater Site URL
Under **Site URL**, sett:
```
https://onetimeqr.com
```

### Steg 3: Legg til Redirect URLs
Under **Redirect URLs**, legg til hver URL på en egen linje:

```
https://onetimeqr.com
https://onetimeqr.com/**
https://www.onetimeqr.com
https://www.onetimeqr.com/**
```

**Viktig:** 
- Hver URL skal være på sin egen linje
- Inkluder både med og uten `www`
- `/**` betyr alle paths under domenet

### Steg 4: Lagre
Klikk på **Save** nederst på siden

## ✅ Hva dette gjør

- **Site URL**: Dette er standard URL-en Supabase bruker for redirects
- **Redirect URLs**: Dette er en whitelist av tillatte URLs som Supabase kan redirecte til etter autentisering

## 🧪 Test etter oppdatering

1. Gå til `https://onetimeqr.com`
2. Prøv å logge inn med Google
3. Verifiser at du blir redirectet tilbake til `https://onetimeqr.com` etter innlogging

## ⚠️ Vanlige feil

- **Feil:** Glemmer `https://` - må inkluderes!
- **Feil:** Glemmer `/**` for å tillate alle paths
- **Feil:** Glemmer `www`-varianten
- **Feil:** Bruker `http://` i stedet for `https://` (Netlify bruker HTTPS)

## 🔍 Sjekkliste

- [ ] Site URL satt til `https://onetimeqr.com`
- [ ] Redirect URL: `https://onetimeqr.com` lagt til
- [ ] Redirect URL: `https://onetimeqr.com/**` lagt til
- [ ] Redirect URL: `https://www.onetimeqr.com` lagt til
- [ ] Redirect URL: `https://www.onetimeqr.com/**` lagt til
- [ ] Klikket "Save"
- [ ] Testet innlogging på onetimeqr.com











