import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner@2.0.3';
import type { QrDrop } from '../../App';
import { useAuth } from '../../utils/auth-context';
import { getFileUrl } from '../../utils/api-client';
import { copyToClipboard } from '../../utils/clipboard';
import { formatActivationDate } from '../../utils/activation';
import { ActivationEditor } from '../activation-editor';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { dropRuleLine } from './rules';
import { downloadImage, keyImages, shareLink } from './step-ready';

type KeyState = 'sealed' | 'opened' | 'invalid' | 'scheduled';

function isExpired(qrDrop: QrDrop, now: Date): boolean {
  if (qrDrop.maxScans && qrDrop.scanCount >= qrDrop.maxScans) return true;
  if (qrDrop.maxDownloads && qrDrop.downloadCount >= qrDrop.maxDownloads) return true;
  return !!qrDrop.expiryDate && qrDrop.expiryDate < now;
}

// A key that was used up counts as opened; one that ran out of time unopened is invalid
export function keyState(qrDrop: QrDrop, now = new Date()): KeyState {
  const usedUp = !!qrDrop.maxScans && qrDrop.scanCount >= qrDrop.maxScans;
  if (usedUp) return 'opened';
  if (isExpired(qrDrop, now)) return 'invalid';
  if (qrDrop.activatesAt && qrDrop.activatesAt > now) return 'scheduled';
  return qrDrop.scanCount > 0 ? 'opened' : 'sealed';
}

const CHIP: Record<KeyState, string> = {
  sealed: 'lg-chip lg-chip-blue',
  opened: 'lg-chip',
  invalid: 'lg-chip lg-chip-grey',
  scheduled: 'lg-chip lg-chip-soft',
};

const MARK: Record<KeyState, string> = {
  sealed: 'lg-tone-soft',
  opened: 'lg-tone-ink',
  invalid: 'lg-chip-grey',
  scheduled: 'lg-tone-soft',
};

const markText = (qrDrop: QrDrop) => (qrDrop.secureMode ? '2' : qrDrop.maxScans ? `${qrDrop.maxScans}×` : '∞');

type FileInfo = { fileUrl: string; fileName: string; fileType: string; fileSize: number };

interface KeyringProps {
  qrDrops: QrDrop[];
  isLoading: boolean;
  onDelete: (id: string) => void;
  onActivationChanged: (id: string, changes: { activatesAt?: Date; expiryDate?: Date }) => void;
  onCreate: () => void;
}

