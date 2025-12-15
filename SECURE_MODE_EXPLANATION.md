# 🔐 Secure Mode QR Drops - Teknisk Forklaring

## Hva er Secure Mode?

Secure Mode er en **zero-knowledge encryption** løsning hvor innholdet krypteres med en **split-key** (delt nøkkel) som består av to separate deler: **K1** og **K2**. Disse to nøklene må kombineres for å dekryptere innholdet.

## 🎯 Hovedprinsippet

**Serveren ser ALDRI nøklene (zero-knowledge):**
- K1 og K2 sendes aldri til serveren
- De ligger i URL-fragmenter (`#k1=...` og `#k2=...`)
- URL-fragmenter sendes ikke til serveren (kun klienten ser dem)
- Serveren kan verifisere at QR1 er scannet uten å se K1

## 📋 Hvordan det fungerer

### Steg 1: Opprettelse av Secure Mode QR Drop

1. **Generer master key:**
   - Systemet genererer en 32-byte master key
   - Denne splittes i to: **K1** og **K2** (hver 32 bytes)
   - Master = K1 XOR K2

2. **Krypter innhold:**
   - Innholdet (tekst/URL/filer) krypteres med master key
   - Krypteringen bruker **AES-GCM** med:
     - **IV (Initialization Vector):** 12 bytes, tilfeldig generert
     - **Salt:** 16 bytes, tilfeldig generert
     - **HKDF:** Key derivation function som binder nøkkelen til QR drop ID
     - **AdditionalData:** QR drop ID (forhindrer nøkkel-gjenbruk)

3. **Generer to QR-koder:**
   - **QR1 (Access Code):** `https://onetimeqr.com/scan/{ID}#k1={K1}`
     - K1 ligger i URL-fragmentet (serveren ser det ikke)
   - **QR2 (Unlock Code):** `https://onetimeqr.com/unlock/{ID}#k2={K2}`
     - K2 ligger i URL-fragmentet (serveren ser det ikke)

4. **Lagre på server:**
   - Serveren lagrer kun **kryptert innhold** (ciphertext)
   - Serveren lagrer IKKE K1 eller K2
   - Serveren kan verifisere at QR1 er scannet (uten å se K1)

### Steg 2: Scanning av QR1

1. **Bruker scanner QR1:**
   - QR-koden inneholder URL med K1 i fragmentet: `#k1=...`
   - Noen QR-scannere konverterer `#` til `@` - dette fikses automatisk

2. **K1 lagres lokalt:**
   - K1 lagres i `localStorage` og `sessionStorage`
   - Serveren markeres at QR1 er scannet (uten å se K1)
   - Serveren lagrer kun: `{qrDropId, scannedAt, expiresAt}`

3. **Bruker får beskjed:**
   - "QR1 scannet! Nå kan du scanne QR2"

### Steg 3: Scanning av QR2

1. **Bruker scanner QR2:**
   - QR-koden inneholder URL med K2 i fragmentet: `#k2=...`
   - K2 ekstraheres fra URL-fragmentet

2. **Kombiner K1 og K2:**
   - Hent K1 fra `localStorage` (lagret fra QR1)
   - Hent K2 fra URL-fragmentet (fra QR2)
   - Dekod begge fra Base64URL til bytes
   - Kombiner: **Master = K1 XOR K2**

3. **Verifiser QR1:**
   - Serveren verifiserer at QR1 ble scannet først
   - Dette skjer uten at serveren ser K1 eller K2

4. **Dekrypter innhold:**
   - Hent kryptert innhold fra serveren
   - Dekrypter med master key, IV, salt, og QR drop ID
   - Vis dekryptert innhold til brukeren

## 🔑 Kryptografiske Detaljer

### Split-Key Generering
```typescript
// Generer 32-byte master key
const master = crypto.getRandomValues(new Uint8Array(32));

// Split i to: K1 og K2
const k1 = crypto.getRandomValues(new Uint8Array(32));
const k2 = xor(master, k1); // k2 = master XOR k1

// Master kan gjenopprettes: master = k1 XOR k2
```

