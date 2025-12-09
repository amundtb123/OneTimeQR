import QRCodeStyling from 'qr-code-styling';
import type { QrStyle } from '../components/qr-style-picker';

/**
 * Generates a styled QR code using qr-code-styling library
 * This is more reliable than the previous canvas-based approach
 * 
 * @param url - The URL/data to encode in the QR code
 * @param style - Visual styling options
 * @returns Data URL of the styled QR code image
 */
export async function generateStyledQrCode(
  url: string, 
  style: QrStyle
): Promise<string> {
  // Create QR code instance with qr-code-styling library
  const qrCode = new QRCodeStyling({
    width: 400,
    height: 400,
    data: url,
    margin: 2,
    qrOptions: {
      typeNumber: 0,
      mode: 'Byte',
      errorCorrectionLevel: style.logo ? 'H' : 'M',
    },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: style.logoSize || 0.2,
      margin: style.logoMargin || 4,
    },
    dotsOptions: {
      color: style.dotsColor,
      type: style.dotsType,
    },
    backgroundOptions: {
      color: style.backgroundColor,
    },
    cornersSquareOptions: {
      color: style.cornersSquareColor || style.dotsColor,
      type: style.cornersSquareType,
    },
    cornersDotOptions: {
      color: style.cornersDotColor || style.dotsColor,
      type: style.cornersDotType,
    },
    image: style.logo || undefined,
  });

  // Get the QR code as data URL
  return new Promise((resolve, reject) => {
    qrCode.getRawData('png')
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })
      .catch(reject);
  });
}

// Removed old canvas-based styling functions - now using qr-code-styling library
// The library handles all styling internally, making it more reliable

// Default style (exported for backward compatibility)
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