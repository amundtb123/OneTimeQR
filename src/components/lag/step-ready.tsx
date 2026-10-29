import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
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

export type KeyImageKind = 'link' | 'key' | 'key1' | 'key2' | 'single';

const fileStem = (qrDrop: QrDrop) => qrDrop.fileName.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40) || 'key';

// The QR code the owner can always get back: for a sealed key it only leads to the lock
export function lockImage(qrDrop: QrDrop): { src: string; file: string; kind: KeyImageKind } {
  const sealed = !!(qrDrop.secureMode || qrDrop.singleQrMode);
  return {
    src: qrDrop.qrCodeUrlShare || qrDrop.qrCodeUrl,
    file: `onetimeqr-${fileStem(qrDrop)}${sealed ? '-link' : ''}.png`,
    kind: sealed ? 'link' : 'single',
  };
}

// The images a key consists of, in the order they should be handed out. The keys only exist
// right after creation; a key loaded from the server has just the lock QR.
export function keyImages(qrDrop: QrDrop): Array<{ src: string; file: string; kind: KeyImageKind }> {
  const name = fileStem(qrDrop);
  if (qrDrop.secureMode && qrDrop.qrCodeUrl2) {
    return [
      lockImage(qrDrop),
      { src: qrDrop.qrCodeUrl, file: `onetimeqr-${name}-key-1.png`, kind: 'key1' },
      { src: qrDrop.qrCodeUrl2, file: `onetimeqr-${name}-key-2.png`, kind: 'key2' },
    ];
  }
  if (qrDrop.keyUrl) return [{ src: qrDrop.qrCodeUrl, file: `onetimeqr-${name}.png`, kind: 'key' }];
  return [lockImage(qrDrop)];
}

// Set while step 3 shows unlock codes that haven't been saved. They exist only on this page,
// so App asks through this before it navigates away.
export const leaveReadyGuard: { current: null | (() => boolean) } = { current: null };

interface StepReadyProps {
  qrDrop: QrDrop;
  onNew: () => void;
  onKeyring: () => void;
}

