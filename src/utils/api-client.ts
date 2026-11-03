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
    // SECURITY: Don't log token usage
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
      // SECURITY: Don't log token retrieval
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
        // SECURITY: Don't log token retrieval
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
  activatesAt?: string; // ISO date: opens then (at most 3 months ahead); omitted = right away
  maxScans?: number;
  maxDownloads?: number;
  viewOnly: boolean;
  noPreview?: boolean;
  password?: string;
  qrStyle?: any; // Store QR code styling preferences
  qrCodeDataUrl?: string; // Store the generated QR code image
  secureMode?: boolean; // Secure Mode flag (dual QR)
  singleQrMode?: boolean; // Single QR Mode flag (single QR with K1)
  encrypted?: boolean; // Encryption flag
  encryptionKey?: string; // Encryption key (not for secureMode/singleQrMode)
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
  activatesAt?: number | null; // Scheduled release: only the owner can open it before this
  maxScans: number | null;
  maxDownloads: number | null;
  scanCount: number;
  downloadCount: number;
  viewOnly: boolean;
  password: boolean | null; // true if password protected (the hash never leaves the server)
  qrStyle?: any; // QR code styling preferences
  secureMode?: boolean; // Secure Mode flag (dual QR)
  singleQrMode?: boolean; // Single QR Mode flag (single QR with K1)
  createdAt: number;
  expiredAt?: number; // Timestamp when marked as expired
  contentId?: string; // The id the content is encrypted with: the series' for a series code
  seriesNumber?: number | null;
}

// A series as its owner's list shows it: rules and status, no content or key
export interface SeriesData {
  id: string;
  title: string | null;
  codeCount: number;
  opened: number;
  maxScans: number;
  lifetimeMs: number;
  viewOnly: boolean;
  fileCount: number;
  qrStyle?: any;
  expiresAt: number;
  createdAt: number;
}

async function fetchApi(endpoint: string, options: RequestInit = {}, requireAuth: boolean = false) {
  // SECURITY: Minimal logging - no tokens or sensitive data
  if (process.env.NODE_ENV === 'development') {
    console.log('🌐 fetchApi:', endpoint, options.method || 'GET');
  }
  
  try {
    const authToken = await getAuthToken();
    
    // If auth is required but we got anon key, that's a problem
    if (requireAuth && authToken === publicAnonKey) {
      console.error('❌ Authentication required but no valid session token available');
      throw new Error('Authentication required');
    }
    
    const url = `${API_BASE}${endpoint}`;
    
    const fetchPromise = fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        ...options.headers,
      },
    });
    
    const response = await fetchPromise;

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
      (errorWithStatus as any).code = error.code;
      throw errorWithStatus;
    }

    const json = await response.json();
    // SECURITY: Don't log full response - may contain sensitive data
    return json;
  } catch (error: any) {
    // SECURITY: Only log error message, not full error object
    console.error('❌ fetchApi error:', error?.message || 'Unknown error');
    throw error;
  }
}

// Secret owner tokens for QR drops created in this browser tab. Sent to /open so the
// creator's own preview doesn't use up a view (works for anonymous creators too).
const OWNER_TOKEN_PREFIX = 'owner_token_';

function rememberOwnerToken(result: { id?: string; ownerToken?: string }) {
  if (!result?.id || !result.ownerToken) return;
  try {
    sessionStorage.setItem(OWNER_TOKEN_PREFIX + result.id, result.ownerToken);
  } catch {
    // Storage unavailable (private mode) - preview will then count as a view
  }
}

