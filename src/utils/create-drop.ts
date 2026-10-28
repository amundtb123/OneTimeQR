// Creates a QR drop: encrypts the content, sends it to the server and renders the QR codes.
// Every drop is sealed: the key is made here and never sent. One key travels in the link's
// fragment (Single QR Mode); two keys are split between two QR codes (Secure Mode).
import type { QrDrop } from '../App';
import type { QrStyle } from '../components/qr-style-picker';
import { uploadFile, createQrDrop } from './api-client';
import { generateStyledQrCode } from './qr-generator';
import { createBrandedQrCode } from './qr-with-branding';
import {
  encryptFile,
  splitKey,
  encryptTextWithSplitKey,
  createQr1Url,
  createQr2Url,
} from './encryption';

export interface DropRequest {
  title: string;
  files: File[];
  textContent: string;
  urls: string[];
  expiryType: string;
  activatesAt: Date | null;
  maxScans?: number;
  maxDownloads?: number;
  viewOnly: boolean;
  noPreview: boolean;
  password?: string;
  qrStyle: QrStyle;
  twoKeys: boolean; // QR 1 and QR 2 must both be scanned; otherwise one key in the link
  keyInQrOnly?: boolean; // One key, only in the QR code: the shared link leads to the lock
}

// QR 2 is always black on white with square corners so every scanner reads it
export const unlockQrStyle: QrStyle = {
  dotsColor: '#000000',
  backgroundColor: '#FFFFFF',
  gradientType: 'none',
  dotsType: 'square',
  cornersSquareType: 'square',
  cornersDotType: 'square',
  logoSize: 0.2,
  logoMargin: 4,
};

export const FREE_SIZE_LIMIT = 1 * 1024 * 1024;
export const MAX_SIZE_LOGGED_IN = 20 * 1024 * 1024;

export const EXPIRY_MINUTES: Record<string, number> = {
  '10m': 10,
  '30m': 30,
  '1h': 60,
  '24h': 24 * 60,
  '7d': 7 * 24 * 60,
};