### Kryptering
```typescript
// Generer IV (12 bytes) og Salt (16 bytes)
const iv = crypto.getRandomValues(new Uint8Array(12));
const salt = crypto.getRandomValues(new Uint8Array(16));

// Derive key med HKDF (binder til QR drop ID)
const key = await hkdfKey(master, salt, `OneTimeQR:file:${qrDropId}`);

// Krypter med AES-GCM
const ciphertext = await crypto.subtle.encrypt(
  { 
    name: 'AES-GCM', 
    iv, 
    additionalData: encode(qrDropId) // Binder til ID
  },
  key,
  plaintext
);
```

### Dekryptering
```typescript
// Kombiner K1 og K2 til master
const master = xor(k1, k2);

// Derive samme key (må bruke samme salt og ID)
const key = await hkdfKey(master, salt, `OneTimeQR:file:${qrDropId}`);

// Dekrypter med AES-GCM
const plaintext = await crypto.subtle.decrypt(
  { 
    name: 'AES-GCM', 
    iv, 
    additionalData: encode(qrDropId) // Må matche!
  },
  key,
  ciphertext
);
```

## 🛡️ Sikkerhetsfunksjoner

1. **Zero-Knowledge:**
   - Serveren ser aldri K1 eller K2
   - Serveren kan ikke dekryptere innholdet
   - Kun brukeren med begge QR-kodene kan dekryptere

2. **ID Binding:**
   - Krypteringen er bundet til QR drop ID
   - Forhindrer at samme nøkkel kan brukes på andre QR drops
   - `additionalData` i AES-GCM må matche ved dekryptering

3. **HKDF Key Derivation:**
   - Master key derivates til en spesifikk key for hver QR drop
   - Salt forhindrer at samme master key gir samme derived key

4. **QR1 Verification:**
   - Serveren verifiserer at QR1 er scannet før QR2 kan brukes
   - Dette skjer uten at serveren ser K1
   - QR1 scan utløper etter 5 minutter

## 🔧 Tekniske Fikser

### 1. ClientId Fix (Kritisk!)
**Problem:** QR drop ID genereres på serveren etter kryptering, så ID brukt ved kryptering matcher ikke ID ved dekryptering.

**Løsning:** Generer ID på klienten før kryptering, send til serveren som `clientId`. Serveren bruker samme ID.

### 2. @ til # Konvertering
**Problem:** Noen QR-scannere konverterer `#` til `@` i URLs.

**Løsning:** Automatisk deteksjon og konvertering før URL-parsing.

### 3. Salt Padding
**Problem:** Gamle QR drops brukte 12-byte salt, nye bruker 16-byte.

**Løsning:** Automatisk padding av 12-byte salt til 16 bytes for HKDF.

### 4. Storage Quota Management
**Problem:** `localStorage` kan bli full.

**Løsning:** Automatisk cleanup av gamle nøkler og quota-håndtering.

## 📊 Dataflyt

```
[Opprettelse]
Master Key → Split (K1, K2) → Krypter med Master → Lagre ciphertext på server
                              ↓
                    Generer QR1 (med K1) og QR2 (med K2)

[Scanning]
QR1 → Ekstraher K1 → Lagre lokalt → Server verifiserer (uten å se K1)
QR2 → Ekstraher K2 → Hent K1 → Kombiner (K1 XOR K2 = Master) → Dekrypter
```

## 🎯 Hvorfor dette er "magisk"

1. **Serveren kan ikke lese innholdet** - selv om de har tilgang til databasen
2. **Bare brukeren med begge QR-kodene** kan dekryptere
3. **QR-kodene kan deles separat** - QR1 kan deles først, QR2 senere
4. **Verifisering uten å se nøkkelen** - serveren kan bekrefte at QR1 er scannet uten å se K1

## 📝 For GPT Input

Dette systemet implementerer:
- **Split-key encryption** (K1 + K2 = Master)
- **Zero-knowledge architecture** (server ser ikke nøkler)
- **AES-GCM encryption** med HKDF key derivation
- **URL fragment-based key distribution** (#k1= og #k2=)
- **Client-side decryption** (all kryptografi skjer i nettleseren)
- **Server-side verification** (server kan verifisere QR1 scan uten å se K1)
