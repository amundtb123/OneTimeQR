// Decryption keys for Secure Mode and Single QR Mode.
//
// Secure Mode splits the key over two QR codes (QR #1: /scan/{id}#k1=…, QR #2: /unlock/{id}#k2=…,
// key = k1 XOR k2). Single QR Mode puts the whole key in #k1. Keys only ever travel in URL
// fragments, which browsers never send to the server.
//
// A key part is kept in localStorage for a few minutes, so the other QR code can be scanned with
// the phone's camera app (which opens a new tab). Parts are matched by QR drop ID only, and are
// removed as soon as the drop has been opened.

import { combineKeys, fromB64u } from './encryption';

export interface KeyParts {
  k1?: string;
  k2?: string;
}

const STORAGE_PREFIX = 'qr_key_parts_';
const KEY_PART_TTL_MS = 5 * 60 * 1000;
const KEY_PART_REGEX = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url without padding
const ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Storage keys used by earlier versions of the scan flow
const LEGACY_PREFIXES = ['k1_', 'qr1_timestamp_', 'k2_temp_', 'k2_timestamp_', 'qr1_scanned_', 'qr1_api_called_', 'master_'];

// A key sent apart from the link: 32 bytes as base64url
export const isKeyCode = (text: string) => KEY_PART_REGEX.test(text);

export function keyPartsFromHash(hash: string): KeyParts {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const parts: KeyParts = {};
  const k1 = params.get('k1');
  const k2 = params.get('k2');
  if (k1 && KEY_PART_REGEX.test(k1)) parts.k1 = k1;
  if (k2 && KEY_PART_REGEX.test(k2)) parts.k2 = k2;
  return parts;
}

// Reads a scanned QR code: returns the QR drop ID and any key part, or null if it isn't ours
export function parseKeyUrl(text: string): { id: string; parts: KeyParts } | null {
  // Some scanner apps turn '#' into '@'
  const fixed = text.trim().replace(/@(k[12]=)/g, '#$1');
  let url: URL;
  try {
    url = new URL(fixed, window.location.origin);
  } catch {
    return null;
  }
  const match = url.pathname.match(/^\/(?:scan|unlock)\/([^/]+)\/?$/);
  if (!match || !ID_REGEX.test(match[1])) return null;
  return { id: match[1].toLowerCase(), parts: keyPartsFromHash(url.hash) };
}

function storageKey(id: string) {
  return STORAGE_PREFIX + id.toLowerCase();
}

export function loadKeyParts(id: string): KeyParts {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return {};
    const { k1, k2, savedAt } = JSON.parse(raw);
    if (typeof savedAt !== 'number' || Date.now() - savedAt > KEY_PART_TTL_MS) {
      localStorage.removeItem(storageKey(id));
      return {};
    }
    const parts: KeyParts = {};
    if (typeof k1 === 'string' && KEY_PART_REGEX.test(k1)) parts.k1 = k1;
    if (typeof k2 === 'string' && KEY_PART_REGEX.test(k2)) parts.k2 = k2;
    return parts;
  } catch {
    return {};
  }
}

// Merges new parts with the ones already kept for this drop and returns the result
export function rememberKeyParts(id: string, parts: KeyParts): KeyParts {
  const merged = { ...loadKeyParts(id), ...parts };
  if (!merged.k1 && !merged.k2) return merged;
  try {
    localStorage.setItem(storageKey(id), JSON.stringify({ ...merged, savedAt: Date.now() }));
  } catch {
    // Storage unavailable (private mode): the parts still work within this tab
  }
  return merged;
}

export function forgetKeyParts(id: string) {
  try {
    localStorage.removeItem(storageKey(id));
  } catch {
    // Nothing stored
  }
}

// Removes expired parts and anything left behind by earlier versions
export function purgeStaleKeyParts() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      for (const key of Object.keys(storage)) {
        if (LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          storage.removeItem(key);
        } else if (storage === localStorage && key.startsWith(STORAGE_PREFIX)) {
          loadKeyParts(key.slice(STORAGE_PREFIX.length)); // Removes it if expired
        }
      }
    } catch {
      // Storage unavailable
    }
  }
}

// The decryption key as 64 hex characters, or null while parts are missing
export function masterKeyHex(mode: { secureMode?: boolean; singleQrMode?: boolean }, parts: KeyParts): string | null {
  let master: Uint8Array | null = null;
  if (mode.singleQrMode && parts.k1) {
    master = fromB64u(parts.k1);
  } else if (mode.secureMode && parts.k1 && parts.k2) {
    master = combineKeys(parts.k1, parts.k2);
  }
  if (!master || master.length !== 32) return null;
  return Array.from(master, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
}
