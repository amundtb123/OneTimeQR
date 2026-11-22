// A picture a winner keeps as proof of their prize: the draw, the ticket number, the prize, when
// it was opened, and the prize's own picture or message. Made here in the browser; nothing of it
// is sent anywhere. A winning ticket can only be opened once, so this is what they show later.

export interface ProofDetails {
  drawTitle: string;
  ticketNumber: number | string;
  prizeLabel: string;
  message?: string; // The prize's message to the winner
  pictureUrl?: string; // A decrypted prize picture (blob: URL)
  openedAt: Date;
  locale: string;
  strings: { heading: string; ticket: string; footer: string };
}

const W = 1080;
const H = 1350;
const BLUE = '#1F3BFF';
const FONT = "'Inter Tight', system-ui, -apple-system, sans-serif";

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Lines of text that fit the width, at most maxLines (the last one ends with … if cut)
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s*\S*$/, '')} …`;
    return kept;
  }
  return lines;
}

export async function makeProof(d: ProofDetails): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const pad = 80;

  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(pad / 2, pad / 2, W - pad, H - pad);

  ctx.fillStyle = BLUE;
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText(`ONETIMEQR · ${d.strings.heading.toUpperCase()}`, pad, pad + 50);

  ctx.fillStyle = '#0B0B0B';
  ctx.font = `800 64px ${FONT}`;
  let y = pad + 140;
  for (const line of wrap(ctx, d.drawTitle, W - pad * 2, 2)) {
    ctx.fillText(line, pad, y);
    y += 72;
  }

  // The prize, big, on blue
  ctx.font = `800 84px ${FONT}`;
  const prizeLines = wrap(ctx, `★ ${d.prizeLabel}`, W - pad * 2 - 60, 2);
  const boxH = prizeLines.length * 96 + 50;
  ctx.fillStyle = BLUE;
  ctx.fillRect(pad, y, W - pad * 2, boxH);
  ctx.fillStyle = '#FFFFFF';
  prizeLines.forEach((line, i) => ctx.fillText(line, pad + 30, y + 100 + i * 96));
  y += boxH + 60;

  ctx.fillStyle = '#0B0B0B';
  ctx.font = `600 44px ${FONT}`;
  ctx.fillText(d.strings.ticket, pad, y);
  y += 56;
  ctx.fillStyle = '#4A4A4A';
  ctx.font = `400 36px ${FONT}`;
  ctx.fillText(d.openedAt.toLocaleString(d.locale, { dateStyle: 'long', timeStyle: 'short' }), pad, y);
  y += 50;

  // The prize's picture, or else its message
  const footerTop = H - pad - 90;
  const picture = d.pictureUrl ? await loadImage(d.pictureUrl) : null;
  if (picture) {
    const room = footerTop - y - 30;
    const scale = Math.min((W - pad * 2) / picture.width, room / picture.height, 1.5);
    const w = picture.width * scale;
    const h = picture.height * scale;
    ctx.drawImage(picture, (W - w) / 2, y + 20 + (room - h) / 2, w, h);
  } else if (d.message) {
    ctx.fillStyle = '#0B0B0B';
    ctx.font = `500 42px ${FONT}`;
    y += 40;
    for (const line of wrap(ctx, d.message, W - pad * 2, 6)) {
      ctx.fillText(line, pad, y);
      y += 56;
    }
  }

  ctx.strokeStyle = '#DCDCD6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, footerTop);
  ctx.lineTo(W - pad, footerTop);
  ctx.stroke();
  ctx.fillStyle = '#5A5A5A';
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(d.strings.footer, pad, footerTop + 55);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the picture'))), 'image/png'));
}

// Saves the picture: the phone's share sheet where there is one (it can save to Photos),
// otherwise an ordinary download. Returns false if the person closed the share sheet.
export async function saveProof(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (error: any) {
      if (error?.name === 'AbortError') return false;
      // Fall through to a download
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
