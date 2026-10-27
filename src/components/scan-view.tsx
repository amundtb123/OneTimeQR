import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, Eye, Lock, AlertCircle, CheckCircle, Loader2, Clock, FileText, Link as LinkIcon, ExternalLink, Copy, Shield, CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Alert, AlertDescription } from './ui/alert';
import { UnlockScreen } from './unlock-screen';
import { getQrDrop, openQrDrop, incrementDownloadCount } from '../utils/api-client';
import { decryptFile, decryptTextWithSplitKey } from '../utils/encryption';
import { loadKeyParts, rememberKeyParts, forgetKeyParts, masterKeyHex, hexToBytes, type KeyParts } from '../utils/key-handover';
import { formatTimeLeft, useNow } from '../utils/time-left';
import { formatActivationDate, formatCountdown } from '../utils/activation';
import { toast } from 'sonner@2.0.3';

interface ScanViewProps {
  qrDropId: string;
  onBack: () => void;
  isPreview?: boolean; // Owner preview from the list (the owner token keeps it from using a view)
  isDirectScan?: boolean; // Direct scan from QR code (hide navigation)
}

interface ScanFile {
  fileUrl: string; // Signed URL of the encrypted file (valid for 2 minutes)
  fileName: string;
  fileType: string;
  fileSize: number;
  fileIndex: number;
  blobUrl?: string; // Decrypted file, once ready
}

// loading → (scheduled: waits for the release date) → (locked: needs QR key) → (password) → open,
// or error at any point
type Status = 'loading' | 'scheduled' | 'locked' | 'password' | 'open' | 'error';

// When the server still says "not yet" (clocks differ), try again this much later
const ACTIVATION_RETRY_MS = 5000;

class DecryptError extends Error {}

const TYPES_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

// Files are stored encrypted, so the original type comes from the drop's metadata or the name
function originalFileType(file: { fileName: string; fileType?: string }, qrDrop: any): string {
  const meta = Array.isArray(qrDrop?.files) ? qrDrop.files.find((f: any) => f.name === file.fileName) : null;
  const type = meta?.type || file.fileType || 'application/octet-stream';
  if (type !== 'application/octet-stream') return type;
  const ext = file.fileName.split('.').pop()?.toLowerCase();
  return (ext && TYPES_BY_EXTENSION[ext]) || type;
}

function parseUrls(urlContent: string | null | undefined): string[] {
  if (!urlContent) return [];
  try {
    const urls = JSON.parse(urlContent);
    return Array.isArray(urls) ? urls : [urlContent];
  } catch {
    return [urlContent];
  }
}

