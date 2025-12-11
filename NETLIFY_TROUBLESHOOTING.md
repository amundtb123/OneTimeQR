# Netlify Deployment Troubleshooting

## Problem: "Initializing" feiler

Hvis Netlify feiler på "Initializing"-steget, prøv følgende:

### Løsning 1: Sjekk at alle filer er commitet
Sørg for at følgende filer er i prosjektet:
- ✅ `package.json`
- ✅ `vite.config.ts`
- ✅ `netlify.toml`
- ✅ `index.html`
- ✅ `src/` mappen med all kode

### Løsning 2: Test build lokalt først
```bash
npm install
npm run build
```
Hvis dette feiler lokalt, må du fikse feilene først.

### Løsning 3: Bruk Netlify CLI for bedre feilmeldinger
```bash
npm install -g netlify-cli
netlify login
netlify build
```
Dette vil gi deg mer detaljerte feilmeldinger.

### Løsning 4: Sjekk Netlify Build Settings
I Netlify Dashboard:
1. Gå til **Site settings** → **Build & deploy**
2. Under **Build settings**, sjekk:
   - **Base directory:** (skal være tom eller `.`)
   - **Build command:** `npm install && npm run build`
   - **Publish directory:** `dist`

### Løsning 5: Manuell deploy (drag & drop)
Hvis automatisk deploy feiler:
1. Bygg lokalt: `npm run build`
2. Gå til Netlify Dashboard
3. Dra og slipp `dist`-mappen inn i Netlify
4. Dette vil deploye uten build-prosess

### Løsning 6: Sjekk Node versjon
Netlify bruker Node 20 (satt i `netlify.toml`). Hvis du har problemer:
- Sjekk at `NODE_VERSION = "20"` er satt i `netlify.toml`
- Eller fjern denne linjen og la Netlify bruke default

### Løsning 7: Sjekk dependencies
Noen pakker kan ha peer dependency issues. Vi har lagt til `NPM_FLAGS = "--legacy-peer-deps"` i `netlify.toml` for å håndtere dette.

## Vanlige feil og løsninger

### Feil: "vite: command not found"
**Løsning:** Netlify installerer ikke automatisk dependencies. Vi har lagt til `npm install &&` i build-kommandoen.

### Feil: "Cannot find module"
**Løsning:** Sjekk at alle dependencies er i `package.json` og ikke i `node_modules` uten å være listet.

### Feil: "Build directory not found"
**Løsning:** Sjekk at `publish = "dist"` i `netlify.toml` matcher `outDir` i `vite.config.ts`.

### Feil: "404 on routes"
**Løsning:** Sjekk at `public/_redirects` filen eksisterer med innholdet `/*    /index.html   200`

## Hvis ingenting fungerer

1. **Bygg lokalt og deploy manuelt:**
   ```bash
   npm install
   npm run build
   ```
   Deretter dra `dist`-mappen til Netlify.

2. **Kontakt Netlify support:**
   - Gå til Netlify Dashboard
   - Klikk på "Ask Netlify" for AI-hjelp
   - Eller sjekk build logs for detaljerte feilmeldinger

3. **Sjekk build logs:**
   - I Netlify Dashboard, klikk på den feilede deployen
   - Se "Deploy log" for detaljerte feilmeldinger
   - Kopier feilmeldingene og søk etter løsninger