export function StepReady({ qrDrop, onNew, onKeyring }: StepReadyProps) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  // The link carries the key when there is one; otherwise it only leads to the lock
  const url = qrDrop.keyUrl || shareLink(qrDrop);
  const delivery = qrDrop.keyDelivery;
  const images = keyImages(qrDrop);
  const message = t('lag.ready.shareMessage', { url });
  const codeMessage = qrDrop.keyCode ? t('lag.ready.shareCodeMessage', { code: qrDrop.keyCode }) : '';
  // Printing shows one card: the link's, or the key code's, so the two never end up on the same paper
  const [printing, setPrinting] = useState<'link' | 'code'>('link');
  const keysOnlyNow = !!(qrDrop.keyUrl || qrDrop.keyCode || qrDrop.qrCodeUrl2);
  // What has left this page; which of it holds the key depends on how the key is handed out
  const [linkSaved, setLinkSaved] = useState(false);
  const [imagesSaved, setImagesSaved] = useState(false);
  const [codeSaved, setCodeSaved] = useState(false);
  const saved =
    delivery === 'separate' ? codeSaved
    : delivery === 'twoQr' ? imagesSaved
    : linkSaved || imagesSaved;

  useEffect(() => {
    if (!keysOnlyNow || saved) return;
    leaveReadyGuard.current = () => window.confirm(t('lag.ready.leaveConfirm'));
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      leaveReadyGuard.current = null;
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [keysOnlyNow, saved, t]);

  const copy = async () => {
    if (await copyToClipboard(url)) {
      setCopied(true);
      setLinkSaved(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t('qrDetail.couldNotCopyLink'));
    }
  };

  const copyCode = async () => {
    if (await copyToClipboard(qrDrop.keyCode!)) {
      setCodeCopied(true);
      setCodeSaved(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } else {
      toast.error(t('qrDetail.couldNotCopyLink'));
    }
  };

  const downloadCode = () => {
    downloadImage(qrDrop.keyCodeQr!, `onetimeqr-${fileStem(qrDrop)}-key-code.png`);
    setCodeSaved(true);
    toast.success(t('qrDetail.qrDownloaded'));
  };

  const print = (card: 'link' | 'code') => {
    flushSync(() => setPrinting(card));
    window.print();
    setPrinting('link');
    if (card === 'code') setCodeSaved(true);
    else setImagesSaved(true);
  };

  const download = () => {
    images.forEach((img, i) => setTimeout(() => downloadImage(img.src, img.file), i * 150));
    setImagesSaved(true);
    toast.success(images.length > 1 ? t('lag.ready.downloaded', { count: images.length }) : t('qrDetail.qrDownloaded'));
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

      {delivery && <p className="lg-note" style={{ margin: 0 }}>{t(`lag.ready.note.${delivery}`)}</p>}

      {/* Each QR code sits next to the ways to share it; on a phone they stack in that order */}
      <div className="lg-cols lg-pair">
        <div className="lg-col-half">
          <div className={`lg-ticket${printing === 'link' ? ' lg-print' : ''}`}>
            <div className="lg-ticket-head">
              <span>ONETIMEQR</span>
              <span>{t('lag.preview.sealed')}{qrDrop.maxScans ? ` · ${qrDrop.maxScans}×` : ''}</span>
            </div>
            {images.length > 1 || (images[0].kind !== 'key' && images[0].kind !== 'single') ? (
              <div className={`lg-ticket-pair${images.length > 2 ? ' lg-ticket-three' : ''}`}>
                {images.map((img) => (
                  <figure key={img.kind}>
                    <img src={img.src} alt={t(`lag.ready.${img.kind}`)} />
                    <figcaption className="lg-small" style={{ fontWeight: 600 }}>{t(`lag.ready.${img.kind}`)}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <img src={images[0].src} alt={qrDrop.fileName} />
            )}
            <div className="lg-ticket-title">{qrDrop.fileName}</div>
          </div>
        </div>
        <div className="lg-col-half">
          <section className="lg-card" style={{ padding: 24, gap: 14 }}>
            <h2 className="lg-h2" style={{ fontSize: 20 }}>{t('lag.ready.share')}</h2>
            <div className="lg-linkbox">
              <span>{url.replace(/^https?:\/\//, '')}</span>
              <button type="button" onClick={copy}>{copied ? t('lag.ready.copied') : t('lag.ready.copy')}</button>
            </div>
            <div className="lg-grid-2">
              <a className="lg-btn" href={`sms:?&body=${encodeURIComponent(message)}`} onClick={() => setLinkSaved(true)}>{t('lag.ready.sms')}</a>
              <a className="lg-btn" href={`mailto:?subject=${encodeURIComponent(t('lag.ready.emailSubject'))}&body=${encodeURIComponent(message)}`} onClick={() => setLinkSaved(true)}>{t('lag.ready.email')}</a>
              <button type="button" className="lg-btn" onClick={download}>{t('lag.ready.download')}</button>
              <button type="button" className="lg-btn" onClick={() => print('link')}>{t('lag.ready.print')}</button>
            </div>
          </section>
        </div>
      </div>

      {qrDrop.keyCode && (
        <div className="lg-cols lg-pair">
          <div className="lg-col-half">
            <div className={`lg-ticket${printing === 'code' ? ' lg-print' : ''}`}>
              <div className="lg-ticket-head">
                <span>ONETIMEQR</span>
                <span>{t('lag.ready.keyCodeTag')}</span>
              </div>
              <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <img src={qrDrop.keyCodeQr} alt={t('lag.ready.keyCodeCaption')} />
                <figcaption className="lg-small" style={{ fontWeight: 600 }}>{t('lag.ready.keyCodeCaption')}</figcaption>
              </figure>
            </div>
          </div>
          <div className="lg-col-half">
            <section className="lg-card" style={{ padding: 24, gap: 14 }}>
              <h2 className="lg-h2" style={{ fontSize: 20 }}>{t('lag.ready.shareCode')}</h2>
              <div className="lg-linkbox">
                <span>{qrDrop.keyCode}</span>
                <button type="button" onClick={copyCode}>{codeCopied ? t('lag.ready.copied') : t('lag.ready.copy')}</button>
              </div>
              <div className="lg-grid-2">
                <a className="lg-btn" href={`sms:?&body=${encodeURIComponent(codeMessage)}`} onClick={() => setCodeSaved(true)}>{t('lag.ready.sms')}</a>
                <a className="lg-btn" href={`mailto:?subject=${encodeURIComponent(t('lag.ready.emailCodeSubject'))}&body=${encodeURIComponent(codeMessage)}`} onClick={() => setCodeSaved(true)}>{t('lag.ready.email')}</a>
                <button type="button" className="lg-btn" onClick={downloadCode} disabled={!qrDrop.keyCodeQr}>{t('lag.ready.download')}</button>
                <button type="button" className="lg-btn" onClick={() => print('code')} disabled={!qrDrop.keyCodeQr}>{t('lag.ready.print')}</button>
              </div>
              <p className="lg-small lg-muted" style={{ margin: 0 }}>{t('lag.ready.keyCodeHint')}</p>
            </section>
          </div>
        </div>
      )}

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
    </main>
  );
}
