import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner@2.0.3';
import { useAuth } from '../../utils/auth-context';
import { KR_PER_GB, MAX_SIZE_LOGGED_IN } from '../../utils/create-drop';
import { SERIES_KR_PER_100, type SeriesEnd } from '../../utils/create-series';
import {
  createDraw, drawPriceKr, drawTooMuchTraffic, DRAW_COUNTS, DRAW_ENDS, DRAW_ENDS_WITH_FILES, DRAW_LABEL_MAX,
  DRAW_COOLDOWNS, DRAW_ROUND_CHOICES, DRAW_ROUND_INTERVALS, DRAW_ROUND_INTERVAL_MS, DRAW_MAX_ROUNDS, type DrawRoundInterval, DRAW_GRID_MAX, DRAW_PER_PERSON_CHOICES, type DrawCooldown, DRAW_MAX_CODES, DRAW_MAX_PRIZES, DRAW_MIN_CODES, type CreatedDraw, type DrawHandout, type DrawPrize,
} from '../../utils/create-draw';
import { STYLE_PRESETS } from './key-preview';
import { fromLocalInputValue, toLocalInputValue } from '../../utils/activation';
import { SERIES_ENDS_MS_CLIENT } from '../../utils/create-draw';
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
  const [handout, setHandout] = useState<DrawHandout>('one');
  // Tickets per phone. Taken from a screen: one each by default. Printed: whoever holds a ticket
  // may scan it, so no limit unless the organizer sets one.
  const [perPerson, setPerPerson] = useState<number | null>(1);
  const [perPersonTouched, setPerPersonTouched] = useState(false);
  const [cooldown, setCooldown] = useState<DrawCooldown | null>(null);
  const [rounds, setRounds] = useState(1);
  const [roundsInput, setRoundsInput] = useState('1');
  const [roundInterval, setRoundInterval] = useState<DrawRoundInterval | null>(null);
  const [firstRoundAt, setFirstRoundAt] = useState<string | null>(null); // datetime-local value; null = now
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);

  const allFiles = [...noPrizeFiles, ...prizes.flatMap((p) => p.files)];
  const hasFiles = allFiles.length > 0;
  const realEnd: SeriesEnd = hasFiles ? '1mo' : end;
  const prizeCodes = prizes.reduce((sum, p) => sum + (p.count || 0), 0);
  const cost = drawPriceKr(count, noPrizeFiles, prizes, rounds);
  // Every round must start before the draw ends
  const firstAt = firstRoundAt ? fromLocalInputValue(firstRoundAt)?.getTime() ?? null : null;
  const lastRoundAt = (firstAt ?? Date.now()) + (rounds > 1 && roundInterval ? (rounds - 1) * DRAW_ROUND_INTERVAL_MS[roundInterval] : 0);
  const badRounds = !Number.isInteger(rounds) || rounds < 1 || rounds > DRAW_MAX_ROUNDS || count * rounds > DRAW_MAX_CODES;
  const roundsTooLong = lastRoundAt >= Date.now() + SERIES_ENDS_MS_CLIENT[hasFiles ? '1mo' : end];
  const badCount = !Number.isInteger(count) || count < DRAW_MIN_CODES || count > DRAW_MAX_CODES;
  const tooManyPrizes = prizeCodes >= count;
  const tooLarge = allFiles.reduce((sum, f) => sum + f.size, 0) > MAX_SIZE_LOGGED_IN;
  const tooMuchTraffic = drawTooMuchTraffic(count, noPrizeFiles, prizes, rounds);
  const notEnough = !!user && coins !== null && coins < cost;
  const gridTooBig = handout === 'grid' && count > DRAW_GRID_MAX;
  const blocked = badCount || tooManyPrizes || tooLarge || tooMuchTraffic || notEnough || gridTooBig || badRounds || roundsTooLong;

  const setPrize = (i: number, changes: Partial<DrawPrize>) => setPrizes((list) => list.map((p, j) => (j === i ? { ...p, ...changes } : p)));

  const handleCreate = async () => {
    if (!user) {
      toast.error(t('upload.mustBeLoggedIn'));
      return;
    }
    if (badCount) return toast.error(t('lag.draw.errors.count', { min: DRAW_MIN_CODES, max: DRAW_MAX_CODES }));
    if (prizes.some((p) => !p.label.trim())) return toast.error(t('lag.draw.errors.prizeLabel'));
    if (tooManyPrizes) return toast.error(t('lag.draw.errors.tooManyPrizes'));
    if (badRounds) return toast.error(t('lag.draw.errors.rounds', { max: DRAW_MAX_ROUNDS, total: DRAW_MAX_CODES }));
    if (roundsTooLong) return toast.error(t('lag.draw.errors.roundsTooLong'));
    if (gridTooBig) return toast.error(t('lag.draw.handoutGridTooMany', { max: DRAW_GRID_MAX }));
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
        handout,
        maxPerPerson: perPerson,
        cooldown,
        rounds,
        roundInterval: rounds > 1 ? roundInterval : null,
        firstRoundAt: firstAt,
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

  const createLabel = creating ? t('lag.preview.creating') : t('lag.draw.create', { count: (count * rounds).toLocaleString(i18n.language) });
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

          <section className="lg-card" aria-labelledby="lg-draw-handout" style={{ gap: 12 }}>
            <h2 id="lg-draw-handout" className="lg-h2">{t('lag.draw.handout')}</h2>
            <div className="lg-draw-handout">
              {(['one', 'grid', 'print'] as DrawHandout[]).map((option) => {
                const name = { one: 'handoutOne', grid: 'handoutGrid', print: 'handoutPrint' }[option];
                return (
                  <button key={option} type="button" className="lg-draw-handout-opt" aria-pressed={handout === option} onClick={() => {
                    setHandout(option);
                    if (!perPersonTouched) setPerPerson(option === 'print' ? null : 1);
                    // A grid shows every ticket at once, so start from a size that fits
                    if (option === 'grid' && count > DRAW_GRID_MAX) { setCount(DRAW_GRID_MAX); setCountInput(String(DRAW_GRID_MAX)); }
                  }}>
                    <strong>{t(`lag.draw.${name}`)}</strong>
                    <span>{t(`lag.draw.${name}Note`, { max: DRAW_GRID_MAX })}</span>
                  </button>
                );
              })}
            </div>
            {gridTooBig && <span className="lg-warn">{t('lag.draw.handoutGridTooMany', { max: DRAW_GRID_MAX })}</span>}
          </section>

          <section className="lg-card" aria-labelledby="lg-draw-perperson" style={{ gap: 12 }}>
            <h2 id="lg-draw-perperson" className="lg-h2">{t('lag.draw.perPerson')}</h2>
            <div className="lg-opts-list">
              {[...DRAW_PER_PERSON_CHOICES, null].map((n) => (
                <button key={String(n)} type="button" className="lg-opt" aria-pressed={perPerson === n} onClick={() => { setPerPerson(n); setPerPersonTouched(true); }}>
                  {n === null ? t('lag.draw.perPersonNone') : n}
                </button>
              ))}
            </div>
            <span className="lg-small lg-muted">{t('lag.draw.perPersonNote')}</span>
            <h3 className="lg-label" style={{ margin: '8px 0 0' }}>{t('lag.draw.cooldown')}</h3>
            <div className="lg-opts-list">
              {[null, ...DRAW_COOLDOWNS].map((v) => (
                <button key={String(v)} type="button" className="lg-opt" aria-pressed={cooldown === v} onClick={() => setCooldown(v)}>
                  {v === null ? t('lag.draw.cooldownNone') : t(`lag.draw.cooldowns.${v}`)}
                </button>
              ))}
            </div>
            <span className="lg-small lg-muted">{t('lag.draw.cooldownNote')}</span>
          </section>

          <section className="lg-card" aria-labelledby="lg-draw-rounds" style={{ gap: 12 }}>
            <div className="lg-stack" style={{ gap: 4 }}>
              <h2 id="lg-draw-rounds" className="lg-h2">{t('lag.draw.rounds')}</h2>
              <span className="lg-small lg-muted">{t('lag.draw.roundsNote')}</span>
            </div>
            <div className="lg-row" style={{ gap: 8, alignItems: 'center' }}>
              <div className="lg-opts-list">
                {DRAW_ROUND_CHOICES.map((n) => (
                  <button key={n} type="button" className="lg-opt" aria-pressed={rounds === n} onClick={() => { setRounds(n); setRoundsInput(String(n)); }}>
                    {n}
                  </button>
                ))}
              </div>
              <input
                className="lg-input"
                style={{ width: 90 }}
                type="number"
                min={1}
                max={DRAW_MAX_ROUNDS}
                inputMode="numeric"
                aria-label={t('lag.draw.rounds')}
                value={roundsInput}
                onChange={(e) => { setRoundsInput(e.target.value); setRounds(parseInt(e.target.value, 10) || 0); }}
              />
            </div>
            {rounds > 1 && (
              <>
                <h3 className="lg-label" style={{ margin: '8px 0 0' }}>{t('lag.draw.nextRound')}</h3>
                <div className="lg-opts-list">
                  {[null, ...DRAW_ROUND_INTERVALS].map((v) => (
                    <button key={String(v)} type="button" className="lg-opt" aria-pressed={roundInterval === v} onClick={() => setRoundInterval(v)}>
                      {v === null ? t('lag.draw.nextRoundSoldOut') : t(`lag.draw.roundIntervals.${v}`)}
                    </button>
                  ))}
                </div>
                <span className="lg-small lg-muted">{t(roundInterval ? 'lag.draw.nextRoundTimedNote' : 'lag.draw.nextRoundSoldOutNote')}</span>
              </>
            )}
            <h3 className="lg-label" style={{ margin: '8px 0 0' }}>{t('lag.draw.firstRound')}</h3>
            <div className="lg-opts-list">
              <button type="button" className="lg-opt" aria-pressed={!firstRoundAt} onClick={() => setFirstRoundAt(null)}>{t('lag.draw.firstRoundNow')}</button>
              <button type="button" className="lg-opt" aria-pressed={!!firstRoundAt} onClick={() => setFirstRoundAt(firstRoundAt || toLocalInputValue(new Date(Date.now() + 3_600_000)))}>{t('lag.draw.firstRoundLater')}</button>
            </div>
            {firstRoundAt && (
              <div style={{ maxWidth: 260 }}>
                <input
                  className="lg-input"
                  type="datetime-local"
                  aria-label={t('lag.draw.firstRound')}
                  value={firstRoundAt}
                  min={toLocalInputValue(new Date())}
                  max={toLocalInputValue(new Date(Date.now() + 30 * 86_400_000))}
                  onChange={(e) => setFirstRoundAt(e.target.value || null)}
                />
              </div>
            )}
            {badRounds && <span className="lg-warn">{t('lag.draw.errors.rounds', { max: DRAW_MAX_ROUNDS, total: DRAW_MAX_CODES })}</span>}
            {roundsTooLong && <span className="lg-warn">{t('lag.draw.errors.roundsTooLong')}</span>}
          </section>

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
            {perPerson && <span className="lg-badge">{t('lag.draw.perPersonBadge', { count: perPerson })}</span>}
            {rounds > 1 && <span className="lg-badge">{t('lag.draw.roundsBadge', { count: rounds })}</span>}
            {cooldown && <span className="lg-badge">{t('lag.draw.cooldownBadge', { wait: t(`lag.draw.cooldowns.${cooldown}`) })}</span>}
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
