import { projectId, publicAnonKey } from './supabase/info';
import { supabase } from './supabase-client';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-c3c9181e`;

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

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  // Try to get the current session
  const { data: { session } } = await supabase.auth.getSession();
  const authToken = session?.access_token || publicAnonKey;
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    const errorMessage = error.error || `API error: ${response.status}`;
    const errorWithStatus = new Error(errorMessage);
    (errorWithStatus as any).status = response.status;
    throw errorWithStatus;
  }

  return response.json();
}

export async function uploadFile(file: File, metadata: QrDropMetadata) {
  const formData = new FormData();
  formData.append('file', file);
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
  return fetchApi('/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });
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

export async function getFileUrl(id: string): Promise<{ fileUrl: string; fileName: string; fileType: string; fileSize: number }> {
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
  });
}

export async function deductCoins(amount: number): Promise<{ success: boolean; coins: number }> {
  return fetchApi('/deduct-coins', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount }),
  });
}