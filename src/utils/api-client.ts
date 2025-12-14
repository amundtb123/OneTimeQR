import { projectId, publicAnonKey } from './supabase/info';
import { supabase } from './supabase-client';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-c3c9181e`;

// Global cache for access token to avoid repeated getSession() calls
let cachedAccessToken: string | null = null;
let tokenExpiryTime: number = 0;

// Function to update cached token (called from AuthContext)
export function updateCachedToken(accessToken: string | null, expiresAt?: number) {
  cachedAccessToken = accessToken;
  if (expiresAt) {
    tokenExpiryTime = expiresAt;
  } else {
    // Default to 1 hour if no expiry provided
    tokenExpiryTime = Date.now() + 3600000;
  }
}

// Function to get auth token, preferring cache over getSession()
async function getAuthToken(): Promise<string> {
  // Check if cached token is still valid
  if (cachedAccessToken && Date.now() < tokenExpiryTime) {
    console.log('🔑 Using cached access token');
    return cachedAccessToken;
  }

  // Try to get session, but with longer timeout for authenticated requests
  // Increased timeout to prevent premature fallback to anon key
  try {
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Session timeout')), 5000) // Increased from 1000ms to 5000ms
    );
    
    const { data: { session }, error: sessionError } = await Promise.race([
      sessionPromise,
      timeoutPromise
    ]) as any;
    
    if (!sessionError && session?.access_token) {
      const token = session.access_token;
      const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000;
      updateCachedToken(token, expiresAt);
      console.log('🔑 Retrieved fresh access token');
      return token;
    }
    
    if (sessionError) {
      console.warn('⚠️ Session error:', sessionError);
    }
  } catch (error: any) {
    // If timeout or error, try one more time without timeout
    console.warn('⚠️ Session fetch failed or timed out, retrying without timeout:', error?.message);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!sessionError && session?.access_token) {
        const token = session.access_token;
        const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000;
        updateCachedToken(token, expiresAt);
        console.log('🔑 Retrieved access token on retry');
        return token;
      }
    } catch (retryError) {
      console.error('❌ Retry also failed:', retryError);
    }
  }

  // Only fallback to anon key if we really have no session
  // This should rarely happen - usually means user is logged out
  console.warn('⚠️ No valid session found, using anon key (user may need to log in)');
  return publicAnonKey;
}

export interface QrDropMetadata {
  title?: string;
  contentType: 'file' | 'text' | 'url' | 'bundle';
  textContent?: string;
  urlContent?: string; // JSON string for multiple URLs
  expiryType: string;
  expiryDate?: Date;
  maxScans?: number;
  maxDownloads?: number;
  viewOnly: boolean;
  noPreview?: boolean;
  password?: string;
  qrStyle?: any; // Store QR code styling preferences
  qrCodeDataUrl?: string; // Store the generated QR code image
  secureMode?: boolean; // Secure Mode flag
  encrypted?: boolean; // Encryption flag
  encryptionKey?: string; // Encryption key (not for secureMode)
  originalFileTypes?: Record<string, string>; // Original file types
  // For secureMode: ciphertext sent separately (not in metadata to avoid size limit)
  textContentCiphertext?: string; // JSON string of {iv, salt, ciphertext}
  urlContentCiphertext?: string; // JSON string of {iv, salt, ciphertext}
  clientId?: string; // Client-generated ID for Secure Mode (ensures encryption/decryption use same ID)
}

export interface QrDropData {
  id: string;
  title?: string;
  contentType: 'file' | 'text' | 'url' | 'bundle';
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  textContent?: string;
  urlContent?: string; // JSON string for multiple URLs
  expiryType: string;
  expiresAt: number | null;
  maxScans: number | null;
  maxDownloads: number | null;
  scanCount: number;
  downloadCount: number;
  viewOnly: boolean;
  password: string | null;
  qrStyle?: any; // QR code styling preferences
  createdAt: number;
  expiredAt?: number; // Timestamp when marked as expired
}

async function fetchApi(endpoint: string, options: RequestInit = {}, requireAuth: boolean = false) {
  console.log('🌐 fetchApi called:', endpoint, options.method || 'GET', requireAuth ? '(auth required)' : '');
  
  try {
    const authToken = await getAuthToken();
    
    // If auth is required but we got anon key, that's a problem
    if (requireAuth && authToken === publicAnonKey) {
      console.error('❌ Authentication required but no valid session token available');
      throw new Error('Authentication required');
    }
    
    console.log('🔑 Auth token prepared:', authToken ? `${authToken.substring(0, 20)}...` : 'MISSING');
    
    const url = `${API_BASE}${endpoint}`;
    console.log('🔗 Fetching URL:', url);
    console.log('📦 Request options:', {
      method: options.method || 'GET',
      headers: { ...options.headers, 'Authorization': 'Bearer ***' },
      hasBody: !!options.body,
      bodyLength: options.body ? (typeof options.body === 'string' ? options.body.length : 'FormData') : 0
    });
    
    const fetchPromise = fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        ...options.headers,
      },
    });
    
    console.log('⏳ Fetch promise created, waiting for response...');
    const response = await fetchPromise;
    console.log('📡 Response received:', response.status, response.statusText, response.headers.get('content-type'));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Response not OK. Status:', response.status);
      console.error('❌ Response body:', errorText);
      
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: errorText || 'Unknown error' };
      }
      
      const errorMessage = error.error || error.message || `API error: ${response.status}`;
      console.error('❌ API error:', errorMessage, error);
      const errorWithStatus = new Error(errorMessage);
      (errorWithStatus as any).status = response.status;
      throw errorWithStatus;
    }

    const json = await response.json();
    console.log('✅ Response JSON:', json);
    return json;
  } catch (error: any) {
    console.error('❌ fetchApi error:', error);
    console.error('❌ Error type:', error?.constructor?.name);
    console.error('❌ Error message:', error?.message);
    console.error('❌ Error stack:', error?.stack);
    throw error;
  }
}

export async function uploadFile(file: File, metadata: QrDropMetadata): Promise<{ success: boolean; id: string; qrDrop: any }>;
export async function uploadFile(files: File[], metadata: QrDropMetadata): Promise<{ success: boolean; id: string; qrDrop: any }>;
export async function uploadFile(fileOrFiles: File | File[], metadata: QrDropMetadata) {
  const formData = new FormData();
  
  // Support both single file (backwards compatibility) and multiple files
  const filesArray = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  
  // Append all files with indexed names (file, file1, file2, etc.)
  filesArray.forEach((file, index) => {
    formData.append(index === 0 ? 'file' : `file${index}`, file);
  });
  
  formData.append('metadata', JSON.stringify(metadata));

  return fetchApi('/upload', {
    method: 'POST',
    body: formData,
    headers: {
      // Don't set Content-Type - browser will set it with boundary for FormData
    },
  });
}

export async function createQrDrop(metadata: QrDropMetadata) {
  console.log('📤 createQrDrop called with metadata:', metadata);
  console.log('🔍 [API] Metadata clientId check:', {
    hasClientId: !!metadata.clientId,
    clientIdValue: metadata.clientId,
    clientIdType: typeof metadata.clientId,
    secureMode: metadata.secureMode,
    allKeys: Object.keys(metadata)
  });
  
  try {
    // For secureMode: Send ciphertext as separate fields in same request body
    // This keeps metadata small while allowing large ciphertext
    const requestBody = {
      ...metadata,
      // Ciphertext is already in metadata if secureMode, or undefined
    };
    
    const jsonBody = JSON.stringify(requestBody);
    console.log('📦 JSON body prepared, length:', jsonBody.length);
    console.log('🔍 [API] Request body clientId check:', {
      hasClientId: !!requestBody.clientId,
      clientIdValue: requestBody.clientId
    });
    const result = await fetchApi('/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: jsonBody,
    });
    console.log('✅ createQrDrop success:', result);
    return result;
  } catch (error) {
    console.error('❌ createQrDrop error:', error);
    throw error;
  }
}

export async function getQrDrop(id: string, accessToken?: string): Promise<{ qrDrop: QrDropData }> {
  const query = accessToken ? `?access=${accessToken}` : '';
  return fetchApi(`/qr/${id}${query}`);
}

export async function generateAccessToken(id: string): Promise<{ accessToken: string; url: string }> {
  return fetchApi(`/qr/${id}/access-token`, {
    method: 'POST',
  });
}

export async function verifyPassword(id: string, password: string): Promise<{ valid: boolean }> {
  return fetchApi(`/qr/${id}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
}

