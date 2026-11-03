import { useTranslation } from 'react-i18next';
import type { SeriesData } from '../../utils/api-client';
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
        const name = s.title || t('keyring.series.untitled');
        return (
          <div key={s.id} className="lg-key" style={{ cursor: 'default' }}>
            <span className="lg-key-mark lg-tone-ink" aria-hidden="true">#</span>
            <span className="lg-key-body">
              <span className="lg-key-name">{name}</span>
              <span className="lg-small lg-muted">
                {t('keyring.series.opened', { opened: s.opened.toLocaleString(i18n.language), count: s.codeCount.toLocaleString(i18n.language) })}
                {' · '}{timesLabel(t, s.maxScans, 'lag.short.times')}
                {' · '}{t(`lag.series.lifetimeShort.${lifetimeKey(s.lifetimeMs)}`)}
              </span>
              <span className="lg-xs lg-muted">{t('keyring.series.endsAt', { date: formatActivationDate(new Date(s.expiresAt), i18n.language) })}</span>
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
