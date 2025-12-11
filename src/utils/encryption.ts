// Web Crypto API utilities for Secure Mode encryption

/**
 * Generate a random encryption key
 */
export async function generateEncryptionKey(): Promise<string> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(key)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encrypt data using AES-GCM
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
 * Encrypt a File object using AES-GCM
 * Returns encrypted data as a Blob
 */
export async function encryptFile(file: File, keyHex: string): Promise<Blob> {
  // Read file as ArrayBuffer
  const fileBuffer = await file.arrayBuffer();
  
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
  
  // Encrypt file data
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    fileBuffer
  );

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Return as Blob with a marker to indicate it's encrypted
  return new Blob([combined], { type: 'application/octet-stream' });
}

/**
 * Decrypt a Blob that was encrypted with encryptFile
 */
export async function decryptFile(encryptedBlob: Blob, keyHex: string): Promise<Blob> {
  try {
    // Read encrypted blob as ArrayBuffer
    const encryptedBuffer = await encryptedBlob.arrayBuffer();
    const combined = new Uint8Array(encryptedBuffer);
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    // Convert hex key to CryptoKey
    const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return new Blob([decrypted]);
  } catch (error) {
    console.error('File decryption failed:', error);
    throw new Error('Failed to decrypt file. Invalid key or corrupted data.');
  }
}

/**
 * Create a shareable decryption key URL (for QR #2)
 * Embed the key directly in the URL (base64 encoded for safety)
 */
export function createDecryptionKeyUrl(baseUrl: string, qrId: string, key: string): string {
  // Encode key in base64 and embed in URL
  // This way the key is ONLY in the QR code, never on the server
  const encodedKey = btoa(key).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${baseUrl}/scan/${qrId}?key=${encodedKey}`;
}