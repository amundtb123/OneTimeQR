# 🔒 Sikkerhetsvurdering - OneTimeQR

**Dato:** $(date)  
**Versjon:** 1.0  
**Status:** Analyse - Ingen endringer implementert

---

## 📋 Executive Summary

Denne vurderingen analyserer sikkerheten i OneTimeQR-applikasjonen. Flere områder fungerer godt (kryptering, webhook-signaturer, autentisering), men det er også flere sikkerhetsproblemer som bør adresseres før produksjon.

**Kritiske problemer:** 4 (inkl. potensielt 1 ekstra hvis index.tsx brukes)  
**Høye problemer:** 6  
**Middels problemer:** 7  
**Lave problemer:** 4

---

## ⚠️ VIKTIG: To server-filer funnet

**Lokasjon:** `src/supabase/functions/server/`
- `index.tsx` - Eldre versjon med flere sikkerhetsproblemer
- `index-standalone.tsx` - Nyere versjon med bedre sikkerhet

**Anbefaling:** Sørg for at `index-standalone.tsx` er den som faktisk brukes i produksjon. Den eldre `index.tsx` har flere kritiske problemer (se nedenfor).

---

## 🔴 KRITISKE PROBLEMER

### 1. CORS er åpen for alle origins
**Lokasjon:** `src/supabase/functions/server/index-standalone.tsx:9`

```typescript
app.use('*', cors());
```

**Problem:** CORS er konfigurert uten restriksjoner, som tillater alle origins å gjøre forespørsler til API-et.

**Risiko:** 
- Cross-Site Request Forgery (CSRF) angrep
- Uautorisert tilgang fra ondsinnede nettsteder
- Dataeksfiltrering

**Anbefaling:**
```typescript
app.use('*', cors({
  origin: ['https://onetimeqr.com', 'https://www.onetimeqr.com'],
  credentials: true,
  allowMethods: ['GET', 'POST', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));
```

**Prioritet:** 🔴 KRITISK - Fiks umiddelbart

---

### 2. DELETE-endepunkt mangler eierskapssjekk
**Lokasjon:** `src/supabase/functions/server/index-standalone.tsx:1093-1102`

```typescript
app.delete('/make-server-c3c9181e/qr/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await deleteQrDrop(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting QR drop:', error);
    return c.json({ error: `Failed to delete QR drop: ${error.message}` }, 500);
  }
});
```

**Problem:** Endepunktet sjekker ikke om brukeren eier QR drop-en før sletting.

**Risiko:**
- Enhver autentisert bruker kan slette andres QR drops
- Dataeksfiltrering og sabotasje
- Brudd på brukerdata

**Anbefaling:**
```typescript
app.delete('/make-server-c3c9181e/qr/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    // Get user ID from auth token
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken || accessToken === Deno.env.get('SUPABASE_ANON_KEY')) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return c.json({ error: 'Invalid authentication' }, 401);
    }

    // Verify ownership
    const qrDrop = await kv.get(`qrdrop:${id}`);
    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    // Allow deletion if user owns it OR if it's anonymous (userId is null)
    if (qrDrop.userId && qrDrop.userId !== user.id) {
      return c.json({ error: 'Unauthorized: You can only delete your own QR drops' }, 403);
    }

    await deleteQrDrop(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting QR drop:', error);
    return c.json({ error: `Failed to delete QR drop: ${error.message}` }, 500);
  }
});
```

**Prioritet:** 🔴 KRITISK - Fiks umiddelbart

---

### 3. Filnavn i filstier kan inneholde path traversal
**Lokasjon:** `src/supabase/functions/server/index-standalone.tsx:402`

```typescript
const filePath = `${id}/${timestamp}-${i}-${file.name}`;
```

**Problem:** Filnavn fra brukeren brukes direkte i filstier uten sanitization.

**Risiko:**
- Path traversal angrep (`../../../etc/passwd`)
- Overskriving av andre filer
- Directory traversal

**Anbefaling:**
```typescript
// Sanitize filename
const sanitizeFileName = (fileName: string): string => {
  // Remove path traversal attempts
  const sanitized = fileName.replace(/\.\./g, '').replace(/\//g, '_').replace(/\\/g, '_');
  // Remove or replace dangerous characters
  return sanitized.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
};

const filePath = `${id}/${timestamp}-${i}-${sanitizeFileName(file.name)}`;
```

**Prioritet:** 🔴 KRITISK - Fiks umiddelbart

---

### 4. Passord lagres i klartekst i index.tsx
**Lokasjon:** `src/supabase/functions/server/index.tsx:555`

```typescript
const isValid = qrDrop.password === password;
```