export function Keyring({ qrDrops, isLoading, onDelete, onActivationChanged, onCreate }: KeyringProps) {
  const { t, i18n } = useTranslation();
  const { user, signInWithGoogle } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [content, setContent] = useState<Record<string, FileInfo[] | 'loading' | 'error'>>({});
  const [showContent, setShowContent] = useState(false);

  // Keeps states and "expires" times current while the page is open
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const sorted = [...qrDrops].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const selected = sorted.find((q) => q.id === selectedId) || sorted[0];

  useEffect(() => setShowContent(false), [selected?.id]);

  const date = (d: Date) => formatActivationDate(d, i18n.language);

  if (!user) {
    return (
      <main className="lg-wrap lg-main">
        <div className="lg-empty">
          <h1 className="lg-h2">{t('keyring.loginTitle')}</h1>
          <p className="lg-muted" style={{ margin: 0 }}>{t('keyring.loginBody')}</p>
          <button type="button" className="lg-btn lg-btn-ink" onClick={() => signInWithGoogle().catch(() => toast.error(t('common.loginError')))}>
            {t('common.login')}
          </button>
        </div>
      </main>
    );
  }

  if (sorted.length === 0) {
    return (
      <main className="lg-wrap lg-main">
        <div className="lg-empty">
          <h1 className="lg-h2">{isLoading ? t('keyring.loading') : t('keyring.empty')}</h1>
          {!isLoading && (
            <>
              <p className="lg-muted" style={{ margin: 0 }}>{t('keyring.emptyBody')}</p>
              <button type="button" className="lg-btn lg-btn-ink" onClick={onCreate}>{t('keyring.makeOne')}</button>
            </>
          )}
        </div>
      </main>
    );
  }

  const counts = sorted.reduce(
    (acc, q) => {
      const s = keyState(q, now);
      acc[s === 'scheduled' ? 'sealed' : s] += 1;
      return acc;
    },
    { sealed: 0, opened: 0, invalid: 0 },
  );

  const toggleContent = async () => {
    if (!selected) return;
    const next = !showContent;
    setShowContent(next);
    if (!next || content[selected.id]) return;
    setContent((c) => ({ ...c, [selected.id]: 'loading' }));
    try {
      const res = await getFileUrl(selected.id);
      const files: FileInfo[] = res.files && Array.isArray(res.files)
        ? res.files
        : res.fileUrl
          ? [{ fileUrl: res.fileUrl, fileName: res.fileName || 'file', fileType: res.fileType || 'application/octet-stream', fileSize: res.fileSize || 0 }]
          : [];
      setContent((c) => ({ ...c, [selected.id]: files }));
    } catch {
      setContent((c) => ({ ...c, [selected.id]: 'error' }));
    }
  };

  const state = selected ? keyState(selected, now) : 'sealed';
  const expired = selected ? isExpired(selected, now) : false;
  const selectedContent = selected ? content[selected.id] : undefined;

  return (
    <main className="lg-wrap lg-main lg-tight">
      <div className="lg-between" style={{ alignItems: 'flex-end', gap: 16 }}>
        <h1 className="lg-h1">{t('keyring.title')}</h1>
        <div className="lg-counts">
          <span>{t('keyring.sealed', { count: counts.sealed })}</span>
          <span>{t('keyring.opened', { count: counts.opened })}</span>
          <span className="lg-muted">{t('keyring.invalid', { count: counts.invalid })}</span>
        </div>
      </div>

      <div className="lg-cols" style={{ gap: 24 }}>
        <div className="lg-col-main lg-keys" style={{ gap: 8 }}>
          {sorted.map((q) => {
            const s = keyState(q, now);
            return (
              <button key={q.id} type="button" className="lg-key" aria-current={q.id === selected?.id} onClick={() => setSelectedId(q.id)}>
                <span className={`lg-key-mark ${MARK[s]}`} aria-hidden="true">{markText(q)}</span>
                <span className="lg-key-body">
                  <span className="lg-key-name">{q.fileName}</span>
                  <span className="lg-small lg-muted">{dropRuleLine(t, q)}</span>
                </span>
                <span className={CHIP[s]}>{t(`keyring.state.${s}`)}</span>
              </button>
            );
          })}
        </div>

        {selected && (
          <aside className="lg-col-side lg-sticky lg-aside" style={{ padding: 26, gap: 18 }} aria-label={selected.fileName}>
            <div className="lg-between" style={{ alignItems: 'center', gap: 12 }}>
              <span className="lg-h2" style={{ fontSize: 20, minWidth: 0, overflowWrap: 'anywhere' }}>{selected.fileName}</span>
              <span className={CHIP[state]}>{t(`keyring.state.${state}`)}</span>
            </div>
            <span className="lg-muted" style={{ fontSize: 15 }}>{dropRuleLine(t, selected)}</span>

            {selected.qrCodeUrl && (
              <div className="lg-qr-frame" style={{ opacity: expired ? 0.4 : 1 }}>
                <img src={selected.qrCodeUrl} alt={selected.fileName} style={{ width: 180, height: 'auto' }} />
              </div>
            )}
            {(selected.secureMode || selected.singleQrMode) && !selected.qrCodeUrl2 && !selected.qrCodeUrlShare && (
              <span className="lg-xs lg-muted">{t('keyring.keysOnlyOnce')}</span>
            )}

            <div className="lg-log">
              <div>
                <span className="lg-dot lg-dot-on" />
                <div className="lg-stack" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{t('keyring.log.sealed')}</span>
                  <span className="lg-log-when">{date(selected.createdAt)}</span>
                </div>
              </div>
              {selected.activatesAt && (
                <div>
                  <span className={`lg-dot${selected.activatesAt <= now ? ' lg-dot-ink' : ''}`} />
                  <div className="lg-stack" style={{ gap: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{t('keyring.log.opens')}</span>
                    <span className="lg-log-when">{date(selected.activatesAt)}</span>
                  </div>
                </div>
              )}
              <div>
                <span className={`lg-dot${selected.scanCount > 0 ? ' lg-dot-ink' : ''}`} />
                <div className="lg-stack" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>
                    {selected.scanCount === 0
                      ? t('keyring.log.waiting')
                      : selected.maxScans
                        ? t('keyring.log.opened', { count: selected.scanCount, max: selected.maxScans })
                        : t('keyring.log.openedUnlimited', { count: selected.scanCount })}
                  </span>
                  {selected.downloadCount > 0 && (
                    <span className="lg-log-when">{t('keyring.log.downloads', { count: selected.downloadCount })}</span>
                  )}
                </div>
              </div>
              {selected.expiryDate && (
                <div>
                  <span className={`lg-dot${expired ? ' lg-dot-ink' : ''}`} />
                  <div className="lg-stack" style={{ gap: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{expired ? t('keyring.log.expired') : t('keyring.log.expires')}</span>
                    <span className="lg-log-when">{date(selected.expiryDate)}</span>
                  </div>
                </div>
              )}
            </div>

            {state === 'scheduled' && <ActivationEditor qrDrop={selected} onChanged={onActivationChanged} />}

            {!selected.secureMode && !selected.singleQrMode && (
              <button type="button" className="lg-link" style={{ alignSelf: 'flex-start', padding: '6px 0' }} aria-expanded={showContent} onClick={toggleContent}>
                {showContent ? t('keyring.hideContent') : t('keyring.showContent')}
              </button>
            )}
            {showContent && (
              <div className="lg-stack" style={{ gap: 8 }}>
                {selected.textContent && <div className="lg-content-item" style={{ whiteSpace: 'pre-wrap' }}>{selected.textContent}</div>}
                {selectedContent === 'loading' && <span className="lg-small lg-muted">{t('qrList.loadingFile')}</span>}
                {selectedContent === 'error' && <span className="lg-small lg-muted">{t('qrList.couldNotLoadFile')}</span>}
                {Array.isArray(selectedContent) && selectedContent.map((f, i) => (
                  <div key={i} className="lg-content-item">
                    {f.fileType.startsWith('image/') && <img src={f.fileUrl} alt={f.fileName} />}
                    <span className="lg-small" style={{ overflowWrap: 'anywhere' }}>{f.fileName}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="lg-row" style={{ gap: 8 }}>
              <button
                type="button"
                className="lg-btn lg-btn-ink"
                style={{ flex: 1 }}
                onClick={async () => {
                  if (await copyToClipboard(shareLink(selected))) toast.success(t('qrDetail.linkCopied'));
                  else toast.error(t('qrDetail.couldNotCopyLink'));
                }}
              >
                {t('keyring.copyLink')}
              </button>
              <button
                type="button"
                className="lg-btn"
                style={{ flex: 1 }}
                onClick={() => keyImages(selected).forEach((img, i) => setTimeout(() => downloadImage(img.src, img.file), i * 150))}
              >
                {t('keyring.downloadQr')}
              </button>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className="lg-btn lg-btn-danger">{t('keyring.revoke')}</button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-white" style={{ borderRadius: 0 }}>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('keyring.revokeTitle', { name: selected.fileName })}</AlertDialogTitle>
                  <AlertDialogDescription>{t('keyring.revokeBody')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel style={{ borderRadius: 0 }}>{t('keyring.cancel')}</AlertDialogCancel>
                  <AlertDialogAction style={{ borderRadius: 0, background: '#B42318', color: '#FFFFFF' }} onClick={() => onDelete(selected.id)}>
                    {t('keyring.revoke')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </aside>
        )}
      </div>
    </main>
  );
}
