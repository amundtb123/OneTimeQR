# ✅ Code Review Checklist

## 📋 Før Møtet

### Forberedelse:
- [ ] Les `KODEGJENNOMGANG.md`
- [ ] Les `SECURITY_ASSESSMENT.md`
- [ ] Les `TECHNICAL_EXPLANATION.md`
- [ ] Test applikasjonen lokalt (`npm run dev`)
- [ ] Forbered demo av Secure Mode flow

### Dokumenter:
- [ ] `KODEGJENNOMGANG.md` - ✅ Opprettet
- [ ] `MOTE_GUIDE.md` - ✅ Opprettet
- [ ] `SAMMENDRAG_FOR_OEYVIND.md` - ✅ Opprettet
- [ ] `CHECKLIST.md` - ✅ Opprettet

---

## 🔍 Under Code Review

### Arkitektur:
- [ ] Er arkitekturen optimal?
- [ ] Er databasestrukturen god?
- [ ] Er deployment-strategien robust?
- [ ] Er monitoring på plass?

### Sikkerhet:
- [ ] CORS konfigurert korrekt?
- [ ] Alle endepunkter har autorisasjon?
- [ ] Filvalidering på plass?
- [ ] Rate limiting implementert?

### Kodekvalitet:
- [ ] Er koden vedlikeholdbar?
- [ ] Er error handling god?
- [ ] Er test-dekning tilstrekkelig?
- [ ] Er dokumentasjon god?

### Secure Mode:
- [ ] Er split-key implementasjon korrekt?
- [ ] Er zero-knowledge prinsippet oppfylt?
- [ ] Er mobile browser quirks håndtert?

---

## 🔒 Kritiske Sikkerhetsproblemer

### Må fikses før produksjon:
- [ ] CORS begrenset til tillatte origins
- [ ] DELETE-endepunkt har autorisasjon
- [ ] Filnavn sanitized (path traversal fix)
- [ ] HTML sanitized i i18n-oversettelser

### Bør fikses før produksjon:
- [ ] Rate limiting implementert
- [ ] Server-side filvalidering (størrelse, type)
- [ ] Filtype whitelist implementert
- [ ] XSS-beskyttelse på plass

---

## 🛠️ Refaktoring

### Prioriterte områder:
- [ ] Splitt opp `upload-section.tsx` (1424 linjer)
- [ ] Splitt opp `index-standalone.tsx` (1949 linjer)
- [ ] Forbedre state management i `App.tsx`
- [ ] Optimaliser mobile browser support

---

## 🧪 Testing

### Tester som bør implementeres:
- [ ] Unit tests for `encryption.ts`
- [ ] Integration tests for API-endepunkter
- [ ] E2E tests for QR scanning flow
- [ ] Security tests for sikkerhetsproblemer

---

## 📝 Under Møtet

### Diskusjonspunkter:
- [ ] Arkitektur-spørsmål
- [ ] Sikkerhet-spørsmål
- [ ] Kvalitet-spørsmål
- [ ] Produksjonsklarhet

### Notater:
- [ ] Ta notater på anbefalinger
- [ ] Prioriter fikser sammen
- [ ] Diskuter teknisk gjeld
- [ ] Planlegg neste steg

---

## ✅ Etter Møtet

### Oppfølging:
- [ ] Oppsummer anbefalinger
- [ ] Opprett issues/tasks for fikser
- [ ] Prioriter fikser
- [ ] Følg opp på kritiske problemer

### Dokumentasjon:
- [ ] Oppdater `KODEGJENNOMGANG.md` med tilbakemeldinger
- [ ] Oppdater `SECURITY_ASSESSMENT.md` med løste problemer
- [ ] Opprett action items i prosjektstyring

---

## 🎯 Action Items

### Umiddelbart (Før produksjon):
- [ ] [Fyll inn etter møtet]

### Kortsiktig (1-2 uker):
- [ ] [Fyll inn etter møtet]

### Mellomlang sikt (1 måned):
- [ ] [Fyll inn etter møtet]

---

**Oppdater denne listen under og etter møtet!**


