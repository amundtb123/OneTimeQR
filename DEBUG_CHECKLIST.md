# Debug Checklist for Secure Mode QR Drops

## 🔍 For å finne ut hva som skjedde:

### 1. Sjekk når QR drop ble opprettet:
- **Ny QR drop (etter clientId fix):** Skal ha logget `🔐 [UPLOAD] Using client-generated ID for encryption: [UUID]`
- **Gammel QR drop (før clientId fix):** Vil IKKE ha denne loggen

### 2. Sjekk console logs for disse meldingene:

**Ved opprettelse (hvis ny):**
- ✅ `🔐 [UPLOAD] Using client-generated ID for encryption: [UUID]`
- ✅ `✅ [UPLOAD] Server used client-generated ID - encryption/decryption will match!`

**Ved scanning QR1:**
- ✅ `✅ [UNLOCK SCREEN] Fixed URL: ...#k1=...` (hvis @ ble konvertert)
- ✅ `✅ [APP] Stored K1 for [ID] using safeSetItem`

**Ved scanning QR2:**
- ✅ `✅ [COMBINE] Keys decoded: {k1Bytes: 32, k2Bytes: 32, k1Valid: true, k2Valid: true}`
- ✅ `✅ [COMBINE] Master key generated: {masterBytes: 32, isValid: true}`

**Ved dekryptering:**
- ✅ `✅ [DECRYPT] IV decoded: {ivLength: 12, isValid: true}`
- ✅ `✅ [DECRYPT] Salt decoded: {saltLength: 16, isValid: true}` (eller 12 med padding)
- ✅ `✅ [DECRYPT] Decryption successful, plaintext length: [number]`

### 3. Hvis dekryptering feiler med OperationError:

**Mulige årsaker:**
1. **Gammel QR drop (før clientId fix):** ID brukt ved kryptering matcher ikke ID ved dekryptering
   - **Løsning:** Opprett en NY QR drop
   
2. **Salt lengde feil:** Salt er ikke 12 eller 16 bytes
   - **Sjekk:** `✅ [DECRYPT] Salt decoded: {saltLength: X}`
   - **Fix:** Salt padding skal håndtere dette automatisk

3. **Master key feil:** K1 eller K2 er feil
   - **Sjekk:** `✅ [COMBINE] Keys decoded: {k1Valid: true, k2Valid: true}`
   - **Fix:** Sjekk at K1 og K2 ble ekstrahert korrekt fra URL

### 4. QR_1D8A feil:
- Dette er IKKE relatert til Secure Mode QR drops
- Dette ser ut til å være fra en annen del av applikasjonen
- Disse feilene påvirker IKKE Secure Mode funksjonaliteten

## 📋 Send meg dette hvis det feiler:

1. **Console logs** fra opprettelse av QR drop
2. **Console logs** fra scanning QR1
3. **Console logs** fra scanning QR2
4. **Console logs** fra dekryptering (inkludert feilmeldinger)
5. **QR drop ID** (så jeg kan sjekke når den ble opprettet)

## ✅ Forventet oppførsel:

- **Nye Secure Mode QR drops (etter clientId fix):** Skal fungere perfekt
- **Gamle Secure Mode QR drops (før clientId fix):** Vil feile med OperationError (forventet)
- **QR_1D8A feil:** Er ikke relatert til Secure Mode QR drops
