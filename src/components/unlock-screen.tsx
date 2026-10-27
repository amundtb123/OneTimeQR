import { useState, useRef } from 'react';
import { Shield, Key, Scan, Loader2, Clock, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SoftCard } from './soft-card';
import { NordicButton } from './nordic-button';
import { QrScanner } from './qr-scanner-html5';
import { parseKeyUrl, type KeyParts } from '../utils/key-handover';
import { formatTimeLeft, useNow } from '../utils/time-left';
import { toast } from 'sonner@2.0.3';
import jsQR from 'jsqr';

interface UnlockScreenProps {
  qrDropId: string;
  singleQrMode: boolean;
  keyParts: KeyParts; // Parts already scanned for this drop
  expiresAt?: number | null;
  onKeyParts: (parts: KeyParts) => void; // Called with the key part(s) from a scanned QR code
}

// Asks for the QR code(s) holding the decryption key. Scanning happens here (camera or image
// upload); combining the parts and opening the drop is up to the parent.
export function UnlockScreen({ qrDropId, singleQrMode, keyParts, expiresAt, onKeyParts }: UnlockScreenProps) {
  const { t } = useTranslation();
  const [showScanner, setShowScanner] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const now = useNow(!!expiresAt);

  // Secure Mode needs both parts; which one is missing decides what to ask for
  const needsQr2 = !singleQrMode && !!keyParts.k1;
  const prompt = singleQrMode
    ? t('unlockScreen.scanSingleQr')
    : needsQr2
      ? t('unlockScreen.scanQr2')
      : keyParts.k2
        ? t('unlockScreen.qr2ScannedScanQr1')
        : t('unlockScreen.scanQr1First');
  const scanButtonLabel = singleQrMode
    ? t('unlockScreen.scanSingleQrButton')
    : needsQr2 ? t('unlockScreen.scanQr2Button') : t('unlockScreen.scanQr1Button');

  const handleQrScanned = (data: string) => {
    setShowScanner(false);
    const scanned = parseKeyUrl(data);
    if (!scanned) {
      toast.error(t('unlockScreen.invalidQr'));
    } else if (scanned.id !== qrDropId.toLowerCase()) {
      toast.error(t('unlockScreen.wrongQrCode'));
    } else if (!scanned.parts.k1 && !scanned.parts.k2) {
      toast.error(t('unlockScreen.noKeyInQr'));
    } else {
      if (!singleQrMode && scanned.parts.k1 && !keyParts.k2) {
        toast.success(t('unlockScreen.qr1Scanned'));
      }
      onKeyParts(scanned.parts);
    }
  };

  const decodeQrFromImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Could not get canvas context'));
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code?.data) resolve(code.data);
        else reject(new Error('No QR code found in image'));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };
      img.src = objectUrl;
    });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('unlockScreen.onlyImages'));
      return;
    }

    setIsUploading(true);
    try {
      handleQrScanned(await decodeQrFromImage(file));
    } catch {
      toast.error(t('unlockScreen.couldNotReadImage'));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (showScanner) {
    return (
      <QrScanner
        qrNumber={needsQr2 ? '2' : '1'}
        onScan={handleQrScanned}
        onClose={() => setShowScanner(false)}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F7F2EE' }}>
      <div className="max-w-md w-full">
        <SoftCard className="text-center">
          {/* Icon */}
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{
              background: 'linear-gradient(135deg, #E8927E, #E1C7BA)',
            }}
          >
            <Shield className="size-10 text-white" />
          </div>

          {/* Heading */}
          <h1 className="text-[#3F3F3F] mb-3">{t('unlockScreen.unlockFile')}</h1>
          <p className="text-[#5B5B5B] mb-8">{prompt}</p>

          {/* Instructions */}
          <div
            className="rounded-xl p-4 mb-6 text-left"
            style={{
              backgroundColor: '#F5E5E1',
              borderColor: '#D5C5BD'
            }}
          >
            <div className="flex items-start gap-3">
              <Key className="size-5 text-[#E8927E] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-[#3F3F3F] text-sm mb-2">{t('unlockScreen.secureModeActive')}</h3>
                <p className="text-[#5B5B5B] text-sm">
                  {t('unlockScreen.secureModeDesc')}
                </p>
              </div>
            </div>
          </div>

          {/* Expiry Countdown */}
          {expiresAt && (
            <div
              className="rounded-xl p-4 mb-6 text-left"
              style={{
                backgroundColor: '#F5E5E1',
                borderColor: '#D5C5BD'
              }}
            >
              <div className="flex items-start gap-3">
                <Clock className="size-5 text-[#E8927E] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-[#3F3F3F] text-sm mb-2">{t('unlockScreen.expiryDate')}</h3>
                  <p className="text-[#5B5B5B] text-sm">
                    {formatTimeLeft(t, expiresAt, now)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="space-y-3">
            <NordicButton
              variant="coral"
              size="lg"
              onClick={() => setShowScanner(true)}
              disabled={isUploading}
              className="w-full shadow-lg"
            >
              <Scan className="size-5 mr-2" />
              {scanButtonLabel}
            </NordicButton>
            <NordicButton
              variant="blue"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full shadow-lg"
            >
              {isUploading ? (
                <>
                  <Loader2 className="size-5 mr-2 animate-spin" />
                  {t('unlockScreen.decodingImage')}
                </>
              ) : (
                <>
                  <Upload className="size-5 mr-2" />
                  {t('unlockScreen.uploadQrImage')}
                </>
              )}
            </NordicButton>
            <p className="text-[#5B5B5B] text-xs text-center mt-2">
              {t('unlockScreen.sameDeviceHint')}
            </p>
          </div>

          <p className="text-[#5B5B5B] text-xs mt-4">
            {t('unlockScreen.neverStoredUnencrypted')}
          </p>
        </SoftCard>
      </div>
    </div>
  );
}
