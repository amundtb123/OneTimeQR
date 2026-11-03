import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner@2.0.3';
import { useAuth } from '../../utils/auth-context';
import { defaultActivationDate, formatActivationDate, fromLocalInputValue, maxActivationDate, toLocalInputValue } from '../../utils/activation';
import { EXPIRY, MODE, TIMES, WHO, timesLabel, type Rules } from './rules';
import { KeyPreview, PREVIEW_URL, STYLE_PRESETS, type StylePreset } from './key-preview';
import { QrStylePicker } from '../qr-style-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { draftCost, type Draft } from './create-flow';
import { FREE_FILE_SIZE, FREE_TRAFFIC_PER_MONTH_GB, KR_PER_GB, MIN_PRICE_KR } from '../../utils/create-drop';
import { CoinShop } from '../coin-shop';
import { wasShrunk } from '../../utils/shrink-image';
import { SERIES_COUNTS, SERIES_ENDS, SERIES_KR_PER_100, SERIES_LIFETIMES, SERIES_MAX_CODES, SERIES_MAX_OPENS, SERIES_MIN_CODES } from '../../utils/create-series';

type Token = 'times' | 'who' | 'opens' | 'expiry' | 'mode' | 'lifetime' | 'end';

// A series is printed, so the key travels in each code's link; a password is the only extra lock
const SERIES_WHO = WHO.filter((v) => v === 'code' || v === 'password');

interface StepRulesProps {
  draft: Draft;
  update: (changes: Partial<Draft>) => void;
  addFiles: (files: File[]) => void;
  acceptedTerms: boolean;
  setAcceptedTerms: (accepted: boolean) => void;
  creating: boolean;
  onCreate: () => void;
  onBack: () => void;
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
};

const fileKind = (file: File) => (file.name.split('.').pop() || file.type.split('/')[1] || '').slice(0, 4).toUpperCase();

