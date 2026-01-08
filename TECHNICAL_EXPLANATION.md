# 🔐 OneTimeQR Secure Mode - Teknisk Forklaring

## Hva er Secure Mode?

Secure Mode er en **zero-knowledge encryption** løsning hvor serveren **aldri** ser dekrypteringsnøklene. Dette sikrer at selv om serveren blir kompromittert, kan innholdet ikke dekrypteres.

## 🎯 Hovedprinsipp: Split-Key Encryption

I stedet for én nøkkel, bruker vi **to nøkler (K1 og K2)** som kombineres for å dekryptere innholdet.

### Hvordan det fungerer:

1. **Master Key genereres:** En 32-byte master key genereres tilfeldig
2. **Split i to:** Master key splittes i K1 og K2 ved XOR-operasjon:
   - `K1 = random 32 bytes`
   - `K2 = K1 XOR Master`
   - `Master = K1 XOR K2` (kan rekonstrueres)
3. **K1 lagres i QR1:** K1 legges i URL fragment (`#k1=...`)
4. **K2 lagres i QR2:** K2 legges i URL fragment (`#k2=...`)
5. **Serveren ser aldri nøklene:** URL fragments sendes aldri til serveren (kun klienten ser dem)

## 📱 To QR-koder - Hvorfor?

### QR #1: Access Code (K1)
- **URL format:** `https://onetimeqr.com/scan/{id}#k1={base64url-encoded-k1}`
- **Innhold:** K1 (32 bytes, base64url-encoded)
- **Bruksområde:** Første scanning - gir tilgang til å scanne QR2
- **Server-side:** Serveren registrerer at QR1 er scannet (uten å se K1)

### QR #2: Unlock Code (K2)
- **URL format:** `https://onetimeqr.com/unlock/{id}#k2={base64url-encoded-k2}`
- **Innhold:** K2 (32 bytes, base64url-encoded)
- **Bruksområde:** Andre scanning - kombineres med K1 for dekryptering
- **Server-side:** Serveren verifiserer at QR1 ble scannet først (uten å se K1 eller K2)

## 🔒 Krypteringsprosess

### Ved opprettelse av QR drop:

1. **Generer Master Key:**
   ```typescript
   const master = crypto.getRandomValues(new Uint8Array(32)); // 32 bytes
   ```

2. **Split i K1 og K2:**
   ```typescript
   const k1 = crypto.getRandomValues(new Uint8Array(32));
   const k2 = xor(k1, master); // XOR operasjon
   ```

3. **Krypter innhold med Master Key:**
   - Bruker AES-GCM (256-bit)
   - HKDF-SHA-256 for key derivation
   - Binder kryptering til `fileId` (QR drop ID) via `additionalData`
   - Genererer IV (12 bytes) og Salt (16 bytes) per kryptering

4. **Lagre ciphertext på server:**
   - Serveren lagrer: `{iv, salt, ciphertext}` (alle base64url-encoded)
   - Serveren ser **aldri** Master Key, K1, eller K2

5. **Generer QR-koder:**
   - QR1: `https://onetimeqr.com/scan/{id}#k1={k1}`
   - QR2: `https://onetimeqr.com/unlock/{id}#k2={k2}`

## 🔓 Dekrypteringsprosess

### Ved scanning av QR1 og QR2:

1. **Scan QR1:**
   - Ekstraher K1 fra URL fragment (`#k1=...`)
   - Lagre K1 lokalt (localStorage/sessionStorage)
   - Serveren registrerer at QR1 er scannet (uten å se K1)

2. **Scan QR2:**
   - Ekstraher K2 fra URL fragment (`#k2=...`)
   - Hent K1 fra lokal lagring
   - Kombiner: `master = K1 XOR K2`
   - Hent ciphertext fra serveren
   - Dekrypter med Master Key + fileId

3. **Dekryptering:**
   ```typescript
   // Dekode IV, Salt, Ciphertext fra base64url
   const iv = fromB64u(ciphertext.iv);      // 12 bytes
   const salt = fromB64u(ciphertext.salt);  // 16 bytes
   const ct = fromB64u(ciphertext.ciphertext);
   
   // Derive key med HKDF (bruker salt + fileId)
   const key = await hkdfKey(master, salt, `OneTimeQR:file:${fileId}`);
   
   // Dekrypter med AES-GCM (bruker fileId som additionalData)
   const plain = await crypto.subtle.decrypt(
     { name: 'AES-GCM', iv, additionalData: encode(fileId) },
     key,
     ct
   );
   ```

## 🛡️ Zero-Knowledge Prinsipp

### Hva serveren IKKE ser:
- ❌ K1 (ligger i URL fragment, sendes aldri til server)
- ❌ K2 (ligger i URL fragment, sendes aldri til server)
- ❌ Master Key (kombineres kun lokalt på klienten)
- ❌ Dekryptert innhold (kun ciphertext lagres)

### Hva serveren VET:
- ✅ At QR1 er scannet (registrert med timestamp)
- ✅ At QR2 kan brukes (verifiserer at QR1 ble scannet først)
- ✅ Ciphertext (kryptert innhold)
- ✅ Metadata (ID, contentType, expiry, etc.)

