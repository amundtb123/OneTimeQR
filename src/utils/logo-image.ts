// Prepares a logo for the QR code: at most MAX_SIDE pixels as a PNG, which keeps its
// transparency. A logo on a white background (a JPEG, say) can have the white made
// see-through, so the QR code's own background shows around it instead of a white box.
const MAX_SIDE = 256;
// Pixels at least this light become fully see-through; the band below fades, so edges stay smooth
const WHITE_FROM = 240;
const FADE_FROM = 200;

export async function prepareLogo(file: File, removeWhite: boolean): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (removeWhite) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = pixels.data;
      for (let i = 0; i < d.length; i += 4) {
        const light = Math.min(d[i], d[i + 1], d[i + 2]);
        if (light >= WHITE_FROM) d[i + 3] = 0;
        else if (light > FADE_FROM) d[i + 3] = Math.round(d[i + 3] * (WHITE_FROM - light) / (WHITE_FROM - FADE_FROM));
      }
      ctx.putImageData(pixels, 0, 0);
    }
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
