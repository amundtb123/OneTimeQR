// Creates a series: one key made into many unique codes, e.g. one per printed book.
// The content is encrypted once, with the series' id and one key, and every code carries that
// key in its link. The links exist only here, right after creation: they are what gets printed.
import type { QrStyle } from '../components/qr-style-picker';
import { createSeries as postSeries, type SeriesData } from './api-client';
import { encryptFile, encryptTextWithSplitKey, createQr1Url } from './encryption';
import { KR_PER_GB } from './create-drop';

// Same rules as the server (SERIES_* in the Edge Function)
export type SeriesLifetime = '24h' | '7d' | '30d' | '365d';
export type SeriesEnd = '6mo' | '1y' | '2y';
export const SERIES_LIFETIMES: SeriesLifetime[] = ['24h', '7d', '30d', '365d'];
export const SERIES_ENDS: SeriesEnd[] = ['6mo', '1y', '2y'];
export const SERIES_COUNTS = [10, 50, 100, 500, 1000];
export const SERIES_MIN_CODES = 10;
export const SERIES_MAX_CODES = 5000;
export const SERIES_MAX_OPENS = 50;
export const SERIES_KR_PER_100 = 10;
const SERIES_MAX_TRAFFIC = 50 * 1024 * 1024 * 1024;

const DAY_MS = 24 * 60 * 60 * 1000;
export const SERIES_LIFETIME_MS: Record<SeriesLifetime, number> = { '24h': DAY_MS, '7d': 7 * DAY_MS, '30d': 30 * DAY_MS, '365d': 365 * DAY_MS };

// 10 kr per started 100 codes, plus the downloads the files can cause (no free allowance)
export function seriesPriceKr(codeCount: number, totalFileSize: number, opens: number): number {
  const traffic = totalFileSize * opens * codeCount;
  return Math.ceil(codeCount / 100) * SERIES_KR_PER_100 + (traffic > 0 ? Math.ceil(traffic / (1024 * 1024 * 1024) * KR_PER_GB) : 0);
}

export const seriesTooMuchTraffic = (codeCount: number, totalFileSize: number, opens: number) =>
  totalFileSize * opens * codeCount > SERIES_MAX_TRAFFIC;

export interface SeriesRequest {
  title: string;
  files: File[];
  textContent: string;
  urls: string[];
  codeCount: number;
  maxScans: number;
  lifetime: SeriesLifetime;
  seriesEnd: SeriesEnd;
  viewOnly: boolean;
  password?: string;
  qrStyle: QrStyle;
}

export interface SeriesCode {
  number: number;
  url: string; // Opens the content: the key is in the fragment
}

export interface CreatedSeries {
  series: SeriesData;
  codes: SeriesCode[];
  style: QrStyle; // With the logo, which is drawn here and never stored
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const toHex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

export async function createSeries(req: SeriesRequest): Promise<{ created: CreatedSeries; coinsCharged: number }> {
  const seriesId = crypto.randomUUID();
  const master = crypto.getRandomValues(new Uint8Array(32));
  const key = toBase64Url(master);
  const text = req.textContent.trim();

  const originalFileTypes: Record<string, string> = {};
  req.files.forEach((file, index) => {
    originalFileTypes[index === 0 ? 'file' : `file${index}`] = file.type;
  });
  const fileKeyHex = toHex(master);
  const encryptedFiles = await Promise.all(
    req.files.map(async (file) => new File([await encryptFile(file, fileKeyHex)], file.name, { type: 'application/octet-stream' })),
  );

  // No plain text and no key: the server only ever gets ciphertext
  const response = await postSeries(encryptedFiles, {
    clientId: seriesId,
    title: req.title.trim() || undefined,
    codeCount: req.codeCount,
    maxScans: req.maxScans,
    lifetime: req.lifetime,
    seriesEnd: req.seriesEnd,
    viewOnly: req.viewOnly,
    password: req.password || undefined,
    qrStyle: { ...req.qrStyle, logo: undefined },
    originalFileTypes,
    textContentCiphertext: text ? JSON.stringify(await encryptTextWithSplitKey(text, master, seriesId)) : undefined,
    urlContentCiphertext: req.urls.length > 0
      ? JSON.stringify(await encryptTextWithSplitKey(JSON.stringify(req.urls), master, seriesId))
      : undefined,
  });

  const codes = response.codes.map((code) => ({ number: code.number, url: createQr1Url(window.location.origin, code.id, key) }));
  return { created: { series: response.series, codes, style: req.qrStyle }, coinsCharged: response.coinsCharged ?? 0 };
}