export function StepRules({ draft, update, addFiles, acceptedTerms, setAcceptedTerms, creating, onCreate, onBack }: StepRulesProps) {
  const { t, i18n } = useTranslation();
  const { user, coins, signInWithGoogle } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<Token | null>(null);
  const [more, setMore] = useState(false);
  const [showText, setShowText] = useState(!!draft.text);
  const [showLink, setShowLink] = useState(draft.urls.length > 0);
  const [link, setLink] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  // An own number of opens: the field stays while it is in use, even if the number matches a preset
  const [customTimes, setCustomTimes] = useState(!TIMES.includes(draft.rules.times));
  const [timesInput, setTimesInput] = useState(String(draft.rules.times === 'inf' ? '' : draft.rules.times));

  const { rules } = draft;
  const setRules = (changes: Partial<Rules>) => update({ rules: { ...rules, ...changes } });
  const series = draft.template === 'series';
  const setSeries = (changes: Partial<Draft['series']>) => update({ series: { ...draft.series, ...changes } });
  const [countInput, setCountInput] = useState(String(draft.series.count));

  // Thumbnails for pictures, released when they leave the list
  useEffect(() => {
    const next: Record<string, string> = {};
    draft.files.forEach((file, i) => {
      if (file.type.startsWith('image/')) next[`${i}:${file.name}`] = URL.createObjectURL(file);
    });
    setThumbs(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [draft.files]);

  const addLink = () => {
    const value = link.trim();
    if (!value) return;
    try {
      new URL(value);
      update({ urls: [...draft.urls, value] });
      setLink('');
    } catch {
      toast.error(t('upload.invalidUrl'));
    }
  };

  const { cost, needsLogin, hasFiles, maxOpens: maxTimes, tooManyOpens, tooLarge, tooMuchTraffic, badCount } = draftCost(draft, !!user);
  const [shopOpen, setShopOpen] = useState(false);
  const blockedByLogin = !user && needsLogin;
  const notEnough = !!user && cost > 0 && coins !== null && coins < cost;
  const opensDate = rules.opensAt ? fromLocalInputValue(rules.opensAt) : null;
  const opensLabel = opensDate ? formatActivationDate(opensDate, i18n.language) : '';

  const token = (key: Token, label: string) => (
    <button
      type="button"
      className="lg-token"
      aria-expanded={open === key}
      onClick={() => setOpen(open === key ? null : key)}
    >
      {label}
    </button>
  );

  const option = (key: string, label: string, pressed: boolean, pick: () => void) => (
    <button key={key} type="button" className="lg-opt" aria-pressed={pressed} onClick={() => { pick(); setOpen(null); }}>
      {label}
    </button>
  );

  const options = () => {
    switch (open) {
      case 'times':
        return [
          // Files are downloaded again on every open, so bigger files can be opened fewer times
          ...TIMES.filter((v) => (series ? v !== 'inf' && v <= SERIES_MAX_OPENS : !hasFiles || (v !== 'inf' && v <= maxTimes))).map((v) => option(String(v), timesLabel(t, v, 'lag.rules.times'), !customTimes && rules.times === v, () => {
            setCustomTimes(false);
            setRules({ times: v });
          })),
          option('custom', t('lag.rules.times.custom'), customTimes, () => {
            setCustomTimes(true);
            setTimesInput(rules.times === 'inf' ? '' : String(rules.times));
          }),
        ];
      case 'who':
        return (series ? SERIES_WHO : WHO).map((v) => option(v, t(`lag.rules.who.${v}`), rules.who === v, () => setRules({ who: v })));
      case 'opens':
        return [
          option('now', t('lag.rules.opens.now'), !rules.opensAt, () => setRules({ opensAt: null })),
          option('later', t('lag.rules.opens.later'), !!rules.opensAt, () => setRules({ opensAt: rules.opensAt || toLocalInputValue(defaultActivationDate()) })),
        ];
      case 'expiry':
        return EXPIRY.map((v) => option(v, t(`lag.rules.expiry.${v}`), rules.expiry === v, () => setRules({ expiry: v })));
      case 'mode':
        return MODE.map((v) => option(v, t(`lag.rules.mode.${v}`), rules.mode === v, () => setRules({ mode: v })));
      case 'lifetime':
        return SERIES_LIFETIMES.map((v) => option(v, t(`lag.series.lifetime.${v}`), draft.series.lifetime === v, () => setSeries({ lifetime: v })));
      case 'end':
        return SERIES_ENDS.map((v) => option(v, t(`lag.series.end.${v}`), draft.series.end === v, () => setSeries({ end: v })));
      default:
        return null;
    }
  };

  const badges = series ? [
    t('lag.series.badges.count', { count: draft.series.count.toLocaleString(i18n.language) }),
    timesLabel(t, rules.times, 'lag.preview.badges.times'),
    rules.who === 'password' && t('lag.preview.badges.password'),
    t(`lag.series.badges.lifetime.${draft.series.lifetime}`),
    rules.mode === 'view' && t('lag.preview.badges.view'),
  ].filter(Boolean) as string[] : [
    timesLabel(t, rules.times, 'lag.preview.badges.times'),
    rules.who === 'two' && t('lag.preview.badges.two'),
    rules.who === 'password' && t('lag.preview.badges.password'),
    opensDate && t('lag.preview.badges.opens', { date: opensLabel }),
    t(`lag.preview.badges.expiry.${rules.expiry}`),
    rules.mode === 'view' && t('lag.preview.badges.view'),
  ].filter(Boolean) as string[];

  const pickPreset = (preset: Exclude<StylePreset, 'custom'>) => update({ preset, style: STYLE_PRESETS[preset] });

  return (
    <main className="lg-wrap lg-main lg-tight lg-has-bar">
      <div className="lg-cols">
        <div className="lg-col-main">
          <div className="lg-between">
            <div className="lg-eyebrow">{t('lag.step', { n: 2 })}</div>
            <button type="button" className="lg-small lg-muted" style={{ background: 'none', border: 0, cursor: 'pointer', padding: '10px 0' }} onClick={onBack}>
              {t('lag.content.template', { name: t(`lag.templates.${draft.template}.name`) })} · <span className="lg-underline">{t('lag.content.change')}</span>
            </button>
          </div>

          <section className="lg-card" aria-labelledby="lg-content-title">
            <h2 id="lg-content-title" className="lg-h2">{t('lag.content.title')}</h2>

            <div>
              <label className="lg-label" htmlFor="lg-name">{t('lag.content.name')}</label>
              <input id="lg-name" className="lg-input" value={draft.title} maxLength={80} placeholder={t('lag.content.namePlaceholder')} onChange={(e) => update({ title: e.target.value })} />
            </div>

            {draft.files.length > 0 && (
              <div className="lg-stack" style={{ gap: 8 }}>
                {draft.files.map((file, i) => (
                  <div className="lg-file" key={`${i}:${file.name}`}>
                    <div className="lg-file-kind">
                      {thumbs[`${i}:${file.name}`] ? <img src={thumbs[`${i}:${file.name}`]} alt="" /> : fileKind(file)}
                    </div>
                    <div className="lg-file-name">
                      <span>{file.name}</span>
                      <span className="lg-xs lg-muted">{formatSize(file.size)}{wasShrunk(file) && ` · ${t('lag.content.shrunk')}`}</span>
                    </div>
                    <button type="button" className="lg-icon-btn" aria-label={t('lag.content.remove', { name: file.name })} onClick={() => update({ files: draft.files.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
              </div>
            )}

            {showText && (
              <div>
                <label className="lg-label" htmlFor="lg-text">{t('lag.content.text')}</label>
                <textarea id="lg-text" className="lg-textarea" maxLength={200} value={draft.text} placeholder={t('lag.content.textPlaceholder')} onChange={(e) => update({ text: e.target.value })} />
                <div className="lg-xs lg-muted" style={{ textAlign: 'right' }}>{draft.text.length}/200</div>
              </div>
            )}

            {showLink && (
              <div className="lg-stack" style={{ gap: 8 }}>
                <label className="lg-label" htmlFor="lg-link" style={{ marginBottom: 0 }}>{t('lag.content.link')}</label>
                {draft.urls.map((url, i) => (
                  <div className="lg-file" key={`${i}:${url}`}>
                    <div className="lg-file-kind">URL</div>
                    <div className="lg-file-name"><span>{url}</span></div>
                    <button type="button" className="lg-icon-btn" aria-label={t('lag.content.remove', { name: url })} onClick={() => update({ urls: draft.urls.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <div className="lg-row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                  <input
                    id="lg-link"
                    className="lg-input"
                    type="url"
                    inputMode="url"
                    value={link}
                    placeholder={t('lag.content.linkPlaceholder')}
                    onChange={(e) => setLink(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                  />
                  <button type="button" className="lg-btn" onClick={addLink}>{t('lag.content.add')}</button>
                </div>
              </div>
            )}

            <div className="lg-row" style={{ gap: 8 }}>
              <button type="button" className="lg-btn lg-btn-dashed" onClick={() => fileInput.current?.click()}>{t('lag.content.addFile')}</button>
              {!showText && <button type="button" className="lg-btn lg-btn-dashed" onClick={() => setShowText(true)}>{t('lag.content.addText')}</button>}
              {!showLink && <button type="button" className="lg-btn lg-btn-dashed" onClick={() => setShowLink(true)}>{t('lag.content.addLink')}</button>}
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,.doc,.docx,.txt"
              className="lg-sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
            />
            {!user && <p className="lg-xs lg-muted" style={{ margin: 0 }}>{t('lag.content.limitAnon')}</p>}
          </section>

          <section className="lg-card" aria-labelledby="lg-rules-title" style={{ gap: 18 }}>
            <div className="lg-between">
              <h2 id="lg-rules-title" className="lg-h2">{t('lag.rules.title')}</h2>
              <span className="lg-small lg-muted">{t('lag.rules.hint')}</span>
            </div>
            {series && (
              <div className="lg-stack" style={{ gap: 8 }}>
                <label className="lg-label" htmlFor="lg-count" style={{ marginBottom: 0 }}>{t('lag.series.count')}</label>
                <div className="lg-opts-list">
                  {SERIES_COUNTS.map((n) => (
                    <button key={n} type="button" className="lg-opt" aria-pressed={draft.series.count === n} onClick={() => { setSeries({ count: n }); setCountInput(String(n)); }}>
                      {n.toLocaleString(i18n.language)}
                    </button>
                  ))}
                </div>
                <div style={{ maxWidth: 260 }}>
                  <input
                    id="lg-count"
                    className="lg-input"
                    type="number"
                    min={SERIES_MIN_CODES}
                    max={SERIES_MAX_CODES}
                    inputMode="numeric"
                    value={countInput}
                    onChange={(e) => {
                      setCountInput(e.target.value);
                      setSeries({ count: parseInt(e.target.value, 10) || 0 });
                    }}
                  />
                </div>
                <span className="lg-small lg-muted">{t('lag.series.countNote', { min: SERIES_MIN_CODES, max: SERIES_MAX_CODES.toLocaleString(i18n.language) })}</span>
              </div>
            )}

            {series ? (
              <p className="lg-sentence">
                {t('lag.series.canOpen')} {token('times', timesLabel(t, rules.times, 'lag.rules.times'))}{' '}
                {t('lag.rules.by')} {token('who', t(`lag.rules.who.${rules.who}`))},{' '}
                {token('lifetime', t(`lag.series.lifetime.${draft.series.lifetime}`))}{' '}
                {t('lag.series.fromFirstScan')},{' '}
                {t('lag.rules.and')} {token('mode', t(`lag.rules.mode.${rules.mode}`))}.{' '}
                {t('lag.series.worksFor')} {token('end', t(`lag.series.end.${draft.series.end}`))}.
              </p>
            ) : (
            <p className="lg-sentence">
              {t('lag.rules.canOpen')} {token('times', timesLabel(t, rules.times, 'lag.rules.times'))}{' '}
              {t('lag.rules.by')} {token('who', t(`lag.rules.who.${rules.who}`))}{' '}
              {token('opens', rules.opensAt ? t('lag.rules.opensAt', { date: opensLabel }) : t('lag.rules.opensNow'))},{' '}
              {token('expiry', t(`lag.rules.expiry.${rules.expiry}`))},{' '}
              {t('lag.rules.and')} {token('mode', t(`lag.rules.mode.${rules.mode}`))}.
            </p>
            )}

            {open && (
              <div className="lg-opts">
                <span className="lg-small" style={{ fontWeight: 600 }}>{t(`lag.rules.question.${open}`)}</span>
                <div className="lg-opts-list">{options()}</div>
                {open === 'who' && <span className="lg-small lg-muted">{t(`lag.rules.whoNote.${rules.who}`)}</span>}
                {open === 'opens' && <span className="lg-small lg-muted">{t('lag.rules.opensNote')}</span>}
                {open === 'lifetime' && <span className="lg-small lg-muted">{t('lag.series.lifetimeNote')}</span>}
                {open === 'end' && <span className="lg-small lg-muted">{t('lag.series.endNote')}</span>}
              </div>
            )}

            {customTimes && (
              <div style={{ maxWidth: 260 }}>
                <label className="lg-label" htmlFor="lg-times">{t('lag.rules.timesCustom')}</label>
                <input
                  id="lg-times"
                  className="lg-input"
                  type="number"
                  min="1"
                  max={series ? SERIES_MAX_OPENS : maxTimes}
                  inputMode="numeric"
                  value={timesInput}
                  onChange={(e) => {
                    setTimesInput(e.target.value);
                    const n = parseInt(e.target.value, 10);
                    if (n >= 1) setRules({ times: Math.min(n, series ? SERIES_MAX_OPENS : maxTimes) });
                  }}
                />
              </div>
            )}

            {rules.who === 'password' && (
              <div>
                <label className="lg-label" htmlFor="lg-password">{t('lag.rules.password')}</label>
                <input id="lg-password" className="lg-input" type="password" autoComplete="new-password" value={draft.password} placeholder={t('lag.rules.passwordPlaceholder')} onChange={(e) => update({ password: e.target.value })} />
              </div>
            )}

            {rules.opensAt && (
              <div>
                <label className="lg-label" htmlFor="lg-opens">{t('activation.dateLabel')}</label>
                <input
                  id="lg-opens"
                  className="lg-input"
                  type="datetime-local"
                  value={rules.opensAt}
                  min={toLocalInputValue(new Date())}
                  max={toLocalInputValue(maxActivationDate())}
                  onChange={(e) => setRules({ opensAt: e.target.value || null })}
                />
              </div>
            )}

            {!series && <button type="button" className="lg-link" style={{ alignSelf: 'flex-start', color: 'var(--lg-ink)', padding: '10px 0' }} aria-expanded={more} onClick={() => setMore(!more)}>
              {more ? t('lag.rules.less') : t('lag.rules.more')}
            </button>}
            {more && !series && (
              <div className="lg-more">
                <label className="lg-check">
                  <input type="checkbox" checked={draft.noPreview} onChange={(e) => update({ noPreview: e.target.checked })} />
                  {t('lag.rules.noPreview')}
                </label>
                <div style={{ maxWidth: 260 }}>
                  <label className="lg-label" htmlFor="lg-maxdl">{t('lag.rules.maxDownloads')}</label>
                  <input id="lg-maxdl" className="lg-input" type="number" min="1" inputMode="numeric" value={draft.maxDownloads} placeholder={t('lag.rules.maxDownloadsPlaceholder')} onChange={(e) => update({ maxDownloads: e.target.value })} />
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="lg-col-side lg-sticky lg-aside" aria-label={t('lag.preview.title')}>
          <div className="lg-between" style={{ alignItems: 'center' }}>
            <span className="lg-small lg-muted" style={{ fontWeight: 600 }}>{t('lag.preview.title')}</span>
            <span className="lg-chip lg-chip-blue">{t('lag.preview.sealed')}</span>
          </div>

          <KeyPreview style={draft.style} two={rules.who === 'two'} locked={rules.who === 'password'} />

          <div className="lg-stack" style={{ gap: 8 }}>
            <span className="lg-xs lg-muted" style={{ fontWeight: 600, textAlign: 'center' }}>{t('lag.preview.style')}</span>
            <div className="lg-styles">
              {(Object.keys(STYLE_PRESETS) as Array<Exclude<StylePreset, 'custom'>>).map((preset) => (
                <button key={preset} type="button" className="lg-style" aria-pressed={draft.preset === preset} onClick={() => pickPreset(preset)}>
                  <span className="lg-swatch" style={{ background: STYLE_PRESETS[preset].backgroundColor, boxShadow: `inset 0 0 0 4px ${STYLE_PRESETS[preset].backgroundColor}, inset 0 0 0 8px ${STYLE_PRESETS[preset].dotsColor}` }} />
                  {t(`lag.preview.styles.${preset}`)}
                </button>
              ))}
              <button type="button" className="lg-style" aria-pressed={draft.preset === 'custom'} onClick={() => setCustomOpen(true)}>
                {t('lag.preview.custom')}
              </button>
            </div>
          </div>

          <div className="lg-badges">
            {badges.map((b) => <span key={b} className="lg-badge">{b}</span>)}
          </div>

          <div className="lg-price">
            <strong>{cost === 0 ? t('lag.preview.free') : t('lag.preview.price', { kr: cost })}</strong>
            {user && coins !== null && <span className="lg-xs lg-muted">{t('lag.preview.balance', { kr: coins })}</span>}
          </div>
          {series && <span className="lg-xs lg-muted">{t('lag.series.priceNote', { per100: SERIES_KR_PER_100, perGb: KR_PER_GB.toLocaleString(i18n.language) })}</span>}
          {!series && cost > 0 && <span className="lg-xs lg-muted">{t('lag.preview.priceNote', { free: FREE_FILE_SIZE / (1024 * 1024), perGb: KR_PER_GB.toLocaleString(i18n.language), min: MIN_PRICE_KR })}</span>}
          {cost === 0 && user && hasFiles && <span className="lg-xs lg-muted">{t('lag.preview.freeNote', { free: FREE_FILE_SIZE / (1024 * 1024), month: FREE_TRAFFIC_PER_MONTH_GB })}</span>}
          {tooLarge && <span className="lg-warn">{t('lag.errors.tooLarge', { max: '20 MB' })}</span>}
          {tooManyOpens && !series && <span className="lg-warn">{t('lag.errors.tooManyOpens', { max: maxTimes })}</span>}
          {badCount && <span className="lg-warn">{t('lag.series.errors.count', { min: SERIES_MIN_CODES, max: SERIES_MAX_CODES })}</span>}
          {tooMuchTraffic && <span className="lg-warn">{t('lag.series.errors.traffic')}</span>}
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

          {blockedByLogin ? (
            <>
              <button type="button" className="lg-btn lg-btn-primary" onClick={() => signInWithGoogle().catch(() => toast.error(t('common.loginError')))}>
                {t('common.login')}
              </button>
              <span className="lg-xs lg-muted" style={{ textAlign: 'center' }}>{series ? t('lag.series.loginToCreate') : t('lag.preview.loginToPay')}</span>
            </>
          ) : (
            <button type="button" className="lg-btn lg-btn-primary" disabled={creating || !acceptedTerms || notEnough || tooManyOpens || tooLarge || tooMuchTraffic || badCount} onClick={onCreate}>
              {creating ? t('lag.preview.creating') : series ? t('lag.series.create', { count: draft.series.count.toLocaleString(i18n.language) }) : t('lag.preview.create')}
            </button>
          )}
          <span className="lg-xs lg-muted" style={{ textAlign: 'center' }}>{t('lag.preview.encrypted')}</span>
        </aside>
      </div>

      <div className="lg-bar">
        <div className="lg-stack" style={{ gap: 0 }}>
          <strong style={{ fontSize: 16 }}>{cost === 0 ? t('lag.preview.free') : t('lag.preview.price', { kr: cost })}</strong>
          {user && coins !== null && <span className="lg-xs lg-muted">{t('lag.preview.balance', { kr: coins })}</span>}
        </div>
        <button
          type="button"
          className="lg-btn lg-btn-primary"
          disabled={creating || (!blockedByLogin && (notEnough || tooManyOpens || tooLarge || tooMuchTraffic || badCount))}
          onClick={() => {
            if (blockedByLogin) {
              signInWithGoogle().catch(() => toast.error(t('common.loginError')));
            } else if (!acceptedTerms) {
              // The terms live in the preview card further down
              const terms = document.getElementById('lg-terms');
              terms?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              terms?.focus({ preventScroll: true });
              toast.error(t('lag.errors.terms'));
            } else {
              onCreate();
            }
          }}
        >
          {blockedByLogin ? t('common.login') : creating ? t('lag.preview.creating') : series ? t('lag.series.create', { count: draft.series.count.toLocaleString(i18n.language) }) : t('lag.preview.create')}
        </button>
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="bg-white overflow-y-auto" style={{ maxHeight: '90vh', maxWidth: 'min(720px, calc(100% - 2rem))', borderRadius: 0 }}>
          <DialogHeader>
            <DialogTitle>{t('lag.preview.customTitle')}</DialogTitle>
          </DialogHeader>
          <QrStylePicker style={draft.style} onChange={(style) => update({ style, preset: 'custom' })} qrUrl={PREVIEW_URL} />
          <button type="button" className="lg-btn lg-btn-ink" onClick={() => setCustomOpen(false)}>{t('lag.preview.done')}</button>
        </DialogContent>
      </Dialog>

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
