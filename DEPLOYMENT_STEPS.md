# Deployment Steps for Coin Shop

## 🚀 Steg 1: Deploy Frontend til Netlify

### Hvis du bruker Git:
```bash
git add .
git commit -m "Add coin shop functionality"
git push
```
Netlify vil automatisk deploye hvis du har auto-deploy aktivert.

### Hvis du deployer manuelt:
```bash
npm run build
# Dra og slipp dist-mappen til Netlify Dashboard
```

## 🔧 Steg 2: Deploy Supabase Edge Function

Supabase Edge Function må deployes via Supabase CLI eller Dashboard.

### Metode A: Via Supabase Dashboard (enklest)
1. Gå til [Supabase Dashboard](https://app.supabase.com)
2. Velg ditt prosjekt
3. Gå til **Edge Functions**
4. Hvis du allerede har en function:
   - Klikk på funksjonen (sannsynligvis `make-server-c3c9181e`)
   - Klikk **Deploy** eller **Update**
   - Last opp filen `src/supabase/functions/server/index.tsx`
5. Hvis du ikke har en function ennå:
   - Klikk **Create function**
   - Navn: `make-server-c3c9181e`
   - Kopier innholdet fra `src/supabase/functions/server/index.tsx`

### Metode B: Via Supabase CLI (anbefalt for fremtiden)
```bash
# Installer Supabase CLI hvis ikke allerede installert
npm install -g supabase

# Logg inn
supabase login

# Link til prosjektet
supabase link --project-ref [DITT_PROJEKT_ID]

# Deploy function
supabase functions deploy make-server-c3c9181e
```

## ✅ Sjekkliste etter deployment

- [ ] Frontend deployet til Netlify
- [ ] Supabase Edge Function deployet
- [ ] Database-migrasjon kjørt (`supabase_migration.sql`)
- [ ] Stripe secrets lagt til i Supabase (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
- [ ] Test at checkout fungerer
- [ ] Test at webhook mottar events


