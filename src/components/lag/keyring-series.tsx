import { useTranslation } from 'react-i18next';
import { toast } from 'sonner@2.0.3';
import { newDisplayToken, type SeriesData } from '../../utils/api-client';
import { boardUrl, drawScreenOnThisDevice } from '../../utils/create-draw';
import { formatActivationDate } from '../../utils/activation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { timesLabel } from './rules';
import { lifetimeKey } from './step-series-ready';

interface KeyringSeriesProps {
  series: SeriesData[];
  onDelete: (id: string) => void;
}

// The owner's series: how many codes have been opened. The codes' links hold the key and were
// only shown when the series was made, so there is nothing to copy or download here.
export function KeyringSeries({ series, onDelete }: KeyringSeriesProps) {
  const { t, i18n } = useTranslation();
  if (series.length === 0) return null;

  return (
    <section className="lg-stack" style={{ gap: 8 }} aria-labelledby="lg-series-title">
      <h2 id="lg-series-title" className="lg-h2" style={{ fontSize: 20 }}>{t('keyring.series.title')}</h2>
      {series.map((s) => {
        const isDraw = s.kind === 'draw';
        const name = s.title || t(isDraw ? 'keyring.series.drawUntitled' : 'keyring.series.untitled');
        const prizeCount = (s.prizes ?? []).reduce((sum, p) => sum + p.count, 0);
        return (
          <div key={s.id} className="lg-key" style={{ cursor: 'default' }}>
            <span className={`lg-key-mark ${isDraw ? 'lg-tone-blue' : 'lg-tone-ink'}`} aria-hidden="true">{isDraw ? '★' : '#'}</span>
            <span className="lg-key-body">
              <span className="lg-key-name">{name}</span>
              {isDraw ? (
                <span className="lg-small lg-muted">
                  {t('keyring.series.drawOpened', { opened: s.opened.toLocaleString(i18n.language), count: s.codeCount.toLocaleString(i18n.language) })}
                  {' · '}{t('keyring.series.drawPrizes', { count: prizeCount })}
                  {(s.rounds ?? 1) > 1 ? <>{' · '}{t('keyring.series.drawRounds', { count: s.rounds })}</> : null}
                  {s.maxPerPerson ? <>{' · '}{t('keyring.series.drawPerPerson', { count: s.maxPerPerson })}</> : null}
                  {s.cooldownMs ? <>{' · '}{t('keyring.series.drawCooldown', { wait: s.cooldownMs >= 3_600_000 ? `${Math.round(s.cooldownMs / 3_600_000)} t` : `${Math.round(s.cooldownMs / 60_000)} min` })}</> : null}
                </span>
              ) : (
                <span className="lg-small lg-muted">
                  {t('keyring.series.opened', { opened: s.opened.toLocaleString(i18n.language), count: s.codeCount.toLocaleString(i18n.language) })}
                  {' · '}{timesLabel(t, s.maxScans, 'lag.short.times')}
                  {' · '}{t(`lag.series.lifetimeShort.${lifetimeKey(s.lifetimeMs)}`)}
                </span>
              )}
              <span className="lg-xs lg-muted">{t('keyring.series.endsAt', { date: formatActivationDate(new Date(s.expiresAt), i18n.language) })}</span>
              {isDraw && (
                <span className="lg-row" style={{ gap: 8, marginTop: 6 }}>
                  {/* The owner sees the board with their login. On the device the draw was made on, the
                      board also gets the tickets' key, so it can hand out the tickets. */}
                  <a className="lg-btn" style={{ minHeight: 36, padding: '6px 12px' }} href={(() => {
                    const local = drawScreenOnThisDevice(s.id);
                    return boardUrl(s.id, undefined, local?.key, local?.handout);
                  })()} target="_blank" rel="noopener noreferrer">{t('keyring.series.board')} ↗</a>
                  <button
                    type="button"
                    className="lg-btn"
                    style={{ minHeight: 36, padding: '6px 12px' }}
                    onClick={async () => {
                      try {
                        const { displayToken } = await newDisplayToken(s.id);
                        await navigator.clipboard.writeText(boardUrl(s.id, displayToken));
                        toast.success(t('keyring.series.screenLinkCopied'));
                      } catch {
                        toast.error(t('lag.series.ready.exportFailed'));
                      }
                    }}
                  >
                    {t('keyring.series.newScreenLink')}
                  </button>
                </span>
              )}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className="lg-btn lg-btn-danger" style={{ minHeight: 40, padding: '8px 12px' }}>{t('keyring.revoke')}</button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-white" style={{ borderRadius: 0 }}>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('keyring.revokeTitle', { name })}</AlertDialogTitle>
                  <AlertDialogDescription>{t('keyring.series.revokeBody', { count: s.codeCount })}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel style={{ borderRadius: 0 }}>{t('keyring.cancel')}</AlertDialogCancel>
                  <AlertDialogAction style={{ borderRadius: 0, background: '#B42318', color: '#FFFFFF' }} onClick={() => onDelete(s.id)}>
                    {t('keyring.revoke')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      })}
    </section>
  );
}
