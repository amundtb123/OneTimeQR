// Web Crypto API utilities for Secure Mode encryption

const te = new TextEncoder();

/**
 * Base64URL encoding (URL-safe base64, no padding)
 */
function b64u(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Base64URL decoding
 */
function fromB64u(s: string): Uint8Array {
  if (!s || typeof s !== 'string') {
    throw new Error(`Invalid base64url string: ${s}`);
  }
  
  try {
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(b64);
    return Uint8Array.from(decoded, c => c.charCodeAt(0));
  } catch (error) {
    console.error('❌ [B64U] Failed to decode base64url:', {
      input: s,
      inputLength: s?.length,
      error: error.message
    });
    throw new Error(`Failed to decode base64url string: ${error.message}`);
  }
}

/**
 * XOR two Uint8Arrays of equal length
 */
function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) throw new Error('XOR length mismatch');
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

/**
 * Derive encryption key using HKDF-SHA-256
 */
async function hkdfKey(master: Uint8Array, salt: Uint8Array, info: string): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(info) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Split-key: Generate master key and split into K1 and K2 (K = K1 XOR K2)
 * Returns k1, k2 (as base64url strings) and master (as Uint8Array for encryption)
 */
export async function splitKey(): Promise<{ k1: string; k2: string; master: Uint8Array }> {
  const master = crypto.getRandomValues(new Uint8Array(32));
  const k1 = crypto.getRandomValues(new Uint8Array(32));
  const k2 = xor(master, k1);
  return {
    k1: b64u(k1),
    k2: b64u(k2),
    master
  };
}

/**
 * Combine k1 and k2 to get master key
 */
export function combineKeys(k1Base64Url: string, k2Base64Url: string): Uint8Array {
  const k1 = fromB64u(k1Base64Url);
  const k2 = fromB64u(k2Base64Url);
  return xor(k1, k2);
}

/**
 * Encrypt bytes using split-key master (with HKDF and fileId binding)
 */
export async function encryptBytes(
  plain: Uint8Array,
  master: Uint8Array,
  fileId: string
): Promise<{ iv: string; salt: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await hkdfKey(master, salt, `OneTimeQR:file:${fileId}`);
  
  // AAD binds encryption to fileId (prevents key reuse across files)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode(fileId) },
    key,
    plain
  );
  
  return {
    iv: b64u(iv),
    salt: b64u(salt),
    ciphertext: b64u(new Uint8Array(ciphertext))
  };
}

/**
 * Decrypt bytes using split-key master (with HKDF and fileId binding)
 */
