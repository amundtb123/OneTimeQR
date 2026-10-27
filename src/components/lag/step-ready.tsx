import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner@2.0.3';
import type { QrDrop } from '../../App';
import { copyToClipboard } from '../../utils/clipboard';
import { formatActivationDate } from '../../utils/activation';
import { dropRuleLine } from './rules';

export const shareLink = (qrDrop: QrDrop) => `${window.location.origin}/scan/${qrDrop.id}`;

export function downloadImage(src: string, filename: string) {
  const link = document.createElement('a');
  link.href = src;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// The images a key consists of, in the order they should be handed out
export function keyImages(qrDrop: QrDrop): Array<{ src: string; file: string }> {
  const name = qrDrop.fileName.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40) || 'key';
  if (qrDrop.secureMode && qrDrop.qrCodeUrl2) {
    return [
      { src: qrDrop.qrCodeUrl, file: `onetimeqr-${name}-key-1.png` },
      { src: qrDrop.qrCodeUrl2, file: `onetimeqr-${name}-key-2.png` },
    ];
  }
  return [{ src: qrDrop.qrCodeUrl, file: `onetimeqr-${name}.png` }];
}

interface StepReadyProps {
  qrDrop: QrDrop;
  onNew: () => void;
  onKeyring: () => void;
}

export function StepReady({ qrDrop, onNew, onKeyring }: StepReadyProps) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = shareLink(qrDrop);
  const two = !!(qrDrop.secureMode && qrDrop.qrCodeUrl2);
  const images = keyImages(qrDrop);
  const message = t('lag.ready.shareMessage', { url });

  const copy = async () => {
    if (await copyToClipboard(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t('qrDetail.couldNotCopyLink'));
    }
  };

  const download = () => {
    images.forEach((img, i) => setTimeout(() => downloadImage(img.src, img.file), i * 150));
    toast.success(images.length > 1 ? t('qrDetail.bothQrsDownloaded') : t('qrDetail.qrDownloaded'));
  };

  return (
    <main className="lg-wrap lg-main lg-tight">
      <div className="lg-stack" style={{ gap: 8 }}>
        <div className="lg-eyebrow">{t('lag.step', { n: 3 })}</div>
        <h1 className="lg-h1">{t('lag.ready.title')}</h1>
        <p className="lg-lead" style={{ maxWidth: 'none' }}>
          {dropRuleLine(t, qrDrop)}.{' '}
          <button type="button" className="lg-underline" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--lg-ink)' }} onClick={onNew}>
            {t('lag.ready.edit')}
          </button>
        </p>
      </div>

      <div className="lg-cols">
        <div className="lg-col-half">
          <div className="lg-ticket lg-print">
            <div className="lg-ticket-head">
              <span>ONETIMEQR</span>
              <span>{t('lag.preview.sealed')}{qrDrop.maxScans ? ` · ${qrDrop.maxScans}×` : ''}</span>
            </div>
            {two ? (
              <div className="lg-ticket-pair">
                <figure>
                  <img src={qrDrop.qrCodeUrl} alt={t('lag.ready.key1')} />
                  <figcaption className="lg-small" style={{ fontWeight: 600 }}>{t('lag.ready.key1')}</figcaption>
                </figure>
                <figure>
                  <img src={qrDrop.qrCodeUrl2} alt={t('lag.ready.key2')} />
                  <figcaption className="lg-small" style={{ fontWeight: 600 }}>{t('lag.ready.key2')}</figcaption>
                </figure>
              </div>
            ) : (
              <img src={qrDrop.qrCodeUrl} alt={qrDrop.fileName} />
            )}
            <div className="lg-ticket-title">{qrDrop.fileName}</div>
          </div>
          {two && <p className="lg-note" style={{ margin: 0 }}>{t('lag.ready.onlyNow')}</p>}
          {qrDrop.singleQrMode && <p className="lg-note" style={{ margin: 0 }}>{t('lag.ready.scanOnly')}</p>}
        </div>

        <div className="lg-col-half">
          <section className="lg-card" style={{ padding: 24, gap: 14 }}>
            <h2 className="lg-h2" style={{ fontSize: 20 }}>{t('lag.ready.share')}</h2>
            <div className="lg-linkbox">
              <span>{url.replace(/^https?:\/\//, '')}</span>
              <button type="button" onClick={copy}>{copied ? t('lag.ready.copied') : t('lag.ready.copy')}</button>
            </div>
            <div className="lg-grid-2">
              <a className="lg-btn" href={`sms:?&body=${encodeURIComponent(message)}`}>{t('lag.ready.sms')}</a>
              <a className="lg-btn" href={`mailto:?subject=${encodeURIComponent(t('lag.ready.emailSubject'))}&body=${encodeURIComponent(message)}`}>{t('lag.ready.email')}</a>
              <button type="button" className="lg-btn" onClick={download}>{t('lag.ready.download')}</button>
              <button type="button" className="lg-btn" onClick={() => window.print()}>{t('lag.ready.print')}</button>
            </div>
          </section>

          <section className="lg-card" style={{ padding: 24, gap: 14 }}>
            <h2 className="lg-h2" style={{ fontSize: 20 }}>{t('lag.ready.next')}</h2>
            <div className="lg-timeline">
              <div><span className="lg-dot lg-dot-on" /><span dangerouslySetInnerHTML={{ __html: t('lag.ready.sealedNow') }} /></div>
              {qrDrop.activatesAt && (
                <div className="lg-muted"><span className="lg-dot" /><span>{t('lag.ready.opensAt', { date: formatActivationDate(qrDrop.activatesAt, i18n.language) })}</span></div>
              )}
              <div className="lg-muted"><span className="lg-dot" /><span>{t('lag.ready.opened')}</span></div>
              {qrDrop.expiryDate && (
                <div className="lg-muted"><span className="lg-dot" /><span>{t('lag.ready.invalidAt', { date: formatActivationDate(qrDrop.expiryDate, i18n.language) })}</span></div>
              )}
            </div>
            <button type="button" className="lg-link" style={{ alignSelf: 'flex-start', padding: '6px 0' }} onClick={onKeyring}>
              {t('lag.ready.toKeyring')}
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
