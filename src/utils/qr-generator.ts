import QRCode from 'qrcode';
import type { QrStyle } from '../components/qr-style-picker';

/**
 * QR Code Module Grid - represents the data structure of a QR code
 * This is the actual encoded data, independent of visual styling
 */
export interface QrCodeData {
  grid: boolean[][]; // grid[row][col] = true if module is dark
  moduleSize: number; // Size of each module in pixels
  modules: number; // Number of modules per side
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
}

/**
 * Generates QR code DATA (the encoded pattern) from a URL/string.
 * This should ONLY be called when the data content changes, NOT when styling changes.
 * 
 * @param url - The data to encode in the QR code
 * @param errorCorrectionLevel - Error correction level (H if logo present, M otherwise)
 * @returns QrCodeData containing the module grid
 */
export async function generateQrCodeData(
  url: string,
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' = 'M'
): Promise<QrCodeData> {
  // Create a temporary canvas to generate the base QR code
  const tempCanvas = document.createElement('canvas');
  const size = 400;
  tempCanvas.width = size;
  tempCanvas.height = size;
  const tempCtx = tempCanvas.getContext('2d');
  
  if (!tempCtx) {
    throw new Error('Could not get canvas context');
  }

  // Generate base QR code with standard black/white colors for data extraction
  // We use black/white to reliably detect modules regardless of future styling
  await QRCode.toCanvas(tempCanvas, url, {
    width: size,
    margin: 2,
    color: {
      dark: '#000000', // Always use black for data generation
      light: '#FFFFFF', // Always use white for data generation
    },
    errorCorrectionLevel,
  });

  // Extract the module grid from the generated QR code
  const imageData = tempCtx.getImageData(0, 0, size, size);
  const data = imageData.data;
  
  // Detect module size
  const moduleSize = detectModuleSize(tempCanvas, data);
  if (moduleSize === 0) {
    throw new Error('Could not detect module size');
  }

  const modules = Math.floor(size / moduleSize);

  // Create grid to track which modules are dark (true = dark module)
  const grid: boolean[][] = [];
  for (let row = 0; row < modules; row++) {
    grid[row] = [];
    for (let col = 0; col < modules; col++) {
      const x = col * moduleSize + Math.floor(moduleSize / 2);
      const y = row * moduleSize + Math.floor(moduleSize / 2);
      const i = (y * size + x) * 4;
      grid[row][col] = data[i] < 128; // true if dark
    }
  }

  return {
    grid,
    moduleSize,
    modules,
    errorCorrectionLevel,
  };
}

/**
 * Renders QR code VISUALLY with styling applied to existing data.
 * This should be called when styling changes, NOT when data changes.
 * 
 * @param qrData - The QR code data (module grid) to render
 * @param style - Visual styling to apply
 * @returns Data URL of the styled QR code image
 */
export async function renderQrCodeVisual(
  qrData: QrCodeData,
  style: QrStyle
): Promise<string> {
  const canvas = document.createElement('canvas');
  const size = 400;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Fill background
  ctx.fillStyle = style.backgroundColor;
  ctx.fillRect(0, 0, size, size);

  // Draw modules with styling
  ctx.fillStyle = style.dotsColor;
  
  const { grid, moduleSize, modules } = qrData;

  // Identify corner positions (top-left, top-right, bottom-left)
  const cornerSize = 7; // QR corners are 7x7 modules
  const isCorner = (row: number, col: number): boolean => {
    // Top-left corner
    if (row < cornerSize && col < cornerSize) return true;
    // Top-right corner
    if (row < cornerSize && col >= modules - cornerSize) return true;
    // Bottom-left corner
    if (row >= modules - cornerSize && col < cornerSize) return true;
    return false;
  };

  // Draw styled modules
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (grid[row][col]) {
        const x = col * moduleSize;
        const y = row * moduleSize;

        // Use corner style for corners, otherwise use dot style
        if (isCorner(row, col)) {
          // Corner modules - use corner style
          const isInnerDot = (
            (row >= 2 && row <= 4 && col >= 2 && col <= 4) ||
            (row >= 2 && row <= 4 && col >= modules - 5 && col <= modules - 3) ||
            (row >= modules - 5 && row <= modules - 3 && col >= 2 && col <= 4)
          );

          if (isInnerDot) {
            // Inner dot - use cornersDotType
            drawStyledModule(ctx, x, y, moduleSize, style.dotsType);
          } else {
            // Outer ring - use cornersSquareType
            drawCornerModule(ctx, x, y, moduleSize, style.cornersSquareType);
          }
        } else {
          // Regular data modules
          drawStyledModule(ctx, x, y, moduleSize, style.dotsType);
        }
      }
    }
  }

  // Add logo if present
  if (style.logo) {
    await addLogoToQR(canvas, ctx, style);
  }

  // Return as data URL
  return canvas.toDataURL('image/png');
}

