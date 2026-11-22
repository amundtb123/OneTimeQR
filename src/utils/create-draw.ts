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
export const DRAW_GRID_MAX = 60; // Same as the server: a grid shows every ticket on one screen
export const DRAW_MAX_PER_PERSON = 100;
export const DRAW_PER_PERSON_CHOICES = [1, 2, 3, 5];
// The waits a draw can set between one phone's tickets (same as DRAW_COOLDOWNS_MS on the server)
export type DrawCooldown = '1m' | '5m' | '15m' | '1h' | '24h';
export const DRAW_COOLDOWNS: DrawCooldown[] = ['1m', '5m', '15m', '1h', '24h'];
// Rounds (same as the server): each a fresh set of tickets, paid for upfront. The next starts when
// every ticket is taken, or at its time when an interval is set.
export type DrawRoundInterval = '15m' | '30m' | '1h' | '3h' | '1d' | '1w';
export const DRAW_ROUND_INTERVALS: DrawRoundInterval[] = ['15m', '30m', '1h', '3h', '1d', '1w'];
export const DRAW_ROUND_INTERVAL_MS: Record<DrawRoundInterval, number> = { '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000, '3h': 10_800_000, '1d': 86_400_000, '1w': 604_800_000 };
export const DRAW_ROUND_CHOICES = [1, 2, 3, 5, 10];
// How long a draw works (same as SERIES_ENDS_MS on the server), to check its rounds fit
export const SERIES_ENDS_MS_CLIENT: Record<SeriesEnd, number> = { '1mo': 30 * 86_400_000, '6mo': 183 * 86_400_000, '1y': 365 * 86_400_000, '2y': 730 * 86_400_000 };
export const DRAW_MAX_ROUNDS = 50;

// How the tickets are handed out: one QR code at a time on the screen, all of them in a grid on
// the screen, or printed (the screen then only counts)
export type DrawHandout = 'one' | 'grid' | 'print';
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
  handout: DrawHandout; // 'one' holds the prizes back to the second half
  maxPerPerson: number | null; // At most this many tickets per phone; null = no limit
  cooldown: DrawCooldown | null; // A wait between one phone's tickets; null = none
  rounds: number;
  roundInterval: DrawRoundInterval | null; // null = a round only ends when every ticket is taken
  firstRoundAt: number | null; // When round 1 starts; null = now
}

const fileBytes = (files: File[]) => files.reduce((sum, file) => sum + file.size, 0);

// Every code is opened once: most download the draw's own files, the winners their prize's
function drawTraffic(codeCount: number, noPrizeFiles: File[], prizes: DrawPrize[]): number {
  const prizeCodes = prizes.reduce((sum, p) => sum + p.count, 0);
  return fileBytes(noPrizeFiles) * Math.max(0, codeCount - prizeCodes) + prizes.reduce((sum, p) => sum + fileBytes(p.files) * p.count, 0);
}

// 10 kr per started 100 tickets (every round's), plus the downloads the files can cause
export function drawPriceKr(codeCount: number, noPrizeFiles: File[], prizes: DrawPrize[], rounds = 1): number {
  const traffic = drawTraffic(codeCount, noPrizeFiles, prizes) * rounds;
  return Math.ceil(Math.max(1, codeCount * rounds) / 100) * SERIES_KR_PER_100 + (traffic > 0 ? Math.ceil(traffic / (1024 * 1024 * 1024) * KR_PER_GB) : 0);
}

export const drawTooMuchTraffic = (codeCount: number, noPrizeFiles: File[], prizes: DrawPrize[], rounds = 1) =>
  drawTraffic(codeCount, noPrizeFiles, prizes) * rounds > MAX_TRAFFIC;

export interface CreatedDraw extends CreatedSeries {
  displayToken: string; // The secret a screen shows the board with; only shown now
  key: string; // The tickets' key: a screen handing out tickets needs it to draw their QR codes
  handout: DrawHandout;
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
    holdPrizes: req.handout === 'one',
    maxPerPerson: req.maxPerPerson ?? undefined,
    cooldown: req.cooldown ?? undefined,
    rounds: req.rounds,
    roundInterval: req.rounds > 1 ? req.roundInterval ?? undefined : undefined,
    firstRoundAt: req.firstRoundAt ?? undefined,
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
  rememberDrawScreen(response.series.id, key, req.handout);
  const codes = response.codes.map((code) => ({ number: code.number, round: code.round, url: createQr1Url(window.location.origin, code.id, key) }));
  return {
    created: { series: response.series, codes, style: req.qrStyle, displayToken: response.displayToken, key, handout: req.handout },
    coinsCharged: response.coinsCharged ?? 0,
  };
}

// The link a screen shows the board with. The secrets are in the fragment, so they never reach a
// server log. With the tickets' key the screen hands out the tickets itself, one QR code at a time.
export function boardUrl(drawId: string, displayToken?: string, key?: string, handout?: DrawHandout): string {
  const fragment = new URLSearchParams();
  if (displayToken) fragment.set('t', displayToken);
  if (key) fragment.set('k', key);
  if (key && handout === 'grid') fragment.set('v', 'grid');
  const hash = fragment.toString();
  return `${window.location.origin}/tavle/${drawId}${hash ? `#${hash}` : ''}`;
}

// A ticket's link, as printed in its QR code
export const ticketUrl = (codeId: string, key: string) => createQr1Url(window.location.origin, codeId, key);

// The creator's own device remembers how a draw's screen hands out tickets, with their key, so the
// board can be opened from the key ring later. Nothing of it leaves this browser.
const screenKey = (drawId: string) => `onetimeqr-draw-screen:${drawId}`;

export function rememberDrawScreen(drawId: string, key: string, handout: DrawHandout) {
  if (handout === 'print') return;
  try {
    localStorage.setItem(screenKey(drawId), JSON.stringify({ key, handout }));
  } catch {
    // Private mode or storage off: the link on the ready page still works
  }
}

export function drawScreenOnThisDevice(drawId: string): { key: string; handout: DrawHandout } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(screenKey(drawId)) || 'null');
    return saved && typeof saved.key === 'string' ? saved : null;
  } catch {
    return null;
  }
}

// This phone's anonymous id in draws with a limit per person: random, made here, and only sent
// when opening a draw's ticket. The server stores it hashed with the draw. A private tab or
// another browser gets a new one, so the limit stops most people, not the determined.
export function participantId(): string {
  const storageKey = 'onetimeqr-participant';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const made = crypto.randomUUID();
    localStorage.setItem(storageKey, made);
    return made;
  } catch {
    return (participantFallback ??= crypto.randomUUID());
  }
}
let participantFallback: string | undefined;
