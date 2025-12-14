# Test Plan for Secure Mode QR Drops

## ✅ Fikser som er implementert:

1. **ClientId Fix** - QR drop ID genereres på klienten før kryptering
2. **Salt Length Fix** - Håndterer både 12-byte (legacy) og 16-byte salt
3. **@ to # Fix** - QR scanner konverterer @ til # automatisk
4. **Key Storage** - K1/K2 lagres med safeSetItem (håndterer quota)

## 🧪 Test Steg-for-Steg:

### Test 1: Opprett NY Secure Mode QR Drop

1. Gå til upload-siden
2. Velg "Secure Mode" (split-key)
3. Legg til tekst eller URL
4. Opprett QR drop
5. **VERIFISER I CONSOLE:**
   - `🔐 [UPLOAD] Using client-generated ID for encryption: [UUID]`
   - `✅ [UPLOAD] Encrypted textContent with ID: [UUID]`
   - `✅ [UPLOAD] Server used client-generated ID - encryption/decryption will match!`

### Test 2: Scan QR1

1. Scan QR1 (eller åpne QR1 URL)
2. **VERIFISER I CONSOLE:**
   - `✅ [UNLOCK SCREEN] Fixed URL: ...#k1=...` (hvis @ ble konvertert)
   - `✅ [APP] Stored K1 for [ID] using safeSetItem`
   - `✅ [APP] Server verified QR1 was scanned (zero-knowledge)`

### Test 3: Scan QR2

1. Scan QR2
2. **VERIFISER I CONSOLE:**
   - `✅ [UNLOCK SCREEN] Fixed URL: ...#k2=...` (hvis @ ble konvertert)
   - `✅ [APP] Stored k2_temp_[ID] from hash with safeSetItem`
   - `✅ [COMBINE] Keys decoded: {k1Bytes: 32, k2Bytes: 32, k1Valid: true, k2Valid: true}`
   - `✅ [COMBINE] Master key generated: {masterBytes: 32, isValid: true}`

### Test 4: Dekryptering

1. Etter QR2 scan, skal dekryptering starte automatisk
2. **VERIFISER I CONSOLE:**
   - `✅ [DECRYPT] IV decoded: {ivLength: 12, isValid: true}`
   - `✅ [DECRYPT] Salt decoded: {saltLength: 16, isValid: true}` (eller 12 med padding warning)
   - `✅ [DECRYPT] HKDF key derived`
   - `✅ [DECRYPT] Decryption successful, plaintext length: [number]`
   - `✅ [SCAN VIEW] Successfully decrypted textContent`

## ❌ Hvis det feiler:

### Feil: "Server ID mismatch"
- **Årsak:** Server bruker ikke clientId
- **Fix:** Sjekk at `clientId` sendes i metadata og server sjekker for det

### Feil: "Salt length mismatch"
- **Årsak:** Salt er ikke 12 eller 16 bytes
- **Fix:** Sjekk at salt padding fungerer

### Feil: "OperationError" ved dekryptering
- **Årsak:** additionalData (fileId) matcher ikke
- **Fix:** Sjekk at samme ID brukes ved kryptering og dekryptering

### Feil: "K1 not found"
- **Årsak:** URL hash tapt eller ikke ekstrahert
- **Fix:** Sjekk at @ til # konvertering fungerer

## 🔍 Debug Commands:

```javascript
// I browser console, sjekk:
localStorage.getItem('k1_[QR_DROP_ID]')  // Skal være base64url string
sessionStorage.getItem('k2_temp_[QR_DROP_ID]')  // Skal være base64url string
sessionStorage.getItem('master_[QR_DROP_ID]')  // Skal være hex string (64 chars)
```

## 📝 Forventet Resultat:

✅ Nye Secure Mode QR drops skal fungere perfekt
❌ Gamle QR drops (før clientId fix) vil fortsatt feile (forventet)
