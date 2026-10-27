import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QrStyle } from '../qr-style-picker';
import { generateStyledQrCode } from '../../utils/qr-generator';
import { unlockQrStyle } from '../../utils/create-drop';

export type StylePreset = 'standard' | 'blue' | 'seal' | 'brass' | 'custom';

const base = { gradientType: 'none', logoSize: 0.2, logoMargin: 4 } as const;

export const STYLE_PRESETS: Record<Exclude<StylePreset, 'custom'>, QrStyle> = {
  standard: { ...base, dotsColor: '#0B0B0B', backgroundColor: '#FFFFFF', dotsType: 'square', cornersSquareType: 'square', cornersDotType: 'square' },
  blue: { ...base, dotsColor: '#FFFFFF', backgroundColor: '#1F3BFF', dotsType: 'square', cornersSquareType: 'square', cornersDotType: 'square' },
  seal: { ...base, dotsColor: '#1E1B18', backgroundColor: '#F3EDE2', dotsType: 'rounded', cornersSquareType: 'extra-rounded', cornersDotType: 'dot' },
  brass: { ...base, dotsColor: '#C9A45C', backgroundColor: '#10241F', dotsType: 'classy-rounded', cornersSquareType: 'square', cornersDotType: 'square' },
};

// What the preview encodes: same length as a real key, so the pattern looks the same
export const PREVIEW_URL = `${typeof window !== 'undefined' ? window.location.origin : ''}/scan/00000000-0000-4000-8000-000000000000`;

function useQrImage(style: QrStyle): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    generateStyledQrCode(PREVIEW_URL, style).then((url) => alive && setSrc(url)).catch(() => alive && setSrc(null));
    return () => { alive = false; };
  }, [style]);
  return src;
}

interface KeyPreviewProps {
  style: QrStyle;
  two: boolean;
  locked: boolean; // Password: a small lock on the corner
}

export function KeyPreview({ style, two, locked }: KeyPreviewProps) {
  const { t } = useTranslation();
  const key1 = useQrImage(style);
  const key2 = useQrImage(two ? unlockQrStyle : style);

  if (two) {
    return (
      <div className="lg-qr-pair">
        <figure>
          <div className="lg-qr-frame">{key1 && <img src={key1} alt="" />}</div>
          <figcaption>{t('lag.preview.key1')}</figcaption>
        </figure>
        <span className="lg-plus" aria-hidden="true">+</span>
        <figure>
          <div className="lg-qr-frame">{key2 && <img src={key2} alt="" />}</div>
          <figcaption>{t('lag.preview.key2')}</figcaption>
        </figure>
      </div>
    );
  }

  return (
    <div className="lg-qr-frame">
      {key1 ? <img src={key1} alt="" /> : <div style={{ width: 210, height: 210 }} />}
      {locked && (
        <div className="lg-lock">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
      )}
    </div>
  );
}