**Problem:** I den eldre `index.tsx`-filen sammenlignes passord direkte uten hashing. Dette betyr at passord lagres i klartekst i databasen.

**Risiko:**
- Passord eksponeres hvis databasen kompromitteres
- Ingen beskyttelse mot passord-lekkasje
- Brudd på beste praksis for passordhåndtering

**Status:** `index-standalone.tsx` bruker korrekt `verifyPasswordSecure`, men `index.tsx` har fortsatt usikker implementasjon.

**Anbefaling:**
- Sørg for at `index-standalone.tsx` er den aktive filen
- Slett eller oppdater `index.tsx` hvis den fortsatt brukes
- Verifiser at alle passord i databasen er hashet

**Prioritet:** 🔴 KRITISK - Hvis index.tsx brukes i produksjon

---

## 🟠 HØYE PROBLEMER

### 5. XSS-sårbarhet via dangerouslySetInnerHTML
**Lokasjon:** `src/components/upload-section.tsx:604, 968`

```typescript
<p className="text-[#5B5B5B] mb-4" dangerouslySetInnerHTML={{ __html: t('upload.freeLimit') }} />
<p className="text-[#E8927E] text-sm" dangerouslySetInnerHTML={{ __html: t('upload.secureModeInfo') }} />
```

**Problem:** `dangerouslySetInnerHTML` brukes for i18n-oversettelser. Hvis oversettelsene ikke er sanitisert, kan dette føre til XSS.

**Risiko:**
- Cross-Site Scripting (XSS) angrep
- Kjøring av ondsinnet JavaScript
- Session hijacking

**Anbefaling:**
- Sanitize all HTML i oversettelsene før rendering
- Bruk bibliotek som `DOMPurify` for å sanitisere HTML
- Eller unngå HTML i oversettelser og bruk React-komponenter i stedet

**Prioritet:** 🟠 HØY - Hvis oversettelser kan manipuleres

---

### 6. Ingen rate limiting
**Problem:** Ingen rate limiting på noen endepunkter.

**Risiko:**
- DDoS-angrep
- Brute force på passord-verifisering
- Ressursmisbruk (storage, database)

**Anbefaling:**
- Implementer rate limiting per IP og per bruker
- Bruk Supabase Edge Functions rate limiting eller ekstern tjeneste
- Spesielt viktig for: `/verify`, `/upload`, `/create`, `/deduct-coins`

**Prioritet:** 🟠 HØY - Fiks før produksjon

---

### 7. Filstørrelse-validering kun på klient
**Lokasjon:** `src/components/upload-section.tsx:279-287`

**Problem:** Filstørrelse sjekkes kun på klienten, ikke på serveren.

**Risiko:**
- Angripere kan omgå klientvalidering
- Storage kan fylles opp
- Kostnader og ytelsesproblemer

**Anbefaling:**
```typescript
// In index-standalone.tsx upload endpoint
const MAX_FILE_SIZE = user ? 20 * 1024 * 1024 : 1 * 1024 * 1024; // 20 MB or 1 MB
const MAX_TOTAL_SIZE = user ? 100 * 1024 * 1024 : 5 * 1024 * 1024; // 100 MB or 5 MB total

let totalSize = 0;
for (const file of files) {
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: `File ${file.name} exceeds maximum size` }, 400);
  }
  totalSize += file.size;
}

if (totalSize > MAX_TOTAL_SIZE) {
  return c.json({ error: 'Total file size exceeds maximum' }, 400);
}
```

**Prioritet:** 🟠 HØY - Fiks før produksjon

---

### 8. Passord-validering mangler timing attack-beskyttelse
**Lokasjon:** `src/supabase/functions/server/index-standalone.tsx:154-198`

**Problem:** `verifyPasswordSecure` kan være sårbar for timing attacks ved sammenligning.

**Risiko:**
- Timing attacks kan avdekke passord
- Angripere kan gjette passord raskere

**Anbefaling:**
Bruk konstant-tid sammenligning (Web Crypto API gjør dette automatisk, men verifiser at implementasjonen er korrekt).

**Prioritet:** 🟠 HØY - Vurder forbedring

---

### 9. Anonyme opplastinger tillatt
**Lokasjon:** `src/supabase/functions/server/index-standalone.tsx:367-390`

**Problem:** Systemet tillater anonyme opplastinger uten begrensninger.

**Risiko:**
- Misbruk av tjenesten
- Vanskelig å spore misbruk
- Potensielt ulovlig innhold

**Anbefaling:**
- Vurder å kreve autentisering for alle opplastinger
- Eller implementer CAPTCHA for anonyme brukere
- Begrens antall anonyme opplastinger per IP

**Prioritet:** 🟠 HØY - Vurder policy

---

