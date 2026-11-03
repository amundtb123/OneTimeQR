// The files a series is printed from: a CSV of links for the printer, a ZIP with one QR image per
// code, and a PDF with label sheets. Everything is made here in the browser, because the links
// hold the key and never reach the server.
import type { QrStyle } from '../components/qr-style-picker';
import type { SeriesCode } from './create-series';
import { generateStyledQrCode } from './qr-generator';
import { createBrandedQrCode } from './qr-with-branding';

export type Progress = (done: number, total: number) => void;

export const codeLabel = (n: number) => String(n).padStart(4, '0');

// Lets the page repaint (and show progress) between codes
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

const dataUrlBytes = (dataUrl: string) => Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));

export function seriesCsv(codes: SeriesCode[]): Blob {
  const rows = ['number,url', ...codes.map((code) => `${codeLabel(code.number)},${code.url}`)];
  return new Blob([rows.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}

// ---------- ZIP (stored, not compressed: PNGs are compressed already) ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Array<{ name: string; data: Uint8Array }>): Blob {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // Version needed
    local.setUint16(8, 0, true); // Stored
    local.setUint32(14, crc, true);
    local.setUint32(18, entry.data.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, entry.data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, entry.data.length, true);
    dir.setUint32(24, entry.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + entry.data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

export async function seriesZip(codes: SeriesCode[], style: QrStyle, onProgress: Progress): Promise<Blob> {
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  for (const code of codes) {
    const png = await createBrandedQrCode(await generateStyledQrCode(code.url, style));
    entries.push({ name: `onetimeqr-${codeLabel(code.number)}.png`, data: dataUrlBytes(png) });
    onProgress(entries.length, codes.length);
    if (entries.length % 10 === 0) await nextFrame();
  }
  return zip(entries);
}

// ---------- PDF: A4 label sheets, 4 × 6 codes per page ----------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28;
const COLS = 4;
const ROWS = 6;
const QR_PT = 100; // About 3.5 cm, easy to scan from a book
const IMAGE_PX = 400;

// PDF text in Helvetica (WinAnsi): Latin-1 covers æøå, plus the typographic marks below;
// anything else becomes '?'
const WIN_ANSI: Record<string, string> = {
  '\u2013': '\x96', '\u2014': '\x97', '\u2018': '\x91', '\u2019': '\x92', '\u201c': '\x93', '\u201d': '\x94', '\u2026': '\x85', '\u20ac': '\x80',
};
function pdfText(text: string): string {
  return Array.from(text, (ch) => WIN_ANSI[ch] ?? (ch.charCodeAt(0) < 256 ? ch : '?')).join('').replace(/[\\()]/g, (c) => `\\${c}`);
}

const latin1 = (text: string) => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// A QR code as zlib-compressed RGB pixels, which PDF reads as it is (FlateDecode). Lossless, so the
// edges stay sharp in print, and small, because a QR code is mostly flat colour. White goes
// behind any transparency.
async function qrPixels(url: string, style: QrStyle): Promise<Uint8Array> {
  const png = await generateStyledQrCode(url, style);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Failed to load QR code image'));
    image.src = png;
  });
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_PX;
  canvas.height = IMAGE_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, IMAGE_PX, IMAGE_PX);
  ctx.drawImage(image, 0, 0, IMAGE_PX, IMAGE_PX);
  const rgba = ctx.getImageData(0, 0, IMAGE_PX, IMAGE_PX).data;
  const rgb = new Uint8Array(IMAGE_PX * IMAGE_PX * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return deflate(rgb);
}

export async function seriesPdf(codes: SeriesCode[], style: QrStyle, title: string, onProgress: Progress): Promise<Blob> {
  const perPage = COLS * ROWS;
  const pageCount = Math.ceil(codes.length / perPage);
  // Objects: 1 catalog, 2 page tree, 3 font, then per page: page, contents, and one image per code
  const objects: Array<Uint8Array[]> = [];
  const add = (...parts: Uint8Array[]) => {
    objects.push(parts);
    return objects.length;
  };
  const ascii = (text: string) => latin1(text);
  add(ascii('<< /Type /Catalog /Pages 2 0 R >>'));
  add(); // Page tree, filled in once the pages are known
  add(ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));

  const cellW = (PAGE_W - 2 * MARGIN) / COLS;
  const cellH = (PAGE_H - 2 * MARGIN) / ROWS;
  const heading = title.trim().slice(0, 24);
  const pageIds: number[] = [];
  let done = 0;
  for (let p = 0; p < pageCount; p++) {
    const pageCodes = codes.slice(p * perPage, (p + 1) * perPage);
    const images: string[] = [];
    let content = '';
    for (let i = 0; i < pageCodes.length; i++) {
      const code = pageCodes[i];
      const pixels = await qrPixels(code.url, style);
      const imageId = add(
        ascii(`<< /Type /XObject /Subtype /Image /Width ${IMAGE_PX} /Height ${IMAGE_PX} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>\nstream\n`),
        pixels,
        ascii('\nendstream'),
      );
      images.push(`/Im${i} ${imageId} 0 R`);
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = MARGIN + col * cellW + (cellW - QR_PT) / 2;
      const y = PAGE_H - MARGIN - (row + 1) * cellH + (cellH - QR_PT) / 2 + 6;
      const label = `${heading ? `${heading} · ` : ''}Nr. ${codeLabel(code.number)}`;
      content += `q ${QR_PT} 0 0 ${QR_PT} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${i} Do Q\n`;
      content += `BT /F1 7 Tf ${(x).toFixed(2)} ${(y - 10).toFixed(2)} Td (${pdfText(label)}) Tj ET\n`;
      done++;
      onProgress(done, codes.length);
      if (done % 10 === 0) await nextFrame();
    }
    const stream = latin1(content);
    const contentId = add(ascii(`<< /Length ${stream.length} >>\nstream\n`), stream, ascii('\nendstream'));
    pageIds.push(add(ascii(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> /XObject << ${images.join(' ')} >> >> /Contents ${contentId} 0 R >>`,
    )));
  }
  objects[1] = [ascii(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)];

  const out: Uint8Array[] = [ascii('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  let offset = out[0].length;
  const offsets: number[] = [];
  objects.forEach((parts, index) => {
    offsets.push(offset);
    const chunk = [ascii(`${index + 1} 0 obj\n`), ...parts, ascii('\nendobj\n')];
    out.push(...chunk);
    offset += chunk.reduce((sum, part) => sum + part.length, 0);
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  out.push(ascii(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
  return new Blob(out, { type: 'application/pdf' });
}
