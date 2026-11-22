// Creates a draw: a series where a few random codes hold a prize. Like a series, every code
// carries one key in its link and the server only ever gets ciphertext. The server decides which
// codes win, so nobody, the person making the draw included, can pick them.
import type { QrStyle } from '../components/qr-style-picker';
import { createDraw as postDraw } from './api-client';
import { encryptFile, encryptTextWithSplitKey, createQr1Url } from './encryption';
import { KR_PER_GB } from './create-drop';
import { SERIES_KR_PER_100, type CreatedSeries, type SeriesEnd } from './create-series';

// Same rules as the server (DRAW_* in the Edge Function)
export const DRAW_MIN_CODES = 2;
export const DRAW_MAX_CODES = 5000;
export const DRAW_MAX_PRIZES = 10;
export const DRAW_LABEL_MAX = 40;
export const DRAW_COUNTS = [20, 50, 100, 200, 500];
export const DRAW_ENDS: SeriesEnd[] = ['1mo', '6mo', '1y'];
export const DRAW_ENDS_WITH_FILES: SeriesEnd[] = ['1mo'];
const MAX_TRAFFIC = 50 * 1024 * 1024 * 1024;

export interface DrawPrize {
  label: string; // Shown on the board and to the winner; stored as plain text
  count: number;
  message: string; // What the winner sees, encrypted
  files: File[];
}

export interface DrawRequest {
  title: string;
  codeCount: number;
  noPrizeText: string;
  noPrizeFiles: File[];
  prizes: DrawPrize[];
  end: SeriesEnd;
  qrStyle: QrStyle;
}

const fileBytes = (files: File[]) => files.reduce((sum, file) => sum + file.size, 0);

// Every code is opened once: most download the draw's own files, the winners their prize's
function drawTraffic(codeCount: number, noPrizeFiles: File[], prizes: DrawPrize[]): number {
  const prizeCodes = prizes.reduce((sum, p) => sum + p.count, 0);
  return fileBytes(noPrizeFiles) * Math.max(0, codeCount - prizeCodes) + prizes.reduce((sum, p) => sum + fileBytes(p.files) * p.count, 0);
}

// 10 kr per started 100 codes, plus the downloads the files can cause
export function drawPriceKr(codeCount: number, noPrizeFiles: File[], prizes: DrawPrize[]): number {
  const traffic = drawTraffic(codeCount, noPrizeFiles, prizes);
  return Math.ceil(Math.max(1, codeCount) / 100) * SERIES_KR_PER_100 + (traffic > 0 ? Math.ceil(traffic / (1024 * 1024 * 1024) * KR_PER_GB) : 0);
}

export const drawTooMuchTraffic = (codeCount: number, noPrizeFiles: File[], prizes: DrawPrize[]) =>
  drawTraffic(codeCount, noPrizeFiles, prizes) > MAX_TRAFFIC;

export interface CreatedDraw extends CreatedSeries {
  displayToken: string; // The secret a screen shows the board with; only shown now
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const toHex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

const fileTypes = (files: File[]) => Object.fromEntries(files.map((file, i) => [i === 0 ? 'file' : `file${i}`, file.type]));

export async function createDraw(req: DrawRequest): Promise<{ created: CreatedDraw; coinsCharged: number }> {
  const drawId = crypto.randomUUID();
  const master = crypto.getRandomValues(new Uint8Array(32));
  const key = toBase64Url(master);
  const fileKeyHex = toHex(master);
  const encryptText = async (text: string) => JSON.stringify(await encryptTextWithSplitKey(text, master, drawId));
  const encryptFiles = (files: File[]) =>
    Promise.all(files.map(async (file) => new File([await encryptFile(file, fileKeyHex)], file.name, { type: 'application/octet-stream' })));

  const form = new FormData();
  const noPrizeText = req.noPrizeText.trim();
  const prizes = await Promise.all(req.prizes.map(async (prize) => {
    // A prize with no message shows its name
    const message = prize.message.trim() || prize.label.trim();
    return {
      label: prize.label.trim().slice(0, DRAW_LABEL_MAX) || undefined,
      count: prize.count,
      textContentCiphertext: message ? await encryptText(message) : undefined,
      originalFileTypes: fileTypes(prize.files),
    };
  }));

  form.append('metadata', JSON.stringify({
    kind: 'draw',
    clientId: drawId,
    title: req.title.trim() || undefined,
    codeCount: req.codeCount,
    seriesEnd: req.end,
    viewOnly: false,
    qrStyle: { ...req.qrStyle, logo: undefined },
    originalFileTypes: fileTypes(req.noPrizeFiles),
    textContentCiphertext: noPrizeText ? await encryptText(noPrizeText) : undefined,
    prizes,
  }));
  (await encryptFiles(req.noPrizeFiles)).forEach((file, i) => form.append(i === 0 ? 'file' : `file${i}`, file));
  for (let p = 0; p < req.prizes.length; p++) {
    (await encryptFiles(req.prizes[p].files)).forEach((file, i) => form.append(i === 0 ? `prize${p}_file` : `prize${p}_file${i}`, file));
  }

  const response = await postDraw(form);
  const codes = response.codes.map((code) => ({ number: code.number, url: createQr1Url(window.location.origin, code.id, key) }));
  return {
    created: { series: response.series, codes, style: req.qrStyle, displayToken: response.displayToken },
    coinsCharged: response.coinsCharged ?? 0,
  };
}

// The link a screen shows the board with. The secret is in the fragment, so it never reaches a server log.
export const boardUrl = (drawId: string, displayToken?: string) =>
  `${window.location.origin}/tavle/${drawId}${displayToken ? `#t=${displayToken}` : ''}`;
