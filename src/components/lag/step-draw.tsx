import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner@2.0.3';
import { useAuth } from '../../utils/auth-context';
import { KR_PER_GB, MAX_SIZE_LOGGED_IN } from '../../utils/create-drop';
import { SERIES_KR_PER_100, type SeriesEnd } from '../../utils/create-series';
import {
  createDraw, drawPriceKr, drawTooMuchTraffic, DRAW_COUNTS, DRAW_ENDS, DRAW_ENDS_WITH_FILES, DRAW_LABEL_MAX,
  DRAW_MAX_CODES, DRAW_MAX_PRIZES, DRAW_MIN_CODES, type CreatedDraw, type DrawPrize,
} from '../../utils/create-draw';
import { STYLE_PRESETS } from './key-preview';
import { CoinShop } from '../coin-shop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

interface StepDrawProps {
  onBack: () => void;
  onCreated: (created: CreatedDraw) => void;
}

const newPrize = (): DrawPrize => ({ label: '', count: 1, message: '', files: [] });

// A picture for a prize or for the tickets without one, with a thumbnail and a remove button
function Pictures({ files, onChange, label }: { files: File[]; onChange: (files: File[]) => void; label: string }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setThumbs(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  return (
    <div className="lg-row" style={{ gap: 8 }}>
      {files.map((file, i) => (
        <span key={`${i}:${file.name}`} className="lg-draw-thumb">
          <img src={thumbs[i]} alt="" />
          <button type="button" aria-label={t('lag.content.remove', { name: file.name })} onClick={() => onChange(files.filter((_, j) => j !== i))}>×</button>
        </span>
      ))}
      <button type="button" className="lg-btn lg-btn-dashed" style={{ minHeight: 40, padding: '8px 12px' }} onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="lg-sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { onChange([...files, ...Array.from(e.target.files || [])]); e.target.value = ''; }}
      />
    </div>
  );
}

// Step 2 for a draw: how many tickets, the prizes and what the others see
export function StepDraw({ onBack, onCreated }: StepDrawProps) {
  const { t, i18n } = useTranslation();
  const { user, coins, refreshCoins, signInWithGoogle } = useAuth();
  const [title, setTitle] = useState('');
  const [count, setCount] = useState(20);
  const [countInput, setCountInput] = useState('20');
  const [prizes, setPrizes] = useState<DrawPrize[]>([{ ...newPrize(), label: '' }]);
  const [noPrizeText, setNoPrizeText] = useState(() => t('lag.draw.noPrizeDefault'));
  const [noPrizeFiles, setNoPrizeFiles] = useState<File[]>([]);
  const [end, setEnd] = useState<SeriesEnd>('1mo');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);

  const allFiles = [...noPrizeFiles, ...prizes.flatMap((p) => p.files)];
  const hasFiles = allFiles.length > 0;
  const realEnd: SeriesEnd = hasFiles ? '1mo' : end;
  const prizeCodes = prizes.reduce((sum, p) => sum + (p.count || 0), 0);
  const cost = drawPriceKr(count, noPrizeFiles, prizes);
  const badCount = !Number.isInteger(count) || count < DRAW_MIN_CODES || count > DRAW_MAX_CODES;
  const tooManyPrizes = prizeCodes >= count;
  const tooLarge = allFiles.reduce((sum, f) => sum + f.size, 0) > MAX_SIZE_LOGGED_IN;
  const tooMuchTraffic = drawTooMuchTraffic(count, noPrizeFiles, prizes);
  const notEnough = !!user && coins !== null && coins < cost;
  const blocked = badCount || tooManyPrizes || tooLarge || tooMuchTraffic || notEnough;

  const setPrize = (i: number, changes: Partial<DrawPrize>) => setPrizes((list) => list.map((p, j) => (j === i ? { ...p, ...changes } : p)));

  const handleCreate = async () => {
    if (!user) {
      toast.error(t('upload.mustBeLoggedIn'));
      return;
    }
    if (badCount) return toast.error(t('lag.draw.errors.count', { min: DRAW_MIN_CODES, max: DRAW_MAX_CODES }));
    if (prizes.some((p) => !p.label.trim())) return toast.error(t('lag.draw.errors.prizeLabel'));
    if (tooManyPrizes) return toast.error(t('lag.draw.errors.tooManyPrizes'));
    if (!noPrizeText.trim() && noPrizeFiles.length === 0) return toast.error(t('lag.draw.errors.noPrize'));
    if (tooLarge) return toast.error(t('lag.errors.tooLarge', { max: '20 MB' }));
    if (tooMuchTraffic) return toast.error(t('lag.draw.errors.traffic'));
    if (!acceptedTerms) return toast.error(t('lag.errors.terms'));
    if (notEnough) return toast.error(t('lag.preview.notEnough'));

    setCreating(true);
    try {
      const { created, coinsCharged } = await createDraw({
        title,
        codeCount: count,
        noPrizeText,
        noPrizeFiles,
        prizes,
        end: realEnd,
        qrStyle: STYLE_PRESETS.standard,
      });
      await refreshCoins();
      toast.success(t('lag.preview.charged', { kr: coinsCharged }));
      onCreated(created);
    } catch (error: any) {
      console.error('❌ Error creating draw:', error?.message);
      if (error?.status === 401) toast.error(t('upload.mustBeLoggedIn'));
      else if (error?.code === 'INSUFFICIENT_COINS') {
        await refreshCoins();
        toast.error(t('lag.preview.notEnough'));
      } else if (error?.code === 'RATE_LIMITED') toast.error(t('upload.rateLimited'));
      else toast.error(error?.message || t('upload.createQrError'));
    } finally {
      setCreating(false);
    }
  };

  const createLabel = creating ? t('lag.preview.creating') : t('lag.draw.create', { count: count.toLocaleString(i18n.language) });
  const odds = prizeCodes > 0 && !tooManyPrizes ? Math.max(1, Math.round(count / prizeCodes)) : null;

  return (
    <main className="lg-wrap lg-main lg-tight lg-has-bar">
      <div className="lg-cols">
        <div className="lg-col-main">
          <div className="lg-between">
            <div className="lg-eyebrow">{t('lag.step', { n: 2 })}</div>
            <button type="button" className="lg-small lg-muted" style={{ background: 'none', border: 0, cursor: 'pointer', padding: '10px 0' }} onClick={onBack}>
              {t('lag.content.template', { name: t('lag.templates.draw.name') })} · <span className="lg-underline">{t('lag.content.change')}</span>
            </button>
          </div>
          <div className="lg-stack" style={{ gap: 8 }}>
            <h1 className="lg-h1" style={{ fontSize: 'clamp(34px, 4vw, 48px)' }}>{t('lag.draw.title')}</h1>
            <p className="lg-lead">{t('lag.draw.lead')}</p>
          </div>

          <section className="lg-card" aria-labelledby="lg-draw-basics">
            <h2 id="lg-draw-basics" className="lg-sr-only">{t('lag.draw.name')}</h2>
            <div>
              <label className="lg-label" htmlFor="lg-draw-name">{t('lag.draw.name')}</label>
              <input id="lg-draw-name" className="lg-input" value={title} maxLength={80} placeholder={t('lag.draw.namePlaceholder')} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="lg-stack" style={{ gap: 8 }}>
              <label className="lg-label" htmlFor="lg-draw-count" style={{ marginBottom: 0 }}>{t('lag.draw.count')}</label>
              <div className="lg-opts-list">
                {DRAW_COUNTS.map((n) => (
                  <button key={n} type="button" className="lg-opt" aria-pressed={count === n} onClick={() => { setCount(n); setCountInput(String(n)); }}>
                    {n.toLocaleString(i18n.language)}
                  </button>
                ))}
              </div>
              <div style={{ maxWidth: 200 }}>
                <input
                  id="lg-draw-count"
                  className="lg-input"
                  type="number"
                  min={DRAW_MIN_CODES}
                  max={DRAW_MAX_CODES}
                  inputMode="numeric"
                  value={countInput}
                  onChange={(e) => { setCountInput(e.target.value); setCount(parseInt(e.target.value, 10) || 0); }}
                />
              </div>
              <span className="lg-small lg-muted">{t('lag.draw.countNote', { min: DRAW_MIN_CODES, max: DRAW_MAX_CODES.toLocaleString(i18n.language) })}</span>
            </div>
          </section>

          <section className="lg-card" aria-labelledby="lg-draw-prizes">
            <div className="lg-stack" style={{ gap: 4 }}>
              <h2 id="lg-draw-prizes" className="lg-h2">{t('lag.draw.prizes')}</h2>
              <span className="lg-small lg-muted">{t('lag.draw.prizesNote')}</span>
            </div>
            {prizes.map((prize, i) => (
              <div key={i} className="lg-draw-prize">
                <span className="lg-draw-prize-no" aria-hidden="true">{i + 1}</span>
                <div className="lg-stack" style={{ gap: 12, flex: 1, minWidth: 0 }}>
                  <div className="lg-row" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className="lg-label" htmlFor={`lg-prize-${i}`}>{t('lag.draw.prizeLabel')}</label>
                      <input id={`lg-prize-${i}`} className="lg-input" value={prize.label} maxLength={DRAW_LABEL_MAX} placeholder={t('lag.draw.prizeLabelPlaceholder')} onChange={(e) => setPrize(i, { label: e.target.value })} />
                    </div>
                    <div style={{ width: 96 }}>
                      <label className="lg-label" htmlFor={`lg-prize-count-${i}`}>{t('lag.draw.prizeCount')}</label>
                      <input id={`lg-prize-count-${i}`} className="lg-input" type="number" min={1} inputMode="numeric" value={prize.count || ''} onChange={(e) => setPrize(i, { count: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                    </div>
                  </div>
                  <div>
                    <label className="lg-label" htmlFor={`lg-prize-msg-${i}`}>{t('lag.draw.prizeMessage')}</label>
                    <textarea id={`lg-prize-msg-${i}`} className="lg-textarea" style={{ minHeight: 72 }} maxLength={200} value={prize.message} placeholder={t('lag.draw.prizeMessagePlaceholder')} onChange={(e) => setPrize(i, { message: e.target.value })} />
                  </div>
                  <Pictures files={prize.files} onChange={(files) => setPrize(i, { files })} label={t('lag.draw.addPicture')} />
                </div>
                {prizes.length > 1 && (
                  <button type="button" className="lg-icon-btn" aria-label={t('lag.draw.removePrize', { n: i + 1 })} onClick={() => setPrizes((list) => list.filter((_, j) => j !== i))}>×</button>
                )}
              </div>
            ))}
            {prizes.length < DRAW_MAX_PRIZES && (
              <button type="button" className="lg-btn lg-btn-dashed" style={{ alignSelf: 'flex-start' }} onClick={() => setPrizes((list) => [...list, newPrize()])}>
                {t('lag.draw.addPrize')}
              </button>
            )}
          </section>

          <section className="lg-card" aria-labelledby="lg-draw-noprize">
            <div className="lg-stack" style={{ gap: 4 }}>
              <h2 id="lg-draw-noprize" className="lg-h2">{t('lag.draw.noPrize')}</h2>
              <span className="lg-small lg-muted">{t('lag.draw.noPrizeNote')}</span>
            </div>
            <textarea className="lg-textarea" style={{ minHeight: 72 }} maxLength={200} value={noPrizeText} aria-label={t('lag.draw.noPrize')} onChange={(e) => setNoPrizeText(e.target.value)} />
            <Pictures files={noPrizeFiles} onChange={setNoPrizeFiles} label={t('lag.draw.addPicture')} />
          </section>

          <section className="lg-card" aria-labelledby="lg-draw-end" style={{ gap: 12 }}>
            <h2 id="lg-draw-end" className="lg-h2">{t('lag.draw.end')}</h2>
            <div className="lg-opts-list">
              {(hasFiles ? DRAW_ENDS_WITH_FILES : DRAW_ENDS).map((v) => (
                <button key={v} type="button" className="lg-opt" aria-pressed={realEnd === v} onClick={() => setEnd(v)}>
                  {t(`lag.series.end.${v}`)}
                </button>
              ))}
            </div>
            <span className="lg-small lg-muted">{t('lag.draw.endNote')}</span>
          </section>
        </div>

        <aside className="lg-col-side lg-sticky lg-aside" aria-label={t('lag.preview.title')}>
          <div className="lg-draw-ticket" aria-hidden="true">
            <span className="lg-draw-ticket-head">{title.trim() || t('lag.templates.draw.name')}</span>
            <span className="lg-draw-ticket-grid">
              {Array.from({ length: 12 }, (_, i) => <span key={i} className={i === 4 || i === 9 ? 'is-win' : ''} />)}
            </span>
          </div>
          <div className="lg-badges">
            <span className="lg-badge">{t('lag.draw.summary', { count: count.toLocaleString(i18n.language), prizes: prizeCodes })}</span>
            {odds && <span className="lg-badge">{t('lag.draw.odds', { n: odds })}</span>}
            <span className="lg-badge">{t(`lag.series.end.${realEnd}`)}</span>
          </div>

          <div className="lg-price">
            <strong>{t('lag.preview.price', { kr: cost })}</strong>
            {user && coins !== null && <span className="lg-xs lg-muted">{t('lag.preview.balance', { kr: coins })}</span>}
          </div>
          <span className="lg-xs lg-muted">{t('lag.draw.priceNote', { per100: SERIES_KR_PER_100, perGb: KR_PER_GB.toLocaleString(i18n.language) })}</span>
          {badCount && <span className="lg-warn">{t('lag.draw.errors.count', { min: DRAW_MIN_CODES, max: DRAW_MAX_CODES })}</span>}
          {!badCount && tooManyPrizes && <span className="lg-warn">{t('lag.draw.errors.tooManyPrizes')}</span>}
          {tooLarge && <span className="lg-warn">{t('lag.errors.tooLarge', { max: '20 MB' })}</span>}
          {tooMuchTraffic && <span className="lg-warn">{t('lag.draw.errors.traffic')}</span>}
          {notEnough && (
            <span className="lg-warn">
              {t('lag.preview.notEnough')}{' '}
              <button type="button" className="lg-link" onClick={() => setShopOpen(true)}>{t('nav.buyCoins')}</button>
            </span>
          )}

          <label className="lg-check" style={{ fontSize: 14, alignItems: 'flex-start' }}>
            <input id="lg-terms" type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} style={{ marginTop: 1 }} />
            <span>
              {t('lag.preview.terms')}{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="lg-underline">{t('lag.preview.termsLink')}</a>
            </span>
          </label>

          {!user ? (
            <>
              <button type="button" className="lg-btn lg-btn-primary" onClick={() => signInWithGoogle().catch(() => toast.error(t('common.loginError')))}>
                {t('common.login')}
              </button>
              <span className="lg-xs lg-muted" style={{ textAlign: 'center' }}>{t('lag.draw.loginToCreate')}</span>
            </>
          ) : (
            <button type="button" className="lg-btn lg-btn-primary" disabled={creating || !acceptedTerms || blocked} onClick={handleCreate}>
              {createLabel}
            </button>
          )}
          <span className="lg-xs lg-muted" style={{ textAlign: 'center' }}>{t('lag.preview.encrypted')}</span>
        </aside>
      </div>

      <div className="lg-bar">
        <div className="lg-stack" style={{ gap: 0 }}>
          <strong style={{ fontSize: 16 }}>{t('lag.preview.price', { kr: cost })}</strong>
          {user && coins !== null && <span className="lg-xs lg-muted">{t('lag.preview.balance', { kr: coins })}</span>}
        </div>
        <button
          type="button"
          className="lg-btn lg-btn-primary"
          disabled={creating || (!!user && blocked)}
          onClick={() => {
            if (!user) {
              signInWithGoogle().catch(() => toast.error(t('common.loginError')));
            } else if (!acceptedTerms) {
              const terms = document.getElementById('lg-terms');
              terms?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              terms?.focus({ preventScroll: true });
              toast.error(t('lag.errors.terms'));
            } else {
              handleCreate();
            }
          }}
        >
          {!user ? t('common.login') : createLabel}
        </button>
      </div>

      <Dialog open={shopOpen} onOpenChange={setShopOpen}>
        <DialogContent className="bg-white" style={{ borderRadius: 0 }}>
          <DialogHeader>
            <DialogTitle>{t('nav.buyCoins')}</DialogTitle>
          </DialogHeader>
          <CoinShop />
        </DialogContent>
      </Dialog>
    </main>
  );
}
