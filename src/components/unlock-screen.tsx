import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { QrScanner } from './qr-scanner-html5';
import { parseKeyUrl, isKeyCode, type KeyParts } from '../utils/key-handover';
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

// Asks for the QR key(s) holding the decryption key. Scanning happens here (camera or image
// upload, or the QR key pasted as text); combining the parts and opening the drop is up to the parent.
export function UnlockScreen({ qrDropId, singleQrMode, keyParts, expiresAt, onKeyParts }: UnlockScreenProps) {
  const { t } = useTranslation();
  const [showScanner, setShowScanner] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const now = useNow(!!expiresAt);

  // Two QR keys: which one is missing decides what to ask for
  const needsQr2 = !singleQrMode && !!keyParts.k1;
  const prompt = singleQrMode
    ? t('lag.unlock.scanOne')
    : needsQr2
      ? t('lag.unlock.scanKey2')
      : keyParts.k2
        ? t('lag.unlock.scanKey1')
        : t('lag.unlock.scanBoth');

  const handleQrScanned = (data: string) => {
    setShowScanner(false);
    if (singleQrMode && isKeyCode(data.trim())) {
      onKeyParts({ k1: data.trim() }); // A QR key holds just the key, for the drop this link leads to
      return;
    }
    const scanned = parseKeyUrl(data);
    if (!scanned || (!scanned.parts.k1 && !scanned.parts.k2)) {
      toast.error(t('lag.unlock.notAKey'));
    } else if (scanned.id !== qrDropId.toLowerCase()) {
      toast.error(t('lag.unlock.otherFile'));
    } else {
      if (!singleQrMode && scanned.parts.k1 && !keyParts.k2) {
        toast.success(t('lag.unlock.key1Scanned'));
      }
      onKeyParts(scanned.parts);
    }
  };

  // The QR key as text, or a whole link pasted in
  const handleCodeSubmit = () => {
    const code = codeInput.trim();
    if (isKeyCode(code)) {
      onKeyParts({ k1: code });
    } else if (parseKeyUrl(code)) {
      handleQrScanned(code);
    } else {
      toast.error(t('lag.unlock.notAKey'));
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
      toast.error(t('lag.unlock.onlyImages'));
      return;
    }

    setIsUploading(true);
    try {
      handleQrScanned(await decodeQrFromImage(file));
    } catch {
      toast.error(t('lag.unlock.noQrInImage'));
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
    <div style={{ maxWidth: 440, margin: '8px auto' }}>
      <section className="lg-card" style={{ gap: 14 }}>
        <div className="lg-stack" style={{ gap: 6 }}>
          <div className="lg-eyebrow">{t('lag.unlock.sealed')}</div>
          <h1 className="lg-h2" style={{ margin: 0, fontSize: 28 }}>{t('lag.unlock.title')}</h1>
          <p className="lg-muted" style={{ margin: 0 }}>{prompt}</p>
          {expiresAt && <p className="lg-small lg-muted" style={{ margin: 0 }}>{formatTimeLeft(t, expiresAt, now)}</p>}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />

        <button type="button" className="lg-btn lg-btn-primary" onClick={() => setShowScanner(true)} disabled={isUploading}>
          {t('lag.unlock.scan')}
        </button>
        <button type="button" className="lg-btn" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? t('lag.unlock.reading') : t('lag.unlock.upload')}
        </button>

        {showCodeInput ? (
          <form
            className="lg-linkbox"
            onSubmit={(e) => {
              e.preventDefault();
              handleCodeSubmit();
            }}
          >
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder={t('lag.unlock.pastePlaceholder')}
              aria-label={t('lag.unlock.pastePlaceholder')}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              style={{ flexGrow: 1, minWidth: 0, border: 0, padding: '14px 16px', fontFamily: 'var(--lg-mono)', fontSize: 14, background: 'transparent' }}
            />
            <button type="submit" disabled={!codeInput.trim()}>{t('lag.unlock.open')}</button>
          </form>
        ) : (
          <button type="button" className="lg-link lg-small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowCodeInput(true)}>
            {t('lag.unlock.pasteToggle')}
          </button>
        )}

        <p className="lg-small lg-muted" style={{ margin: 0 }}>{t('lag.unlock.privacy')}</p>
      </section>
    </div>
  );
}