// Same rules as the server: password +1, scheduled release +1, +1 per 2 MB over 1 MB,
// +1 per started 24 hours beyond the free 10 minutes
export function calculateCoinCost(opts: { totalFileSize: number; expiryType: string; password: boolean; scheduled: boolean }): number {
  let cost = 0;
  if (opts.password) cost += 1;
  if (opts.scheduled) cost += 1;
  if (opts.totalFileSize > FREE_SIZE_LIMIT) {
    cost += Math.ceil((opts.totalFileSize - FREE_SIZE_LIMIT) / (2 * 1024 * 1024));
  }
  const minutes = EXPIRY_MINUTES[opts.expiryType] ?? 10;
  if (minutes > 10) cost += Math.ceil((minutes - 10) / 60 / 24);
  return cost;
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const toHex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

async function renderQr(url: string, style: QrStyle): Promise<string> {
  return createBrandedQrCode(await generateStyledQrCode(url, style));
}

export async function createDrop(req: DropRequest, fallbackName: string): Promise<{ qrDrop: QrDrop; coinsCharged: number }> {
  const secureMode = req.twoKeys;
  const singleQrMode = !req.twoKeys;
  const keyInQrOnly = singleQrMode && !!req.keyInQrOnly;
  const text = req.textContent.trim();
  const title = req.title.trim();
  const expiryMinutes = EXPIRY_MINUTES[req.expiryType] ?? 10;
  const expiryDate = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Content is encrypted with the drop's id, so the id is made here and the server uses it
  const clientId = crypto.randomUUID();

  let master: Uint8Array;
  let splitKeys: { k1: string; k2: string; master: Uint8Array } | undefined;
  let singleKey: string | undefined;
  if (secureMode) {
    splitKeys = await splitKey();
    master = splitKeys.master;
  } else {
    master = crypto.getRandomValues(new Uint8Array(32));
    singleKey = toBase64Url(master);
  }

  const textContentCiphertext = text ? JSON.stringify(await encryptTextWithSplitKey(text, master, clientId)) : undefined;
  const urlContentCiphertext = req.urls.length > 0
    ? JSON.stringify(await encryptTextWithSplitKey(JSON.stringify(req.urls), master, clientId))
    : undefined;

  // Files go up as application/octet-stream, so the original types travel in the metadata
  const originalFileTypes: Record<string, string> = {};
  req.files.forEach((file, index) => {
    originalFileTypes[index === 0 ? 'file' : `file${index}`] = file.type;
  });

  // No plain text and no key: the server only ever gets ciphertext
  const metadata = {
    title: title || undefined,
    contentType: 'bundle' as const,
    expiryType: req.expiryType,
    expiryDate: expiryDate.toISOString(),
    activatesAt: req.activatesAt ? req.activatesAt.toISOString() : undefined, // Server checks it is within 3 months
    maxScans: req.maxScans,
    maxDownloads: req.maxDownloads,
    viewOnly: req.viewOnly,
    noPreview: req.noPreview,
    password: req.password || undefined,
    qrStyle: req.qrStyle,
    secureMode,
    singleQrMode,
    encrypted: true,
    originalFileTypes,
    textContentCiphertext,
    urlContentCiphertext,
    clientId,
  };

  let response;
  if (req.files.length > 0) {
    const fileKeyHex = toHex(master);
    const encryptedFiles = await Promise.all(
      req.files.map(async (file) => new File([await encryptFile(file, fileKeyHex)], file.name, { type: 'application/octet-stream' })),
    );
    response = await uploadFile(encryptedFiles, metadata);
  } else {
    response = await createQrDrop(metadata);
  }

  if (response.id !== clientId) {
    // Decryption uses the id, so content made this way can't be opened
    console.error('❌ Server did not use the client-generated id; decryption will fail');
  }

  const shareUrl = `${window.location.origin}/scan/${response.id}`;
  let qrCodeUrl: string;
  let qrCodeUrl2: string | undefined;
  let keyUrl: string | undefined;
  const qrCodeUrlShare = await renderQr(shareUrl, req.qrStyle); // Leads to the lock only
  if (splitKeys) {
    qrCodeUrl = await renderQr(createQr1Url(window.location.origin, response.id, splitKeys.k1), req.qrStyle);
    qrCodeUrl2 = await renderQr(createQr2Url(window.location.origin, response.id, splitKeys.k2), unlockQrStyle);
  } else {
    const singleKeyUrl = createQr1Url(window.location.origin, response.id, singleKey!);
    qrCodeUrl = await renderQr(singleKeyUrl, req.qrStyle);
    if (!keyInQrOnly) keyUrl = singleKeyUrl; // Otherwise the key leaves this page only as the QR image
  }

  const totalSize =
    req.files.reduce((sum, file) => sum + file.size, 0) + text.length + req.urls.reduce((sum, url) => sum + url.length, 0);

  const qrDrop: QrDrop = {
    id: response.id,
    title: title || undefined,
    contentType: 'bundle',
    fileName: title || fallbackName,
    fileType: 'bundle',
    fileSize: totalSize,
    expiryType: req.expiryType,
    // The server's times: with a release date the lifetime starts then
    expiryDate: response.qrDrop?.expiresAt ? new Date(response.qrDrop.expiresAt) : expiryDate,
    activatesAt: response.qrDrop?.activatesAt ? new Date(response.qrDrop.activatesAt) : undefined,
    maxScans: req.maxScans,
    maxDownloads: req.maxDownloads,
    scanCount: 0,
    downloadCount: 0,
    viewOnly: req.viewOnly,
    password: req.password || undefined,
    createdAt: new Date(),
    qrCodeUrl,
    secureMode,
    singleQrMode,
    qrCodeUrl2,
    qrCodeUrlShare,
    keyUrl,
    keyInQrOnly: keyInQrOnly || undefined,
  };

  return { qrDrop, coinsCharged: response.coinsCharged ?? 0 };
}