function ownerTokenHeaders(id: string): Record<string, string> {
  try {
    const token = sessionStorage.getItem(OWNER_TOKEN_PREFIX + id);
    return token ? { 'X-Owner-Token': token } : {};
  } catch {
    return {};
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

  const result = await fetchApi('/upload', {
    method: 'POST',
    body: formData,
    headers: {
      // Don't set Content-Type - browser will set it with boundary for FormData
    },
  });
  rememberOwnerToken(result);
  return result;
}

export async function createQrDrop(metadata: QrDropMetadata) {
  // SECURITY: Don't log metadata - may contain sensitive data
  try {
    // For secureMode: Send ciphertext as separate fields in same request body
    // This keeps metadata small while allowing large ciphertext
    const requestBody = {
      ...metadata,
      // Ciphertext is already in metadata if secureMode, or undefined
    };
    
    const jsonBody = JSON.stringify(requestBody);
    const result = await fetchApi('/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: jsonBody,
    });
    rememberOwnerToken(result);
    return result;
  } catch (error) {
    console.error('❌ createQrDrop error:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

// Metadata only (no content); doesn't use up a view
export async function getQrDrop(id: string): Promise<{ qrDrop: QrDropData }> {
  return fetchApi(`/qr/${id}`);
}

// View tokens from /open, per QR drop. Required by /download.
const viewTokens = new Map<string, string>();

function viewTokenHeaders(id: string): Record<string, string> {
  const token = viewTokens.get(id);
  return token ? { 'X-View-Token': token } : {};
}

// Open a QR drop: the server verifies the password (if any), counts the view
// and returns the content. Each successful call uses up one view, unless the owner
// asks for a preview (the first few previews are free).
export async function openQrDrop(id: string, password?: string, preview = false): Promise<{
  qrDrop: QrDropData & { encryptionKey?: string | null };
  files: Array<{fileUrl: string; fileName: string; fileType: string; fileSize: number; fileIndex: number}> | null;
  fileUrl: string | null;
  viewToken: string;
}> {
  const result = await fetchApi(`/qr/${id}/open`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(preview ? { ...ownerTokenHeaders(id), 'X-Owner-Preview': '1' } : {}),
    },
    body: JSON.stringify(password ? { password } : {}),
  });
  viewTokens.set(id, result.viewToken);
  return result;
}

export async function incrementDownloadCount(id: string): Promise<{ success: boolean; downloadCount: number }> {
  return fetchApi(`/qr/${id}/download`, {
    method: 'POST',
    headers: viewTokenHeaders(id),
  });
}

// Moves a scheduled drop's release date, or opens it right away with null (owner only)
export async function setActivationDate(id: string, activatesAt: Date | null): Promise<{ success: boolean; qrDrop: QrDropData }> {
  return fetchApi(`/qr/${id}/activation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activatesAt: activatesAt ? activatesAt.toISOString() : null }),
  }, true);
}

export async function getAllQrDrops(): Promise<{ qrDrops: QrDropData[]; total?: number; nextOffset?: number | null }> {
  return fetchApi('/qrdrops');
}

export async function deleteQrDrop(id: string): Promise<{ success: boolean }> {
  return fetchApi(`/qr/${id}`, {
    method: 'DELETE',
  });
}

// Files go as file, file1, ...; Content-Type is left to the browser (it adds the boundary)
export async function createSeries(files: File[], metadata: Record<string, unknown>): Promise<{
  series: SeriesData;
  codes: Array<{ id: string; number: number }>;
  coinsCharged: number;
}> {
  const formData = new FormData();
  files.forEach((file, index) => formData.append(index === 0 ? 'file' : `file${index}`, file));
  formData.append('metadata', JSON.stringify(metadata));
  return fetchApi('/series', { method: 'POST', body: formData }, true);
}

export async function getAllSeries(): Promise<{ series: SeriesData[] }> {
  return fetchApi('/series');
}

export async function deleteSeries(id: string): Promise<{ success: boolean }> {
  return fetchApi(`/series/${id}`, { method: 'DELETE' }, true);
}

export async function createCheckoutSession(pkg: string): Promise<{ url: string }> {
  return fetchApi('/checkout', {
    method: 'POST',
    body: JSON.stringify({ package: pkg }),
  }, true); // requireAuth: true
}