/**
 * Legacy function for backward compatibility.
 * Generates QR code data AND renders it with styling in one call.
 * 
 * NOTE: This regenerates the QR data every time, which is inefficient.
 * Use generateQrCodeData() + renderQrCodeVisual() separately for better performance.
 * 
 * @param url - The data to encode in the QR code
 * @param style - Visual styling to apply
 * @returns Data URL of the styled QR code image
 */
export async function generateStyledQrCode(
  url: string, 
  style: QrStyle
): Promise<string> {
  // Generate data first
  const qrData = await generateQrCodeData(url, style.logo ? 'H' : 'M');
  
  // Then render with styling
  return renderQrCodeVisual(qrData, style);
}

// Removed applyDotStyle - functionality moved to renderQrCodeVisual()

function detectModuleSize(canvas: HTMLCanvasElement, data: Uint8ClampedArray): number {
  // Find the first transition from light to dark to detect module size
  let lastPixel = data[0] < 128;
  let transitionCount = 0;
  let firstTransition = 0;
  let secondTransition = 0;

  for (let x = 0; x < canvas.width; x++) {
    const i = (Math.floor(canvas.height / 2) * canvas.width + x) * 4;
    const isDark = data[i] < 128;
    
    if (isDark !== lastPixel) {
      transitionCount++;
      if (transitionCount === 1) {
        firstTransition = x;
      } else if (transitionCount === 2) {
        secondTransition = x;
        break;
      }
      lastPixel = isDark;
    }
  }

  return secondTransition - firstTransition;
}

function drawStyledModule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: QrStyle['dotsType']
) {
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const radius = size / 2;

  switch (type) {
    case 'dots':
      // Perfect circles
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.9, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'rounded':
      // Rounded squares
      drawRoundedRect(ctx, x, y, size, size, size * 0.2);
      break;

    case 'extra-rounded':
      // Extra rounded squares
      drawRoundedRect(ctx, x, y, size, size, size * 0.4);
      break;

    case 'classy':
      // Classy style - slightly smaller squares
      ctx.fillRect(x + size * 0.1, y + size * 0.1, size * 0.8, size * 0.8);
      break;

    case 'classy-rounded':
      // Classy rounded - smaller rounded squares
      drawRoundedRect(ctx, x + size * 0.1, y + size * 0.1, size * 0.8, size * 0.8, size * 0.15);
      break;

    default:
      // Square (default)
      ctx.fillRect(x, y, size, size);
      break;
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function drawCornerModule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: QrStyle['cornersSquareType']
) {
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const radius = size / 2;

  switch (type) {
    case 'dot':
      // Perfect circles for corners
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.9, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'extra-rounded':
      // Extra rounded squares
      drawRoundedRect(ctx, x, y, size, size, size * 0.4);
      break;

    default:
      // Square (default)
      ctx.fillRect(x, y, size, size);
      break;
  }
}

async function addLogoToQR(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  style: QrStyle
) {
  if (!style.logo) return;

  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate logo size and position
      const logoSize = canvas.width * style.logoSize;
      const x = (canvas.width - logoSize) / 2;
      const y = (canvas.height - logoSize) / 2;

      // Draw white background with margin
      const bgSize = logoSize + style.logoMargin * 2;
      const bgX = (canvas.width - bgSize) / 2;
      const bgY = (canvas.height - bgSize) / 2;
      
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(bgX, bgY, bgSize, bgSize);

      // Draw logo
      ctx.drawImage(img, x, y, logoSize, logoSize);
      
      resolve();
    };
    img.onerror = () => {
      console.error('Failed to load logo');
      resolve(); // Don't fail the whole QR generation
    };
    img.src = style.logo;
  });
}

// Default style
export const defaultQrStyle: QrStyle = {
  dotsColor: '#FFFFFF', // White dots
  backgroundColor: '#000000', // Black background
  gradientType: 'none',
  dotsType: 'square',
  cornersSquareType: 'square',
  cornersDotType: 'square',
  logoSize: 0.2,
  logoMargin: 10,
};