import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner@2.0.3';
import type { CreatedSeries } from '../../utils/create-series';
import { generateStyledQrCode } from '../../utils/qr-generator';
import { createBrandedQrCode } from '../../utils/qr-with-branding';
import { formatActivationDate } from '../../utils/activation';
import { codeLabel, seriesCsv, seriesPdf, seriesZip } from '../../utils/series-export';
import { leaveReadyGuard } from './step-ready';

type Export = 'csv' | 'zip' | 'pdf';

interface StepSeriesReadyProps {
  created: CreatedSeries;
  onNew: () => void;
  onKeyring: () => void;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Step 3 for a series: the links hold the key and exist only on this page, so they must be
// downloaded (for the printer) before leaving
export function StepSeriesReady({ created, onNew, onKeyring }: StepSeriesReadyProps) {
  const { t, i18n } = useTranslation();
  const { series, codes, style } = created;
  const [sample, setSample] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<Export | null>(null);
  const [progress, setProgress] = useState(0);
  const name = (series.title || 'serie').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40);

  useEffect(() => {
    let cancelled = false;
    generateStyledQrCode(codes[0].url, style)
      .then(createBrandedQrCode)
      .then((src) => { if (!cancelled) setSample(src); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [codes, style]);

  useEffect(() => {
    if (saved) return;
    leaveReadyGuard.current = () => window.confirm(t('lag.series.ready.leaveConfirm'));
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      leaveReadyGuard.current = null;
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [saved, t]);

  const run = async (kind: Export) => {
    setBusy(kind);
    setProgress(0);
    const onProgress = (done: number, total: number) => setProgress(Math.round((done / total) * 100));
    try {
      if (kind === 'csv') saveBlob(seriesCsv(codes), `onetimeqr-${name}.csv`);
      if (kind === 'zip') saveBlob(await seriesZip(codes, style, onProgress), `onetimeqr-${name}.zip`);
      if (kind === 'pdf') saveBlob(await seriesPdf(codes, style, series.title || '', onProgress), `onetimeqr-${name}.pdf`);
      setSaved(true);
    } catch (error: any) {
      console.error('❌ Series export failed:', error?.message);
      toast.error(t('lag.series.ready.exportFailed'));
    } finally {
      setBusy(null);
    }
  };

  const button = (kind: Export) => (
    <button type="button" className="lg-btn" disabled={busy !== null} onClick={() => run(kind)}>
      {busy === kind && kind !== 'csv' ? t('lag.series.ready.making', { percent: progress }) : t(`lag.series.ready.${kind}`)}
    </button>
  );

  return (
    <main className="lg-wrap lg-main lg-tight">
      <div className="lg-stack" style={{ gap: 8 }}>
        <div className="lg-eyebrow">{t('lag.step', { n: 3 })}</div>
        <h1 className="lg-h1">{t('lag.series.ready.title', { count: series.codeCount })}</h1>
        <p className="lg-lead" style={{ maxWidth: 'none' }}>
          {t('lag.series.ready.lead', { count: series.codeCount })}{' '}
          <button type="button" className="lg-underline" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--lg-ink)' }} onClick={onNew}>
            {t('lag.ready.edit')}
          </button>
        </p>
      </div>

      <p className="lg-note" style={{ margin: 0 }}>{t('lag.series.ready.note')}</p>

      <div className="lg-cols lg-pair">
        <div className="lg-col-half">
          <div className="lg-ticket">
            <div className="lg-ticket-head">
              <span>ONETIMEQR</span>
              <span>{t('lag.series.ready.sampleTag', { number: codeLabel(1) })}</span>
            </div>
            <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              {sample ? <img src={sample} alt={t('lag.series.ready.sampleAlt')} /> : <div style={{ width: '100%', aspectRatio: '1 / 1' }} />}
              <figcaption className="lg-small" style={{ fontWeight: 600 }}>{t('lag.series.ready.sample')}</figcaption>
            </figure>
            {series.title && <div className="lg-ticket-title">{series.title}</div>}
          </div>
        </div>
        <div className="lg-col-half">
          <section className="lg-card" style={{ padding: 24, gap: 14 }}>
            <h2 className="lg-h2" style={{ fontSize: 20 }}>{t('lag.series.ready.download')}</h2>
            <div className="lg-stack" style={{ gap: 10 }}>
              {button('pdf')}
              <span className="lg-small lg-muted">{t('lag.series.ready.pdfNote')}</span>
              {button('zip')}
              <span className="lg-small lg-muted">{t('lag.series.ready.zipNote')}</span>
              {button('csv')}
              <span className="lg-small lg-muted">{t('lag.series.ready.csvNote')}</span>
            </div>
            {saved && <span className="lg-small" style={{ fontWeight: 600 }}>{t('lag.series.ready.saved')}</span>}
          </section>
        </div>
      </div>

      <section className="lg-card" style={{ padding: 24, gap: 14 }}>
        <h2 className="lg-h2" style={{ fontSize: 20 }}>{t('lag.ready.next')}</h2>
        <div className="lg-timeline">
          <div><span className="lg-dot lg-dot-on" /><span dangerouslySetInnerHTML={{ __html: t('lag.ready.sealedNow') }} /></div>
          <div className="lg-muted"><span className="lg-dot" /><span>{t('lag.series.ready.firstScan', { lifetime: t(`lag.series.lifetimeShort.${lifetimeKey(series.lifetimeMs)}`) })}</span></div>
          <div className="lg-muted"><span className="lg-dot" /><span>{t('lag.series.ready.endsAt', { date: formatActivationDate(new Date(series.expiresAt), i18n.language) })}</span></div>
        </div>
        <button type="button" className="lg-link" style={{ alignSelf: 'flex-start', padding: '6px 0' }} onClick={onKeyring}>
          {t('lag.ready.toKeyring')}
        </button>
      </section>
    </main>
  );
}

// The lifetime choice a series was made with, from its length
export function lifetimeKey(ms: number): string {
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  return days >= 365 ? '365d' : days >= 30 ? '30d' : days >= 7 ? '7d' : '24h';
}