### 10. Ingen validering av filtyper
**Problem:** Systemet aksepterer alle filtyper uten validering.

**Risiko:**
- Lasting av ondsinnede filer
- XSS via HTML/JS-filer
- Spredning av malware

**Anbefaling:**
```typescript
const ALLOWED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain',
  'application/zip',
  // Legg til flere etter behov
];

const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.sh', '.js', '.html'];

for (const file of files) {
  // Check extension
  const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return c.json({ error: `File type ${ext} is not allowed` }, 400);
  }
  
  // Check MIME type if available
  if (file.type && !ALLOWED_FILE_TYPES.includes(file.type)) {
    return c.json({ error: `File type ${file.type} is not allowed` }, 400);
  }
}
```

**Prioritet:** 🟠 HØY - Fiks før produksjon

---

## 🟡 MIDDELS PROBLEMER

### 11. Logging av sensitiv informasjon
**Lokasjon:** `src/supabase/functions/server/index-standalone.tsx:652-668`

**Godt:** Koden redakterer passord og encryption keys i logger, men kan forbedres.

**Anbefaling:**
- Sørg for at ALLE logger redakterer sensitiv data
- Bruk strukturert logging
- Vurder å fjerne verbose logging i produksjon

**Prioritet:** 🟡 MIDDELS

---

### 12. Access token-utløpstid kan være for lang
**Lokasjon:** `src/supabase/functions/server/index-standalone.tsx:612`

```typescript
const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes
```

**Problem:** 5 minutter kan være for lenge hvis token lekkes.

**Anbefaling:**
- Vurder å redusere til 2-3 minutter
- Implementer token-rotasjon
- Sørg for at tokens slettes umiddelbart etter bruk (gjør allerede)

**Prioritet:** 🟡 MIDDELS

---

### 13. Ingen validering av metadata-størrelse
**Problem:** Metadata sendes som JSON uten størrelsesbegrensning.

**Risiko:**
- DoS via store JSON-payloads
- Minneproblemer

**Anbefaling:**
```typescript
const MAX_METADATA_SIZE = 10 * 1024; // 10 KB
if (JSON.stringify(metadata).length > MAX_METADATA_SIZE) {
  return c.json({ error: 'Metadata too large' }, 400);
}
```

**Prioritet:** 🟡 MIDDELS

---

### 14. Signed URL-utløpstid kan være for lang
**Lokasjon:** `src/supabase/functions/server/index-standalone.tsx:721, 751, 936`

```typescript
.createSignedUrl(file.path, 120); // 2 minutes
```

**Problem:** 2 minutter kan være for lenge for sensitive filer.

**Anbefaling:**
- Vurder å redusere til 60 sekunder for sensitive filer
- Implementer refresh-mekanisme for lengre nedlastinger

**Prioritet:** 🟡 MIDDELS

---

**Merk:** I `index.tsx` er utløpstiden 1 time (60*60), mens i `index-standalone.tsx` er den 2 minutter (120). Den kortere tiden er bedre for sikkerhet.

### 15. Ingen CSRF-beskyttelse
**Problem:** Ingen CSRF-tokens på endepunkter som endrer data.

**Risiko:**
- Cross-Site Request Forgery angrep
- Uautorisert handlinger på vegne av brukere

**Anbefaling:**
- Implementer CSRF-tokens for state-changing operasjoner
- Bruk SameSite cookies (hvis cookies brukes)
- Verifiser Origin header

**Prioritet:** 🟡 MIDDELS

---

### 16. Stripe success URL kan manipuleres
**Lokasjon:** `src/supabase/functions/server/index-standalone.tsx:1123-1124`

```typescript
const origin = c.req.header('Origin') || c.req.header('Referer') || 'https://onetimeqr.com';
const baseUrl = new URL(origin).origin;
```

**Problem:** Origin/Referer kan manipuleres av angripere.

**Risiko:**
- Redirect til ondsinnede nettsteder etter betaling
- Phishing-angrep

**Anbefaling:**
```typescript
const ALLOWED_ORIGINS = ['https://onetimeqr.com', 'https://www.onetimeqr.com'];
const origin = c.req.header('Origin');
const baseUrl = origin && ALLOWED_ORIGINS.includes(origin) 
  ? origin 
  : 'https://onetimeqr.com';
```

**Prioritet:** 🟡 MIDDELS

---

### 17. Ingen validering av QR drop ID-format
**Problem:** UUID-validering mangler på flere endepunkter.

**Risiko:**
- Injeksjonsangrep
- Ugyldig data i database

**Anbefaling:**
```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_REGEX.test(id)) {
  return c.json({ error: 'Invalid QR drop ID format' }, 400);
}
```

**Prioritet:** 🟡 MIDDELS

---