export async function incrementScanCount(id: string): Promise<{ success: boolean; scanCount: number }> {
  return fetchApi(`/qr/${id}/scan`, {
    method: 'POST',
  });
}

// Mark QR1 as scanned (for secureMode split-key)
// Server stores that QR1 was scanned WITHOUT seeing k1 (zero-knowledge)
export async function markQr1Scanned(id: string): Promise<{ success: boolean; message: string }> {
  return fetchApi(`/qrdrop/${id}/qr1-scanned`, {
    method: 'POST',
  });
}

// Verify QR1 was scanned before allowing QR2 unlock (for secureMode split-key)
// Returns unlock token if QR1 was scanned, which client uses to verify before combining k1+k2
export async function verifyQr1ForQr2(id: string): Promise<{ 
  success: boolean; 
  qr1Scanned: boolean; 
  unlockToken?: string;
  expired?: boolean;
  message: string;
}> {
  return fetchApi(`/qrdrop/${id}/verify-qr1-for-qr2`, {
    method: 'POST',
  });
}

export async function getFileUrl(id: string): Promise<{ 
  fileUrl?: string; // Backwards compatibility - first file
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  files?: Array<{fileUrl: string; fileName: string; fileType: string; fileSize: number; fileIndex: number}>;
  fileCount?: number;
}> {
  return fetchApi(`/qr/${id}/file`);
}

export async function incrementDownloadCount(id: string): Promise<{ success: boolean; downloadCount: number }> {
  return fetchApi(`/qr/${id}/download`, {
    method: 'POST',
  });
}

export async function getAllQrDrops(): Promise<{ qrDrops: QrDropData[] }> {
  return fetchApi('/qrdrops');
}

export async function deleteQrDrop(id: string): Promise<{ success: boolean }> {
  return fetchApi(`/qr/${id}`, {
    method: 'DELETE',
  });
}

export async function cleanupExpired(): Promise<{ success: boolean; deletedCount: number }> {
  return fetchApi('/cleanup', {
    method: 'POST',
  });
}

export async function createCheckoutSession(): Promise<{ url: string }> {
  return fetchApi('/checkout', {
    method: 'POST',
  }, true); // requireAuth: true
}

export async function deductCoins(amount: number): Promise<{ success: boolean; coins: number }> {
  return fetchApi('/deduct-coins', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount }),
  }, true); // Require authentication
}