export async function decryptBytes(
  enc: { iv: string; salt: string; ciphertext: string },
  master: Uint8Array,
  fileId: string
): Promise<Uint8Array> {
  console.log('🔍 [DECRYPT] decryptBytes called:', {
    ivString: enc.iv,
    ivStringLength: enc.iv?.length,
    saltString: enc.salt?.substring(0, 20) + '...',
    saltStringLength: enc.salt?.length,
    ciphertextLength: enc.ciphertext?.length,
    masterKeyLength: master.length,
    fileId
  });
  
  try {
    const iv = fromB64u(enc.iv);
    console.log('✅ [DECRYPT] IV decoded:', {
      ivLength: iv.length,
      expectedLength: 12,
      isValid: iv.length === 12,
      ivPreview: Array.from(iv.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('') + '...'
    });
    
    if (iv.length !== 12) {
      throw new Error(`IV length is ${iv.length}, expected 12 bytes. IV string: ${enc.iv}`);
    }
    
    const salt = fromB64u(enc.salt);
    console.log('✅ [DECRYPT] Salt decoded:', {
      saltLength: salt.length,
      expectedLength: 16,
      isValid: salt.length === 16
    });
    
    const ct = fromB64u(enc.ciphertext);
    console.log('✅ [DECRYPT] Ciphertext decoded:', {
      ciphertextLength: ct.length
    });
    
    const key = await hkdfKey(master, salt, `OneTimeQR:file:${fileId}`);
    console.log('✅ [DECRYPT] HKDF key derived');
    
    // Validate ciphertext length (must be at least 16 bytes for AES-GCM tag)
    if (ct.length < 16) {
      throw new Error(`Ciphertext too short: ${ct.length} bytes (minimum 16 bytes required for AES-GCM tag)`);
    }
    
    // Validate fileId for additionalData
    const additionalData = te.encode(fileId);
    console.log('🔍 [DECRYPT] Decryption parameters:', {
      ivLength: iv.length,
      saltLength: salt.length,
      ciphertextLength: ct.length,
      fileId: fileId,
      fileIdLength: fileId.length,
      additionalDataLength: additionalData.length
    });
    
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData },
        key,
        ct
      );
      
      console.log('✅ [DECRYPT] Decryption successful, plaintext length:', plain.byteLength);
      return new Uint8Array(plain);
    } catch (cryptoError: any) {
      // Web Crypto API errors are often generic - provide more context
      console.error('❌ [DECRYPT] Web Crypto API error:', {
        name: cryptoError.name,
        message: cryptoError.message,
        code: cryptoError.code,
        // Common causes:
        possibleCauses: [
          'Wrong master key (k1/k2 mismatch)',
          'Corrupted ciphertext',
          'Wrong fileId (additionalData mismatch)',
          'IV/salt decoding error',
          'Ciphertext format mismatch'
        ]
      });
      
      // Re-throw with more context
      throw new Error(`Decryption failed: ${cryptoError.name || 'Unknown error'} - ${cryptoError.message || 'No details'}. Possible causes: wrong key, corrupted data, or format mismatch.`);
    }
  } catch (error) {
    console.error('❌ [DECRYPT] Decryption failed:', error);
    console.error('❌ [DECRYPT] Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Generate a random encryption key (legacy - kept for backwards compatibility)
 */
export async function generateEncryptionKey(): Promise<string> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(key)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encrypt text data using split-key master (for Secure Mode)
 */
export async function encryptTextWithSplitKey(
  text: string,
  master: Uint8Array,
  fileId: string
): Promise<{ iv: string; salt: string; ciphertext: string }> {
  const plainBytes = te.encode(text);
  return encryptBytes(plainBytes, master, fileId);
}

/**
 * Decrypt text data using split-key master (for Secure Mode)
 */
export async function decryptTextWithSplitKey(
  enc: { iv: string; salt: string; ciphertext: string },
  master: Uint8Array,
  fileId: string
): Promise<string> {
  const plainBytes = await decryptBytes(enc, master, fileId);
  return new TextDecoder().decode(plainBytes);
}

/**
 * Encrypt data using AES-GCM (legacy - hex key format)
 */
export async function encryptData(data: string, keyHex: string): Promise<string> {
  // Convert hex key to CryptoKey
  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  // Combine IV + encrypted data and convert to base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data using AES-GCM
 */
export async function decryptData(encryptedBase64: string, keyHex: string): Promise<string> {
  try {
    // Convert hex key to CryptoKey
    const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // Decode base64
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data. Invalid key or corrupted data.');
  }
}

/**
 * Encrypt a file using split-key master (for Secure Mode)
 * Returns encrypted data as { iv, salt, ciphertext } object
 */
export async function encryptFileWithSplitKey(
  file: File,
  master: Uint8Array,
  fileId: string
): Promise<{ iv: string; salt: string; ciphertext: string }> {
  const fileBuffer = await file.arrayBuffer();
  return encryptBytes(new Uint8Array(fileBuffer), master, fileId);
}

/**
 * Decrypt a file using split-key master (for Secure Mode)
 * Returns decrypted file as Blob
 */
export async function decryptFileWithSplitKey(
  enc: { iv: string; salt: string; ciphertext: string },
  master: Uint8Array,
  fileId: string,
  originalMimeType?: string
): Promise<Blob> {
  const plainBytes = await decryptBytes(enc, master, fileId);
  return new Blob([plainBytes], { type: originalMimeType || 'application/octet-stream' });
}

/**
 * Encrypt a file using AES-GCM (legacy - hex key format)
 * Returns encrypted file as Blob
 */
export async function encryptFile(file: File, keyHex: string): Promise<Blob> {
  // Convert hex key to CryptoKey
  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Read file as ArrayBuffer
  const fileBuffer = await file.arrayBuffer();
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    fileBuffer
  );

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Return as Blob
  return new Blob([combined], { type: 'application/octet-stream' });
}

/**
 * Decrypt a file using AES-GCM
 * Returns decrypted file as Blob
 */
export async function decryptFile(encryptedBlob: Blob, keyHex: string): Promise<Blob> {
  try {
    // Convert hex key to CryptoKey
    const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // Read encrypted blob as ArrayBuffer
    const combined = new Uint8Array(await encryptedBlob.arrayBuffer());
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    // Return as Blob
    return new Blob([decrypted]);
  } catch (error) {
    console.error('File decryption failed:', error);
    throw new Error('Failed to decrypt file. Invalid key or corrupted data.');
  }
}

/**
 * Create QR #1 URL with k1 in fragment (access code)
 */
export function createQr1Url(baseUrl: string, fileId: string, k1: string): string {
  // k1 is in URL fragment - server never sees it
  return `${baseUrl}/scan/${fileId}#k1=${k1}`;
}

/**
 * Create QR #2 URL with k2 in fragment (unlock code)
 */
export function createQr2Url(baseUrl: string, fileId: string, k2: string): string {
  // k2 is in URL fragment - server never sees it
  return `${baseUrl}/unlock/${fileId}#k2=${k2}`;
}

/**
 * Extract k1 from URL fragment
 */
export function extractK1FromUrl(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/k1=([^&]+)/);
  return match ? match[1] : null;
}

/**
 * Extract k2 from URL fragment
 */
export function extractK2FromUrl(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/k2=([^&]+)/);
  return match ? match[1] : null;
}

/**
 * Create a shareable decryption key URL (legacy - for backwards compatibility)
 */
export function createDecryptionKeyUrl(baseUrl: string, qrId: string, key: string): string {
  // Legacy: Use simple unlock parameter - server will provide the key
  return `${baseUrl}/scan/${qrId}?unlock=1`;
}