## 🟢 LAVE PROBLEMER / FORBEDRINGER

### 18. Insecure password hashing-funksjon eksisterer fortsatt
**Lokasjon:** `src/supabase/functions/server/index-standalone.tsx:78-111`

**Problem:** Den usikre `hashPassword` og `verifyPassword` funksjonene eksisterer fortsatt i koden (selv om de ikke brukes).

**Anbefaling:**
- Fjern usikre funksjoner
- Behold kun `hashPasswordSecure` og `verifyPasswordSecure`

**Prioritet:** 🟢 LAV

---

### 19. Cleanup-intervall kan optimaliseres
**Lokasjon:** `src/supabase/functions/server/index-standalone.tsx:283`

```typescript
setInterval(cleanupExpired, 10 * 60 * 1000); // 10 minutes
```

**Problem:** Cleanup kjører hver 10. minutt, kan være for ofte.

**Anbefaling:**
- Vurder å kjøre cleanup mindre ofte (f.eks. hver time)
- Eller bruk cron-basert cleanup

**Prioritet:** 🟢 LAV

---

### 20. Manglende Content Security Policy
**Problem:** Ingen CSP headers i responser.

**Anbefaling:**
- Implementer CSP headers
- Begrens inline scripts og styles

**Prioritet:** 🟢 LAV

---

### 21. Verbose logging i produksjon
**Problem:** Mye logging kan eksponere systeminformasjon.

**Anbefaling:**
- Bruk log-nivåer (DEBUG, INFO, WARN, ERROR)
- Reduser logging i produksjon
- Sørg for at logger ikke inneholder sensitiv data

**Prioritet:** 🟢 LAV

---

## ✅ GODE SIKKERHETSPRAKSISER

### 1. ✅ Webhook-signaturverifisering
- Korrekt implementert med `constructEventAsync`
- Sjekker webhook secret
- God feilhåndtering

### 2. ✅ Kryptering
- Bruker AES-GCM (godt valg)
- Random IV for hver kryptering
- Proper key management

### 3. ✅ Passord-hashing
- Bruker PBKDF2 med 100,000 iterasjoner
- Salt lagres separat
- Secure password verification

### 4. ✅ Autentisering
- Bruker Supabase Auth korrekt
- Sjekker tokens på kritiske endepunkter
- Service role key brukes kun på serveren

### 5. ✅ Row Level Security (RLS)
- RLS er aktivert på `user_profiles` tabell
- Policies er korrekt konfigurert
- Service role har nødvendig tilgang

### 6. ✅ Idempotency i webhooks
- Sjekker om checkout session allerede er prosessert
- Forhindrer duplikat coin-tildeling
- Håndterer race conditions

### 7. ✅ Access token one-time use
- Tokens slettes umiddelbart etter bruk
- Kort utløpstid (5 minutter)
- Validerer token mot QR drop ID

### 8. ✅ Sensitive data redactering
- Passord og encryption keys redakteres i logger
- God praksis for logging

---

## 📊 SIKKERHETSSAMMENDRAG

### Sterke sider:
- ✅ Solid krypteringsimplementasjon
- ✅ Korrekt webhook-signaturverifisering
- ✅ God autentiseringshåndtering
- ✅ RLS policies på plass
- ✅ Idempotency i kritiske operasjoner

### Hovedproblemer:
- 🔴 CORS er for åpen
- 🔴 DELETE-endepunkt mangler autorisasjon
- 🔴 Path traversal i filnavn
- 🔴 Passord i klartekst i index.tsx (hvis den brukes)
- 🟠 XSS-sårbarhet via dangerouslySetInnerHTML
- 🟠 Ingen rate limiting
- 🟠 Manglende server-side filvalidering

### Anbefalte handlinger:
1. **UMIDDELBART:** Fiks CORS, DELETE-autorisasjon, og path traversal
2. **FØR PRODUKSJON:** Implementer rate limiting og filvalidering
3. **KONTINUERLIG:** Overvåk og oppdater sikkerhetspraksis

---

## 🔄 NESTE STEG

1. Gjennomgå denne rapporten med teamet
2. Prioriter kritiske problemer
3. Implementer fikser for kritiske og høye problemer
4. Test alle endringer grundig
5. Gjennomfør ny sikkerhetsvurdering etter fikser

---

## 📝 NOTATER

- Denne vurderingen er basert på statisk kodeanalyse
- Anbefaler også å gjennomføre:
  - Penetrasjonstesting
  - Dependency scanning (npm audit)
  - Automatisert sikkerhetsskanning
  - Code review av eksterne sikkerhetseksperter

---

**Rapport generert:** $(date)  
**Analysert av:** AI Security Assessment  
**Versjon:** 1.0
