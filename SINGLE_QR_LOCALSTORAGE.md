# 📦 Single QR Mode - localStorage Oversikt

## 🔑 Hvordan nøkler lagres lokalt

### Single QR Mode Flow:

1. **QR-kode genereres** med K1 i URL fragment:
   ```
   https://onetimeqr.com/scan/{id}#k1={base64url-k1}
   ```

2. **Når QR scannes** (i App.tsx linje 727-756):
   - K1 ekstraheres fra URL fragment (`#k1=...`)
   - K1 konverteres fra base64url → bytes → hex
   - Master key lagres i **sessionStorage**:
     ```javascript
     sessionStorage.setItem(`master_${id}`, masterKeyHex);
     ```
   - Key format: `master_{qrDropId}` = hex string (64 tegn = 32 bytes)

3. **Dekryptering** (i scan-view.tsx):
   - Henter master key fra sessionStorage: `master_${id}`
   - Bruker master key direkte for dekryptering
   - Ingen K2 nødvendig (kun K1)

### localStorage/sessionStorage Keys for Single QR Mode:

| Key | Format | Eksempel | Beskrivelse |
|-----|--------|----------|-------------|
| `master_{id}` | Hex string (64 chars) | `master_abc123...` = `a1b2c3...` | Master key (K1 konvertert til hex) |

### Sammenligning med Secure Mode (Dual QR):

| Mode | K1 Storage | K2 Storage | Master Key Storage |
|------|------------|------------|-------------------|
| **Single QR** | ❌ Ikke lagret | ❌ Ikke nødvendig | ✅ `master_{id}` i sessionStorage |
| **Secure Mode** | ✅ `k1_{id}` i localStorage | ✅ `k2_temp_{id}` i localStorage | ✅ `master_{id}` i sessionStorage (K1 XOR K2) |

### Kodeeksempel - Single QR Mode:

```typescript
// App.tsx linje 727-756
if (isSingleQrMode) {
  // K1 er base64url fra URL fragment
  const k1Bytes = fromB64u(k1); // base64url → bytes
  
  // Konverter til hex for kompatibilitet
  const masterKeyHex = Array.from(k1Bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(''); // bytes → hex string (64 chars)
  
  // Lagre i sessionStorage
  sessionStorage.setItem(`master_${id}`, masterKeyHex);
  
  // Bruk direkte for dekryptering
  setUnlockKey(masterKeyHex);
}
```

### Hvordan sjekke i browser console:

```javascript
// Se alle master keys
Object.keys(sessionStorage).filter(k => k.startsWith('master_'))

// Se master key for spesifikk QR
sessionStorage.getItem('master_{qrDropId}')

// Se alle nøkler relatert til en QR
const id = 'your-qr-id';
console.log({
  master: sessionStorage.getItem(`master_${id}`),
  k1: localStorage.getItem(`k1_${id}`), // Kun for Secure Mode
  k2: localStorage.getItem(`k2_temp_${id}`) // Kun for Secure Mode
});
```

### Viktig:
- **Single QR Mode**: Kun `master_{id}` i sessionStorage
- **Secure Mode**: `k1_{id}` + `k2_temp_{id}` → kombineres til `master_{id}`
- Master key er alltid hex string (64 tegn) uavhengig av modus

