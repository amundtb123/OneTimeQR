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

export type KeyImageKind = 'link' | 'single';

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

// Set while step 3 shows unlock codes that haven't been saved. They exist only on this page,
// so App asks through this before it navigates away.
export const leaveReadyGuard: { current: null | (() => boolean) } = { current: null };

interface StepReadyProps {
  qrDrop: QrDrop;
  onNew: () => void;
  onKeyring: () => void;
}

// One thing to hand out: its QR code, and the ways to share it
interface ShareCard {
  id: 'link' | 'key' | 'key1' | 'key2';
  tag: string; // Top right of the printed card
  src: string;
  caption?: string;
  heading: string;
  text: string; // Shown, copied and sent by SMS or email
  message: string;
  emailSubject: string;
  file: string;
  hint?: string;
}

// The cards a new key consists of, in the order they should be handed out. What opens the
// content only exists right after creation; a key loaded from the server has just the lock.
function shareCards(t: (key: string, options?: Record<string, unknown>) => string, qrDrop: QrDrop): ShareCard[] {
  const name = fileStem(qrDrop);
  const url = qrDrop.keyUrl || shareLink(qrDrop);
  const cards: ShareCard[] = [{
    id: 'link',
    tag: `${t('lag.preview.sealed')}${qrDrop.maxScans ? ` · ${qrDrop.maxScans}×` : ''}`,
    src: qrDrop.keyUrl ? qrDrop.qrCodeUrl : lockImage(qrDrop).src,
    caption: qrDrop.keyUrl ? undefined : t('lag.ready.link'),
    heading: t('lag.ready.share'),
    text: url,
    message: t('lag.ready.shareMessage', { url }),
    emailSubject: t('lag.ready.emailSubject'),
    file: qrDrop.keyUrl ? `onetimeqr-${name}.png` : lockImage(qrDrop).file,
  }];
  if (qrDrop.keyCode && qrDrop.keyCodeQr) {
    cards.push({
      id: 'key',
      tag: t('lag.ready.keyCodeTag'),
      src: qrDrop.keyCodeQr,
      caption: t('lag.ready.keyCodeCaption'),
      heading: t('lag.ready.shareCode'),
      text: qrDrop.keyCode,
      message: t('lag.ready.shareCodeMessage', { code: qrDrop.keyCode }),
      emailSubject: t('lag.ready.emailCodeSubject'),
      file: `onetimeqr-${name}-key.png`,
      hint: t('lag.ready.keyCodeHint'),
    });
  }
  if (qrDrop.key1Url && qrDrop.key2Url && qrDrop.qrCodeUrl2) {
    ([[1, qrDrop.key1Url, qrDrop.qrCodeUrl], [2, qrDrop.key2Url, qrDrop.qrCodeUrl2]] as const).forEach(([n, keyUrl, src]) => {
      cards.push({
        id: n === 1 ? 'key1' : 'key2',
        tag: t('lag.ready.keyTag', { n }),
        src,
        caption: t(`lag.ready.key${n}`),
        heading: t('lag.ready.shareKey', { n }),
        text: keyUrl,
        message: t('lag.ready.shareKeyMessage', { n, url: keyUrl }),
        emailSubject: t('lag.ready.emailKeySubject', { n }),
        file: `onetimeqr-${name}-key-${n}.png`,
      });
    });
  }
  return cards;
}

export function StepReady({ qrDrop, onNew, onKeyring }: StepReadyProps) {
  const { t, i18n } = useTranslation();
  const delivery = qrDrop.keyDelivery;
  const cards = shareCards(t, qrDrop);
  // What must leave this page before it is safe to go: the cards holding what opens the content
  const required: ShareCard['id'][] =
    delivery === 'separate' ? ['key']
    : delivery === 'twoQr' ? ['key1', 'key2']
    : qrDrop.keyUrl ? ['link']
    : [];
  const [savedIds, setSavedIds] = useState<ShareCard['id'][]>([]);
  const markSaved = (id: ShareCard['id']) => setSavedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  const keysOnlyNow = required.length > 0;
  const saved = required.every((id) => savedIds.includes(id));
  const [copiedId, setCopiedId] = useState<ShareCard['id'] | null>(null);
  // Printing shows one card, so two parts of what opens the content never end up on the same paper
  const [printing, setPrinting] = useState<ShareCard['id']>('link');

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

  const copy = async (card: ShareCard) => {
    if (await copyToClipboard(card.text)) {
      setCopiedId(card.id);
      markSaved(card.id);
      setTimeout(() => setCopiedId((id) => (id === card.id ? null : id)), 2000);
    } else {
      toast.error(t('qrDetail.couldNotCopyLink'));
    }
  };

  const download = (card: ShareCard) => {
    downloadImage(card.src, card.file);
    markSaved(card.id);
    toast.success(t('qrDetail.qrDownloaded'));
  };

  const print = (card: ShareCard) => {
    flushSync(() => setPrinting(card.id));
    window.print();
    setPrinting('link');
    markSaved(card.id);
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
      {cards.map((card) => (
        <div key={card.id} className="lg-cols lg-pair">
          <div className="lg-col-half">
            <div className={`lg-ticket${printing === card.id ? ' lg-print' : ''}`}>
              <div className="lg-ticket-head">
                <span>ONETIMEQR</span>
                <span>{card.tag}</span>
              </div>
              <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <img src={card.src} alt={card.caption || qrDrop.fileName} />
                {card.caption && <figcaption className="lg-small" style={{ fontWeight: 600 }}>{card.caption}</figcaption>}
              </figure>
              {card.id === 'link' && <div className="lg-ticket-title">{qrDrop.fileName}</div>}
            </div>
          </div>
          <div className="lg-col-half">
            <section className="lg-card" style={{ padding: 24, gap: 14 }}>
              <h2 className="lg-h2" style={{ fontSize: 20 }}>{card.heading}</h2>
              <div className="lg-linkbox">
                <span>{card.text.replace(/^https?:\/\//, '')}</span>
                <button type="button" onClick={() => copy(card)}>{copiedId === card.id ? t('lag.ready.copied') : t('lag.ready.copy')}</button>
              </div>
              <div className="lg-grid-2">
                <a className="lg-btn" href={`sms:?&body=${encodeURIComponent(card.message)}`} onClick={() => markSaved(card.id)}>{t('lag.ready.sms')}</a>
                <a className="lg-btn" href={`mailto:?subject=${encodeURIComponent(card.emailSubject)}&body=${encodeURIComponent(card.message)}`} onClick={() => markSaved(card.id)}>{t('lag.ready.email')}</a>
                <button type="button" className="lg-btn" onClick={() => download(card)}>{t('lag.ready.download')}</button>
                <button type="button" className="lg-btn" onClick={() => print(card)}>{t('lag.ready.print')}</button>
              </div>
              {card.hint && <p className="lg-small lg-muted" style={{ margin: 0 }}>{card.hint}</p>}
            </section>
          </div>
        </div>
      ))}

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