export function ScanView({ qrDropId, onBack, isPreview = false, isDirectScan = false }: ScanViewProps) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<Status>('loading');
  const [activatesAt, setActivatesAt] = useState<number | null>(null); // While scheduled
  const [attempt, setAttempt] = useState(0); // Restarts loading once a scheduled drop opens
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null); // From GET /qr/:id: no content, doesn't use a view
  const [qrDrop, setQrDrop] = useState<any>(null); // From /open: with content
  const [keyParts, setKeyParts] = useState<KeyParts>({});
  const [content, setContent] = useState<{ text?: string; urls: string[] }>({ urls: [] });
  const [files, setFiles] = useState<ScanFile[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const keyRef = useRef<string | null>(null); // Secure/Single QR Mode key (hex), never leaves the browser
  // Key parts stay here while waiting for a scheduled drop (the stored copy only lasts a few minutes)
  const keyPartsRef = useRef<KeyParts>({});
  const fileBlobsRef = useRef<Record<number, Promise<Blob>>>({}); // Decrypted files for preview and download
  const blobUrlsRef = useRef<string[]>([]);
  const isE2E = !!(meta?.secureMode || meta?.singleQrMode);
  const now = useNow(status === 'scheduled' || (status === 'open' && !!qrDrop?.expiresAt));

  const showScheduled = (at: number) => {
    setActivatesAt(Math.max(at, Date.now() + (at > Date.now() ? 0 : ACTIVATION_RETRY_MS)));
    setStatus('scheduled');
  };

  const showError = (err: any) => {
    if (err?.code === 'NOT_YET_ACTIVE') {
      showScheduled(activatesAt ?? 0);
      return;
    }
    if (err instanceof DecryptError) setError(t('scanView.couldNotDecrypt'));
    else if (err?.status === 410) setError(t('scanView.qrExpired'));
    else if (err?.status === 404) setError(t('scanView.qrNotFound'));
    else setError(t('scanView.couldNotLoad'));
    setStatus('error');
  };

  // Uses the key parts if they are complete; returns whether the key is now known
  const applyKeyParts = (metadata: any, parts: KeyParts): boolean => {
    try {
      keyRef.current = masterKeyHex(metadata, parts);
    } catch {
      keyRef.current = null;
    }
    return !!keyRef.current;
  };

  const decryptFiles = async (list: ScanFile[], key: string | null) => {
    setIsDecrypting(true);
    let failed = false;
    await Promise.all(list.map(async (file) => {
      const blob = fetch(file.fileUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
          return res.blob();
        })
        .then((encrypted) => (key ? decryptFile(encrypted, key) : encrypted))
        .then((decrypted) => new Blob([decrypted], { type: file.fileType }));
      fileBlobsRef.current[file.fileIndex] = blob;
      try {
        const blobUrl = URL.createObjectURL(await blob);
        blobUrlsRef.current.push(blobUrl);
        setFiles((prev) => prev.map((f) => (f.fileIndex === file.fileIndex ? { ...f, blobUrl } : f)));
      } catch (err) {
        console.error('Could not decrypt file:', err instanceof Error ? err.message : err);
        failed = true;
      }
    }));
    setIsDecrypting(false);
    if (failed) toast.error(t('scanView.couldNotDecrypt'));
  };

  // Uses up a view: the server verifies the password, counts the view and returns the content
  const open = async (password?: string) => {
    const opened = await openQrDrop(qrDropId, password);
    forgetKeyParts(qrDropId);
    const drop = opened.qrDrop as any;
    const e2e = drop.secureMode || drop.singleQrMode;

    let text: string | undefined;
    let urls: string[];
    if (e2e) {
      try {
        const master = hexToBytes(keyRef.current!);
        text = drop.textContent ? await decryptTextWithSplitKey(JSON.parse(drop.textContent), master, drop.id) : undefined;
        urls = drop.urlContent ? parseUrls(await decryptTextWithSplitKey(JSON.parse(drop.urlContent), master, drop.id)) : [];
      } catch {
        throw new DecryptError('Could not decrypt content');
      }
    } else {
      text = drop.textContent || undefined;
      urls = parseUrls(drop.urlContent);
    }

    const list: ScanFile[] = (opened.files ?? []).map((f) => ({ ...f, fileType: originalFileType(f, drop) }));
    setQrDrop(drop);
    setContent({ text, urls: urls.filter((url) => url && typeof url === 'string') });
    setFiles(list);
    setStatus('open');
    if (list.length > 0) {
      decryptFiles(list, e2e ? keyRef.current : drop.encryptionKey);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { qrDrop: metadata } = await getQrDrop(qrDropId);
        if (cancelled) return;
        setMeta(metadata);
        if (metadata.secureMode || metadata.singleQrMode) {
          const parts = { ...keyPartsRef.current, ...loadKeyParts(qrDropId) };
          keyPartsRef.current = parts;
          setKeyParts(parts);
          applyKeyParts(metadata, parts);
        }
        // Owners can preview early (the server allows it); everyone else sees when it opens
        if (!isPreview && metadata.activatesAt && metadata.activatesAt > Date.now()) {
          showScheduled(metadata.activatesAt);
          return;
        }
        if (metadata.secureMode || metadata.singleQrMode) {
          if (!keyRef.current) {
            setStatus('locked');
            return;
          }
        }
        if (metadata.password) {
          setStatus('password');
          return;
        }
        await open();
      } catch (err) {
        if (!cancelled) showError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qrDropId, attempt]);

  // A scheduled drop opens by itself once its time has come
  useEffect(() => {
    if (status === 'scheduled' && activatesAt && now >= activatesAt) {
      setStatus('loading');
      setAttempt((a) => a + 1);
    }
  }, [status, activatesAt, now]);

  // Free decrypted files when leaving
  useEffect(() => () => blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  // The content can't be opened again once its views are used, so confirm before leaving
  useEffect(() => {
    if (status !== 'open') return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [status]);

  const handleKeyParts = async (parts: KeyParts) => {
    // Kept for a few minutes, so the other QR code can also be scanned with the camera app
    const merged = rememberKeyParts(qrDropId, parts);
    keyPartsRef.current = merged;
    setKeyParts(merged);
    if (!applyKeyParts(meta, merged)) return;
    if (meta.password) {
      setStatus('password');
      return;
    }
    setStatus('loading');
    try {
      await open();
    } catch (err) {
      showError(err);
    }
  };

  const handlePasswordSubmit = async () => {
    try {
      await open(passwordInput);
      setPasswordError(false);
    } catch (err: any) {
      if (err?.status === 401) {
        setPasswordError(true);
      } else if (err?.status === 429) {
        toast.error(t('scanView.tooManyAttempts'));
      } else if (err?.status === 410 || err?.code === 'NOT_YET_ACTIVE' || err instanceof DecryptError) {
        showError(err);
      } else {
        toast.error(t('scanView.couldNotLoad'));
      }
    }
  };

  const handleDownloadClick = async (fileIndex?: number) => {
    const targets = fileIndex !== undefined ? files.filter((f) => f.fileIndex === fileIndex) : files;
    if (qrDrop?.viewOnly || targets.length === 0) return;

    try {
      // Counts the download; the server refuses once the limit is reached
      await incrementDownloadCount(qrDropId);
      for (let i = 0; i < targets.length; i++) {
        const blob = await fileBlobsRef.current[targets[i].fileIndex];
        // Download from a local blob URL, so the signed storage URL is never exposed
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = targets[i].fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

        // Mobile browsers block several downloads in quick succession
        if (i < targets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      toast.success(targets.length > 1
        ? t('scanView.filesDownloaded', { count: targets.length, defaultValue: `${targets.length} files downloaded` })
        : t('scanView.fileDownloaded'));
    } catch (err: any) {
      toast.error(err?.status === 410 ? t('scanView.qrExpired') : t('scanView.couldNotDownload'));
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const backButton = !isDirectScan && (
    <Button variant="ghost" onClick={onBack} className="mb-6">
      <ArrowLeft className="size-4 mr-2" />
      {t('scanView.back')}
    </Button>
  );

  if (status === 'loading') {
    return (
      <div className="max-w-3xl mx-auto">
        {backButton}
        <Card className="p-12 text-center">
          <Loader2 className="size-12 text-indigo-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">{t('scanView.loadingQr')}</p>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="max-w-3xl mx-auto">
        {backButton}
        <Card className="p-12 text-center">
          <AlertCircle className="size-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-gray-900 mb-2">{t('scanView.couldNotLoadQr')}</h3>
          <p className="text-gray-600">{error}</p>
        </Card>
      </div>
    );
  }

  if (status === 'scheduled' && activatesAt) {
    return (
      <div className="max-w-3xl mx-auto">
        {backButton}
        <Card className="p-12 text-center">
          <CalendarClock className="size-12 text-indigo-600 mx-auto mb-4" />
          <h3 className="text-gray-900 mb-2">{t('activation.notYetTitle')}</h3>
          <p className="text-gray-600 mb-4">
            {t('activation.notYetBody', { date: formatActivationDate(activatesAt, i18n.language) })}
          </p>
          <p className="text-2xl text-gray-900 mb-4">{formatCountdown(t, activatesAt, now)}</p>
          <p className="text-gray-500 text-sm">{t('activation.keepOpen')}</p>
        </Card>
      </div>
    );
  }

  if (status === 'locked') {
    return (
      <UnlockScreen
        qrDropId={qrDropId}
        singleQrMode={!!meta?.singleQrMode}
        keyParts={keyParts}
        expiresAt={meta?.expiresAt}
        onKeyParts={handleKeyParts}
      />
    );
  }

  if (status === 'password') {
    return (
      <div className="max-w-3xl mx-auto">
        {backButton}
        <Card className="p-8">
          <div className="max-w-md mx-auto text-center">
            <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="size-8 text-indigo-600" />
            </div>

            <h2 className="text-gray-900 mb-2">{t('scanView.passwordProtected')}</h2>
            <p className="text-gray-600 mb-6">{t('scanView.enterPassword')}</p>

            <div className="space-y-4">
              <Input
                type="password"
                placeholder={t('scanView.passwordPlaceholder')}
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              />

              {passwordError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    {t('scanView.wrongPassword')}
                  </AlertDescription>
                </Alert>
              )}

              <Button onClick={handlePasswordSubmit} className="w-full">
                {t('scanView.unlock')}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const hasText = !!content.text;
  const hasUrls = content.urls.length > 0;
  const hasFiles = files.length > 0;

  return (
    <div className="max-w-3xl mx-auto">
      {backButton}

      <div className="space-y-4 pb-24"> {/* pb-24 for space for sticky download button */}
        {/* Success Message */}
        {!isDirectScan && (
          <Alert>
            <CheckCircle className="size-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {t('scanView.accessGranted')}
            </AlertDescription>
          </Alert>
        )}

        {/* Content Preview */}
        <Card className="p-4 sm:p-6">
          {/* Secure Mode Badge - content was decrypted in this browser */}
          {isE2E && (
            <div
              className="mb-4 inline-flex px-3 py-1.5 rounded-xl border backdrop-blur-sm items-center gap-2"
              style={{
                backgroundColor: 'rgba(245, 229, 225, 0.95)',
                borderColor: '#E8927E',
                color: '#E8927E'
              }}
            >
              <Shield className="size-3.5" />
              <span className="text-sm">{t('scanView.secureModeDecrypted')}</span>
            </div>
          )}

          {/* Expiry Time Tag */}
          {qrDrop?.expiresAt && (
            <div
              className="mb-4 inline-flex px-3 py-1.5 rounded-xl border backdrop-blur-sm items-center gap-2 ml-2"
              style={{
                backgroundColor: 'rgba(226, 239, 250, 0.95)',
                borderColor: '#D5C5BD',
                color: '#4A6FA5'
              }}
            >
              <Clock className="size-3.5" />
              <span className="text-sm">{formatTimeLeft(t, qrDrop.expiresAt, now)}</span>
            </div>
          )}

          {/* Show title if exists */}
          {qrDrop?.title && (
            <div className="mb-4 pb-4 border-b border-gray-200">
              <h2 className="text-gray-900 text-lg">{qrDrop.title}</h2>
            </div>
          )}

          {/* Text Content */}
          {hasText && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="size-5 text-[#4A6FA5]" />
                <h3 className="text-gray-900">{t('scanView.textMessage')}</h3>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-gray-900 whitespace-pre-wrap">
                  {content.text}
                </p>
              </div>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(content.text!);
                  toast.success(t('scanView.textCopied'));
                }}
                className="w-full mt-4"
                size="lg"
                variant="outline"
              >
                <Copy className="size-5 mr-2" />
                {t('scanView.copyText')}
              </Button>
            </div>
          )}

          {/* URL Content */}
          {hasUrls && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <LinkIcon className="size-5 text-[#4A6FA5]" />
                <h3 className="text-gray-900">{content.urls.length > 1 ? t('scanView.urlsPlural') : t('scanView.urls')}</h3>
              </div>
              <div className="space-y-2">
                {content.urls.map((url, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#5D8CC9] hover:underline break-all flex items-center gap-2"
                    >
                      {url}
                      <ExternalLink className="size-4 flex-shrink-0" />
                    </a>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(content.urls.join('\n'));
                      toast.success(t('scanView.linksCopied'));
                    }}
                    variant="outline"
                    size="lg"
                  >
                    <Copy className="size-5 mr-2" />
                    {content.urls.length > 1 ? t('scanView.copyAll') : t('scanView.copy')}
                  </Button>
                  <Button
                    onClick={() => {
                      content.urls.forEach((url) => window.open(url, '_blank'));
                    }}
                    size="lg"
                  >
                    <ExternalLink className="size-5 mr-2" />
                    {content.urls.length > 1 ? t('scanView.openAll') : t('scanView.open')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* File Content - Show all files */}
          {hasFiles && !qrDrop?.noPreview && (
            <div className="space-y-4 mb-4 pb-20"> {/* pb-20 for space for sticky button */}
              {files.map((file) => (
                <div key={file.fileIndex} className="border-4 rounded-2xl p-4" style={{ borderColor: '#D5C5BD' }}>
                  {/* Waiting for decryption */}
                  {!file.blobUrl && /^(image|video|audio)\//.test(file.fileType) && (
                    <div className="w-full h-48 bg-gray-100 rounded-xl mb-2 flex items-center justify-center">
                      <Loader2 className="size-8 text-gray-400 animate-spin" />
                      {isDecrypting && <span className="ml-2 text-sm text-gray-600">Dekrypterer...</span>}
                    </div>
                  )}

                  {/* Image Preview */}
                  {file.blobUrl && file.fileType.startsWith('image/') && (
                    <img
                      src={file.blobUrl}
                      alt={file.fileName}
                      className="w-full h-auto rounded-xl mb-2"
                      style={{
                        // Prevent long-press save on mobile when viewOnly is enabled
                        WebkitUserSelect: qrDrop.viewOnly ? 'none' : 'auto',
                        userSelect: qrDrop.viewOnly ? 'none' : 'auto',
                        WebkitTouchCallout: qrDrop.viewOnly ? 'none' : 'auto',
                        pointerEvents: qrDrop.viewOnly ? 'none' : 'auto',
                      }}
                      onContextMenu={(e) => {
                        if (qrDrop.viewOnly) {
                          e.preventDefault();
                          toast.error(t('scanView.fileViewOnly'));
                        }
                      }}
                    />
                  )}

                  {/* Video Preview */}
                  {file.blobUrl && file.fileType.startsWith('video/') && (
                    <div className="mb-2">
                      <video
                        controls
                        className="w-full h-auto rounded-xl"
                        style={{ maxHeight: '70vh' }}
                        controlsList={qrDrop.viewOnly ? 'nodownload' : undefined}
                        onContextMenu={(e) => {
                          if (qrDrop.viewOnly) {
                            e.preventDefault();
                            toast.error(t('scanView.fileViewOnly'));
                          }
                        }}
                      >
                        <source src={file.blobUrl} type={file.fileType} />
                        {t('scanView.browserNotSupported')}
                      </video>
                    </div>
                  )}

                  {/* Audio Preview */}
                  {file.blobUrl && file.fileType.startsWith('audio/') && (
                    <div className="mb-2">
                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 border-2" style={{ borderColor: '#D5C5BD' }}>
                        <div className="text-center mb-4">
                          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                          </div>
                          <h3 className="text-gray-900 mb-1 text-sm">{file.fileName}</h3>
                          <p className="text-gray-600 text-xs">{file.fileType.split('/')[1]?.toUpperCase() || 'AUDIO'}</p>
                        </div>
                        <audio
                          controls
                          className="w-full"
                          style={{ filter: 'hue-rotate(200deg) saturate(0.8)' }}
                          controlsList={qrDrop.viewOnly ? 'nodownload' : undefined}
                          onContextMenu={(e) => {
                            if (qrDrop.viewOnly) {
                              e.preventDefault();
                              toast.error(t('scanView.fileViewOnly'));
                            }
                          }}
                        >
                          <source src={file.blobUrl} type={file.fileType} />
                          {t('scanView.browserNotSupportedAudio')}
                        </audio>
                      </div>
                    </div>
                  )}

                  {/* File Info */}
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[#3F3F3F] text-sm font-medium truncate" title={file.fileName}>{file.fileName}</p>
                      <p className="text-[#5B5B5B] text-xs">{formatFileSize(file.fileSize)} • {file.fileType.split('/')[1]?.toUpperCase() || 'FILE'}</p>
                    </div>
                    {!qrDrop?.viewOnly && (
                      <Button onClick={() => handleDownloadClick(file.fileIndex)} variant="outline" size="sm" className="flex-shrink-0">
                        <Download className="size-4 mr-1" />
                        {t('scanView.download')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No Preview Message */}
          {hasFiles && qrDrop?.noPreview && (
            <Alert className="mb-4">
              <Eye className="size-4" />
              <AlertDescription>
                {t('scanView.previewNotAvailable')}
              </AlertDescription>
            </Alert>
          )}
        </Card>

        {/* Sticky Download Button - Fixed at bottom */}
        {hasFiles && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg z-50 max-w-3xl mx-auto">
            {!qrDrop?.viewOnly ? (
              <Button onClick={() => handleDownloadClick()} className="w-full" size="lg">
                <Download className="size-5 mr-2" />
                {files.length > 1
                  ? t('scanView.downloadFiles', { count: files.length, defaultValue: `Download files (${files.length})` })
                  : t('scanView.downloadFile', { defaultValue: 'Download file' })
                }
              </Button>
            ) : (
              <Alert>
                <Eye className="size-4" />
                <AlertDescription>
                  {t('scanView.viewOnly')}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Statistics (owner preview) */}
        {isPreview && (
          <Card className="p-6">
            <h3 className="text-gray-900 mb-4">{t('scanView.sharingStats')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <Eye className="size-4" />
                  <span className="text-sm">{t('scanView.totalScans')}</span>
                </div>
                <p className="text-gray-900">
                  {qrDrop?.scanCount}
                  {qrDrop?.maxScans && (
                    <span className="text-gray-500 text-sm"> / {qrDrop.maxScans}</span>
                  )}
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <Download className="size-4" />
                  <span className="text-sm">{t('scanView.totalDownloads')}</span>
                </div>
                <p className="text-gray-900">
                  {qrDrop?.downloadCount}
                  {qrDrop?.maxDownloads && (
                    <span className="text-gray-500 text-sm"> / {qrDrop.maxDownloads}</span>
                  )}
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
