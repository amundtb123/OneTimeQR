// Creates a QR drop: encrypts the content, sends it to the server and renders the QR codes.
// Every drop is sealed: the key is made here and never sent. One key (Single QR Mode) travels
// in the link's fragment or as a code sent separately; a split key (Secure Mode) is shared
// between two QR codes.
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
  keys: KeyDelivery;
}

// How the key reaches the recipient:
// link     one key, in the link and its QR code
// separate one key, as a code sent apart from the link; the link only leads to the lock
// twoQr    split key over two QR codes
export type KeyDelivery = 'link' | 'separate' | 'twoQr';

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

const MB = 1024 * 1024;
const GB = 1024 * MB;
export const FREE_SIZE_LIMIT = 1 * MB;
export const MAX_SIZE_LOGGED_IN = 20 * MB;

export const EXPIRY_MINUTES: Record<string, number> = {
  '10m': 10,
  '30m': 30,
  '1h': 60,
  '24h': 24 * 60,
  '7d': 7 * 24 * 60,
};

// The balance counts kroner. Must match SALDO_PACKAGES on the server.
export const SALDO_PACKAGES = [
  { id: 'saldo50', kr: 50 },
  { id: 'saldo100', kr: 100 },
] as const;

// Each choice beyond the free key adds PRICE_KR; a key costs at most MAX_PRICE_KR. Free keys may
// be downloaded FREE_TRAFFIC in all, and any key with files MAX_TRAFFIC_GB (file size × opens):
// the bigger the files, the fewer opens.
export const PRICE_KR = { longer: 1, week: 2, password: 1, file: 2, twoKeys: 2, scheduled: 2 };
export const MAX_PRICE_KR = 5;
// Launch period: everything costs 0 kr, but what would cost money still needs an account.
// Must match the server's FREE_LAUNCH secret (free unless it is "false").
export const FREE_LAUNCH = true;
export const MAX_TRAFFIC_GB = 3;
const FREE_TRAFFIC = 100 * MB;

// Every open downloads the files again, so a key with files must have a number of opens
export const MAX_OPENS_WITH_FILES = 1000;

// Same rule as the server: the most opens a key with files of this size may have
export function maxOpensFor(totalFileSize: number): number {
  return Math.max(1, Math.min(MAX_OPENS_WITH_FILES, Math.floor(MAX_TRAFFIC_GB * GB / Math.max(1, totalFileSize))));
}

// What a choice of expiry adds to the price
export function expiryPriceKr(expiryType: string): number {
  const minutes = EXPIRY_MINUTES[expiryType] ?? 10;
  if (minutes >= EXPIRY_MINUTES['7d']) return PRICE_KR.week;
  return minutes > 10 ? PRICE_KR.longer : 0;
}

// Same rule as the server: the free key is 1 MB, 10 minutes and the link or link + QR key;
// each choice beyond it adds to the price, up to MAX_PRICE_KR
export function calculatePriceKr(opts: { totalFileSize: number; opens: number; expiryType: string; password: boolean; scheduled: boolean; twoKeys: boolean }): number {
  const traffic = opts.totalFileSize * opts.opens;
  let kr = expiryPriceKr(opts.expiryType);
  if (opts.password) kr += PRICE_KR.password;
  if (opts.totalFileSize > FREE_SIZE_LIMIT || traffic > FREE_TRAFFIC) kr += PRICE_KR.file;
  if (opts.twoKeys) kr += PRICE_KR.twoKeys;
  if (opts.scheduled) kr += PRICE_KR.scheduled;
  return Math.min(kr, MAX_PRICE_KR);
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const toHex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

async function renderQr(url: string, style: QrStyle): Promise<string> {
  return createBrandedQrCode(await generateStyledQrCode(url, style));
}

export async function createDrop(req: DropRequest, fallbackName: string): Promise<{ qrDrop: QrDrop; coinsCharged: number }> {
  const secureMode = req.keys === 'twoQr';
  const singleQrMode = !secureMode;
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
  let key1Url: string | undefined;
  let key2Url: string | undefined;
  let keyCode: string | undefined;
  let keyCodeQr: string | undefined;
  const qrCodeUrlShare = await renderQr(shareUrl, req.qrStyle); // Leads to the lock only
  if (splitKeys) {
    key1Url = createQr1Url(window.location.origin, response.id, splitKeys.k1);
    key2Url = createQr2Url(window.location.origin, response.id, splitKeys.k2);
    qrCodeUrl = await renderQr(key1Url, req.qrStyle);
    qrCodeUrl2 = await renderQr(key2Url, unlockQrStyle);
  } else if (req.keys === 'separate') {
    // Just the key, without the drop's id: worthless without the link. Its QR code holds the bare code.
    keyCode = singleKey;
    keyCodeQr = await renderQr(singleKey!, req.qrStyle);
    qrCodeUrl = qrCodeUrlShare;
  } else {
    keyUrl = createQr1Url(window.location.origin, response.id, singleKey!);
    qrCodeUrl = await renderQr(keyUrl, req.qrStyle);
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
    key1Url,
    key2Url,
    keyCode,
    keyCodeQr,
    keyDelivery: req.keys,
  };

  return { qrDrop, coinsCharged: response.coinsCharged ?? 0 };
}
