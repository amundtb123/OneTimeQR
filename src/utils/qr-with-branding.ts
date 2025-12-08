/**
 * Creates a branded QR code image with logo underneath
 * @param qrDataUrl - The QR code data URL
 * @returns Promise<string> - Combined image as data URL
 */
export async function createBrandedQrCode(qrDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const qrImage = new Image();
    
    qrImage.onload = () => {
      // Canvas dimensions
      const qrSize = qrImage.width;
      const padding = 40;
      const logoHeight = 24; // Small subtle logo
      const logoSpacing = 20;
      const totalHeight = qrSize + padding * 2 + logoHeight + logoSpacing;
      
      canvas.width = qrSize + padding * 2;
      canvas.height = totalHeight;
      
      // Fill background with white
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw QR code centered
      ctx.drawImage(qrImage, padding, padding, qrSize, qrSize);
      
      // Draw "OneTimeQR" text below in Nordic style
      const textY = padding + qrSize + logoSpacing + 12;
      
      // Main text
      ctx.font = '600 16px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#5D8CC9'; // Nordic blue
      ctx.textAlign = 'center';
      ctx.fillText('OneTimeQR', canvas.width / 2, textY);
      
      // Convert to data URL
      resolve(canvas.toDataURL('image/png'));
    };
    
    qrImage.onerror = () => {
      reject(new Error('Failed to load QR code image'));
    };
    
    qrImage.src = qrDataUrl;
  });
}