## 🔧 Kritiske Tekniske Detaljer

### 1. URL Fragment vs Query Parameter
- **Fragment (`#`):** Sendes **aldri** til serveren (kun klienten ser det)
- **Query (`?`):** Sendes til serveren (ikke trygt for nøkler)
- Derfor bruker vi `#k1=` og `#k2=` i stedet for `?k1=` og `?k2=`

### 2. QR Scanner Kompatibilitet
- Noen QR-scannere konverterer `#` til `@` i URLs
- **Fix:** Detekterer og konverterer `@k1=` → `#k1=` før parsing

### 3. ID Matching (Kritisk Fix!)
- **Problem:** Kryptering brukte `tempFileId`, dekryptering brukte `currentQrDropId`
- **Løsning:** Genererer ID på klienten først, sender til serveren
- **Resultat:** Samme ID brukes ved både kryptering og dekryptering

### 4. Salt Lengde Kompatibilitet
- **Ny:** 16-byte salt (standard for HKDF)
- **Legacy:** 12-byte salt (gamle QR drops)
- **Fix:** Automatisk padding av 12-byte salt til 16 bytes

### 5. Storage Quota Management
- **Problem:** localStorage kan bli full (QuotaExceededError)
- **Løsning:** `safeSetItem` wrapper som:
  - Fanger quota-feil
  - Rydder opp gamle nøkler (>1 time)
  - Prøver igjen

## 📊 Data Flow Diagram

```
┌─────────────┐
│   Opprett   │
│  QR Drop    │
└──────┬──────┘
       │
       ├─► Generer Master Key (32 bytes)
       ├─► Split: K1 + K2 = Master
       ├─► Krypter innhold med Master + fileId
       ├─► Send ciphertext til server
       └─► Generer QR1 (#k1=...) og QR2 (#k2=...)

┌─────────────┐
│  Scan QR1   │
└──────┬──────┘
       │
       ├─► Ekstraher K1 fra #k1=...
       ├─► Lagre K1 lokalt
       └─► Server: Registrer QR1 scannet (uten K1)

┌─────────────┐
│  Scan QR2   │
└──────┬──────┘
       │
       ├─► Ekstraher K2 fra #k2=...
       ├─► Hent K1 fra lokal lagring
       ├─► Kombiner: Master = K1 XOR K2
       ├─► Hent ciphertext fra server
       └─► Dekrypter med Master + fileId

┌─────────────┐
│  Vis Innhold│
└─────────────┘
```

## 🔐 Sikkerhetsegenskaper

1. **Zero-Knowledge:** Serveren kan aldri dekryptere innholdet
2. **Split-Key:** Begge nøklene må være tilgjengelige for dekryptering
3. **FileId Binding:** Kryptering er bundet til spesifikk QR drop ID
4. **HKDF:** Key derivation forhindrer key reuse
5. **AES-GCM:** Autentisert kryptering (forhindrer tampering)

## 🎯 Bruksscenarioer

### Scenario 1: Fysisk deling
- QR1 printes på papir
- QR2 sendes digitalt
- Begge må scannes for å se innholdet

### Scenario 2: To-faktor autentisering
- QR1 = "noe du har" (fysisk)
- QR2 = "noe du har" (digitalt)
- Begge kreves for tilgang

### Scenario 3: Tidsbegrenset tilgang
- QR1 scannes først (registreres på server)
- QR2 må scannes innen 5 minutter
- Serveren verifiserer tidsstempel

## 💡 Hvorfor dette er "magisk"

1. **Serveren kan ikke lese innholdet** - selv med full database-tilgang
2. **To QR-koder gir ekstra sikkerhet** - begge må være tilgjengelige
3. **URL fragments er usynlige for serveren** - perfekt for zero-knowledge
4. **Kombinert med tidsbegrensning** - QR1 må scannes først, QR2 innen 5 minutter

## 🚀 Implementasjonsdetaljer

### Filer:
- **Frontend:** `src/components/upload-section.tsx` (kryptering)
- **Frontend:** `src/components/unlock-screen.tsx` (QR scanning)
- **Frontend:** `src/components/scan-view.tsx` (dekryptering)
- **Frontend:** `src/utils/encryption.ts` (kryptografiske funksjoner)
- **Backend:** `src/supabase/functions/server/index-standalone.tsx` (server API)

### Viktige funksjoner:
- `splitKey()` - Genererer K1, K2, Master
- `combineKeys()` - Kombinerer K1 + K2 = Master
- `encryptBytes()` - Krypterer med Master + fileId
- `decryptBytes()` - Dekrypterer med Master + fileId
- `createQr1Url()` - Genererer QR1 URL med #k1=
- `createQr2Url()` - Genererer QR2 URL med #k2=

## 📝 For GPT Input

Dette systemet implementerer **split-key zero-knowledge encryption** hvor:
- To nøkler (K1, K2) kombineres lokalt for å dekryptere
- Serveren ser aldri nøklene (de ligger i URL fragments)
- Kryptering er bundet til fileId for å forhindre key reuse
- Systemet håndterer edge cases som QR scanner #→@ konvertering, storage quota, og legacy salt-lengder


