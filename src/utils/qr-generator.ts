import QRCode from 'qrcode';
import type { QrStyle } from '../components/qr-style-picker';

export async function generateStyledQrCode(
  url: string, 
  style: QrStyle
): Promise<string> {
  // Create a canvas element
  const canvas = document.createElement('canvas');
  const size = 400;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Generate base QR code with high error correction if logo is present
  await QRCode.toCanvas(canvas, url, {
    width: size,
    margin: 2,
    color: {
      dark: style.dotsColor,
      light: style.backgroundColor,
    },
    errorCorrectionLevel: style.logo ? 'H' : 'M',
  });

  // Apply custom styling based on dot type
  if (style.dotsType !== 'square' || style.cornersSquareType !== 'square') {
    await applyDotStyle(canvas, ctx, style);
  }

  // Add logo if present
  if (style.logo) {
    await addLogoToQR(canvas, ctx, style);
  }

  // Return as data URL
  return canvas.toDataURL('image/png');
}

async function applyDotStyle(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  style: QrStyle
) {
  // Get the image data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Create a new canvas for the styled version
  const styledCanvas = document.createElement('canvas');
  styledCanvas.width = canvas.width;
  styledCanvas.height = canvas.height;
  const styledCtx = styledCanvas.getContext('2d');
  
  if (!styledCtx) return;

  // Fill background
  styledCtx.fillStyle = style.backgroundColor;
  styledCtx.fillRect(0, 0, canvas.width, canvas.height);

  // Detect module size (size of each QR "dot")
  const moduleSize = detectModuleSize(canvas, data);
  
  if (moduleSize === 0) return;

  const modules = Math.floor(canvas.width / moduleSize);

  // Create a grid to track which modules are dark
  const grid: boolean[][] = [];
  for (let row = 0; row < modules; row++) {
    grid[row] = [];
    for (let col = 0; col < modules; col++) {
      const x = col * moduleSize + Math.floor(moduleSize / 2);
      const y = row * moduleSize + Math.floor(moduleSize / 2);
      const i = (y * canvas.width + x) * 4;
      grid[row][col] = data[i] < 128; // true if dark
    }
  }

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

  // Draw styled dots
  styledCtx.fillStyle = style.dotsColor;
  
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (grid[row][col]) {
        const x = col * moduleSize;
        const y = row * moduleSize;

        // Use corner style for corners, otherwise use dot style
        if (isCorner(row, col)) {
          // Corner modules - use corner style
          const isOuterRing = (
            (row === 0 || row === cornerSize - 1 || col === 0 || col === cornerSize - 1) ||
            (row < cornerSize && col >= modules - cornerSize && (row === 0 || row === cornerSize - 1 || col === modules - cornerSize || col === modules - 1)) ||
            (row >= modules - cornerSize && col < cornerSize && (row === modules - cornerSize || row === modules - 1 || col === 0 || col === cornerSize - 1))
          );
          
          const isInnerDot = (
            (row >= 2 && row <= 4 && col >= 2 && col <= 4) ||
            (row >= 2 && row <= 4 && col >= modules - 5 && col <= modules - 3) ||
            (row >= modules - 5 && row <= modules - 3 && col >= 2 && col <= 4)
          );

          if (isInnerDot) {
            // Inner dot - use cornersDotType
            drawStyledModule(styledCtx, x, y, moduleSize, style.dotsType);
          } else {
            // Outer ring - use cornersSquareType
            drawCornerModule(styledCtx, x, y, moduleSize, style.cornersSquareType);
          }
        } else {
          // Regular data modules
          drawStyledModule(styledCtx, x, y, moduleSize, style.dotsType);
        }
      }
    }
  }

  // Copy styled canvas back to original
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(styledCanvas, 0, 0);
}

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