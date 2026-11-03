// Makes big pictures smaller in the browser, before they are encrypted, so people without an
// account can share a phone photo. The copy is a JPEG of at most MAX_SIDE pixels on the longest
// side; it also leaves out the photo's metadata (place, camera). Animated and vector images,
// and anything the browser can't draw, are kept as they are.
const SHRINK_OVER_BYTES = 1024 * 1024;
const MAX_SIDE = 2048;
const QUALITY = 0.85;
const SHRINKABLE = /^image\/(jpeg|png|webp|heic|heif)$/;

const shrunkFiles = new WeakSet<File>();

export const wasShrunk = (file: File) => shrunkFiles.has(file);

async function draw(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

async function shrink(file: File): Promise<File> {
  if (file.size <= SHRINK_OVER_BYTES || !SHRINKABLE.test(file.type)) return file;
  try {
    const image = await draw(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // JPEG has no transparency: see-through parts become white, not black
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    image.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const smaller = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
    shrunkFiles.add(smaller);
    return smaller;
  } catch {
    return file;
  }
}

export const shrinkImages = (files: File[]) => Promise.all(files.map(shrink));
