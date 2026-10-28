import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './utils/auth-context';
import { useTranslation } from 'react-i18next';
import { DecorativeBackground } from './components/decorative-background';
import { ScanView } from './components/scan-view';
import { SuccessPage } from './components/success-page';
import { LegalPage } from './components/legal-page';
import { HowItWorksPage } from './components/how-it-works-page';
import { AppHeader } from './components/lag/app-header';
import { CreateFlow } from './components/lag/create-flow';
import { StepReady, leaveReadyGuard } from './components/lag/step-ready';
import { Keyring } from './components/lag/keyring';
import { getAllQrDrops, deleteQrDrop, type QrDropData } from './utils/api-client';
import { toast, Toaster } from 'sonner@2.0.3';
import { keyPartsFromHash, rememberKeyParts, purgeStaleKeyParts } from './utils/key-handover';

export interface QrDrop {
  id: string;
  title?: string; // Optional title for the QR code
  contentType: 'file' | 'text' | 'url' | 'bundle'; // Type of content (bundle = mixed content)
  fileName: string; // For files, or used as display name for text/url
  fileType: string;
  fileSize: number;
  textContent?: string; // For text type
  urlContent?: string; // For url type (JSON string of array for multiple URLs)
  expiryType: string;
  expiryDate?: Date;
  activatesAt?: Date; // Scheduled release: recipients can open it from this date
  maxScans?: number;
  maxDownloads?: number;
  scanCount: number;
  downloadCount: number;
  viewOnly: boolean;
  password?: string | boolean; // Plaintext right after creation, true when loaded from the server
  createdAt: Date;
  expiredAt?: Date; // Timestamp when it was marked as expired
  qrCodeUrl: string;
  secureMode?: boolean; // Secure Mode flag (dual QR)
  singleQrMode?: boolean; // Single QR Mode flag (single QR with K1)
  qrCodeUrl2?: string; // QR #2 for Secure Mode (unlock code)
  qrCodeUrlShare?: string; // QR for sharing (clean link without code) - used in Secure Mode and Single QR Mode
  keyUrl?: string; // Single QR Mode: the link with the key, only known right after creation
  keyInQrOnly?: boolean; // Single QR Mode where the key is only in the QR code, only known right after creation
}

function convertToQrDrop(data: QrDropData, qrCodeUrl: string): QrDrop {
  return {
    id: data.id,
    title: data.title || undefined,
    contentType: data.contentType,
    fileName: data.fileName,
    fileType: data.fileType,
    fileSize: data.fileSize,
    textContent: data.textContent || undefined,
    urlContent: data.urlContent || undefined,
    expiryType: data.expiryType,
    expiryDate: data.expiresAt ? new Date(data.expiresAt) : undefined,
    activatesAt: data.activatesAt ? new Date(data.activatesAt) : undefined,
    maxScans: data.maxScans || undefined,
    maxDownloads: data.maxDownloads || undefined,
    scanCount: data.scanCount,
    downloadCount: data.downloadCount,
    viewOnly: data.viewOnly,
    password: data.password || undefined,
    createdAt: new Date(data.createdAt),
    expiredAt: data.expiredAt ? new Date(data.expiredAt) : undefined,
    secureMode: data.secureMode || undefined,
    singleQrMode: data.singleQrMode || undefined,
    qrCodeUrl,
  };
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [qrDrops, setQrDrops] = useState<QrDrop[]>([]);
  const [currentView, setCurrentView] = useState<'upload' | 'list' | 'ready' | 'success' | 'legal' | 'how-it-works'>('upload');
  const [selectedQrDrop, setSelectedQrDrop] = useState<QrDrop | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Start as false, will be set to true when actually loading
  const [scanId, setScanId] = useState<string | null>(null);
  const [keyArrivals, setKeyArrivals] = useState(0); // Restarts ScanView when a QR key arrives in the same tab
  const [isLoadingQrDrops, setIsLoadingQrDrops] = useState(false); // Prevent multiple simultaneous loads
  
  // Remove key parts left over from earlier scans
  useEffect(() => {
    purgeStaleKeyParts();
  }, []);

  // Route from the URL: /scan/:id and /unlock/:id open a QR drop, the rest are app pages
  useEffect(() => {
    const updateViewFromPath = () => {
      const path = window.location.pathname;
      const qrRoute = path.match(/^\/(?:scan|unlock)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i);
      if (qrRoute) {
        const id = qrRoute[1].toLowerCase();
        // Key parts arrive in the fragment (never sent to the server). Hand them to ScanView and
        // take them out of the address bar and browser history right away.
        const parts = keyPartsFromHash(window.location.hash);
        if (parts.k1 || parts.k2) {
          rememberKeyParts(id, parts);
          setKeyArrivals((n) => n + 1);
        }
        window.history.replaceState({}, '', `/scan/${id}`);
        setScanId(id);
        return;
      }

      if (path === '/scan' || path.startsWith('/scan/') || path.startsWith('/unlock/')) {
        window.history.replaceState({}, '', '/');
        setCurrentView('upload');
      } else if (path === '/terms') {
        setCurrentView('legal');
      } else if (path === '/how-it-works') {
        setCurrentView('how-it-works');
      } else if (path === '/success') {
        setCurrentView('success');
      }
      setScanId(null);
    };

    updateViewFromPath();
    window.addEventListener('popstate', updateViewFromPath);
    window.addEventListener('hashchange', updateViewFromPath);
    return () => {
      window.removeEventListener('popstate', updateViewFromPath);
      window.removeEventListener('hashchange', updateViewFromPath);
    };
  }, []);

  // Refresh the list when switching views on the main page
  useEffect(() => {
    const path = window.location.pathname;
    if (!scanId && !['/terms', '/how-it-works', '/success'].includes(path)) {
      loadQrDrops();
    }
  }, [currentView]);

  // Scans happen on other devices: refresh the key ring when the person comes back to it
  useEffect(() => {
    if (currentView !== 'list' || scanId) return;
    let last = 0;
    const refresh = () => {
      // focus and visibilitychange often fire together; one load is enough
      if (document.visibilityState !== 'visible' || Date.now() - last < 2000) return;
      last = Date.now();
      loadQrDrops();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [currentView, scanId, user]);

  // The success page navigates without popstate, so follow the path
  useEffect(() => {
    const interval = setInterval(() => {
      const currentPath = window.location.pathname;
      if (currentPath === '/success' && currentView !== 'success') {
        setCurrentView('success');
      } else if (currentPath === '/' && currentView === 'success') {
        setCurrentView('upload');
      }
    }, 100);
    return () => clearInterval(interval);
  }, [currentView]);

  // Reload QR drops when user changes (login/logout)
  // Don't reload on the "ready" step (might have just created a QR drop)
  useEffect(() => {
    if (!authLoading && !scanId && currentView !== 'ready') {
      loadQrDrops();
    }
  }, [user, authLoading, scanId]);

  const loadQrDrops = async () => {
    // Prevent multiple simultaneous loads
    if (isLoadingQrDrops) {
      console.log('⏸️ Already loading QR drops, skipping...');
      return;
    }

    // Don't load if user is not logged in (will get empty array anyway)
    if (!user) {
      setQrDrops([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoadingQrDrops(true);
      setIsLoading(true);
      const { qrDrops: data } = await getAllQrDrops();
      
      // Store current QR drops to preserve any newly created ones that might not be indexed yet
      const currentQrDropIds = new Set(qrDrops.map(qr => qr.id));
      
      // If no QR drops from backend, check if we have any in state (might be newly created)
      if (!data || data.length === 0) {
        // If we have QR drops in state, keep them (they might be newly created and not indexed yet)
        if (qrDrops.length > 0) {
          console.log('⚠️ Backend returned empty list, but we have QR drops in state. Keeping state.');
          setIsLoading(false);
          setIsLoadingQrDrops(false);
          return;
        }
        setQrDrops([]);
        setIsLoading(false);
        return;
      }
      
      // Import QRCode library and branding for generating QR codes
      const QRCode = (await import('qrcode')).default;
      const { createBrandedQrCode } = await import('./utils/qr-with-branding');
      const { generateStyledQrCode } = await import('./utils/qr-generator');
      
      const qrDropsWithQr = await Promise.all(
        data.map(async (qr) => {
          try {
            // Generate QR code with CLEAN URL (no token)
            // Server will generate token on-demand when scanned
            const cleanUrl = `${window.location.origin}/scan/${qr.id}`;
            
            let qrCodeUrl: string;

            if (qr.qrStyle) {
              // Generate with stored style
              const baseQr = await generateStyledQrCode(cleanUrl, qr.qrStyle);
              qrCodeUrl = await createBrandedQrCode(baseQr);
            } else {
              // Fallback to default style
              const baseQr = await QRCode.toDataURL(cleanUrl, {
                width: 400,
                margin: 2,
                color: {
                  dark: '#4F46E5',
                  light: '#FFFFFF',
                },
              });
              qrCodeUrl = await createBrandedQrCode(baseQr);
            }
            
            // Secure Mode and Single QR Mode unlock codes contain keys that are never stored,
            // so they can only be shown right after creation. The list shows the share link.
            return convertToQrDrop(qr, qrCodeUrl);
          } catch (error) {
            console.error(`Error generating QR for ${qr.id}:`, error);
            // Return with placeholder QR if generation fails
            return convertToQrDrop(qr, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
          }
        })
      );
      
      // Merge with existing QR drops to preserve newly created ones that might not be indexed yet
      const backendQrDropIds = new Set(qrDropsWithQr.map(qr => qr.id));
      const newQrDropsFromState = qrDrops.filter(qr => !backendQrDropIds.has(qr.id));
      
      // Combine: new QR drops from state (not yet in backend) + QR drops from backend
      // Sort by creation date (newest first)
      const mergedQrDrops = [...newQrDropsFromState, ...qrDropsWithQr].sort((a, b) => 
        b.createdAt.getTime() - a.createdAt.getTime()
      );
      
      setQrDrops(mergedQrDrops);
    } catch (error: any) {
      console.error('Failed to load QR drops:', error);
      // Only show error toast if it's not a 401/403 (authentication errors are expected when not logged in)
      if (error?.status !== 401 && error?.status !== 403) {
        toast.error(t('app.couldNotLoadQrs'));
      }
      // Don't clear state on error if we have QR drops (they might be newly created)
      if (qrDrops.length === 0) {
        setQrDrops([]);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingQrDrops(false);
    }
  };

  const handleQrCreated = async (newQrDrop: QrDrop) => {
    setQrDrops([newQrDrop, ...qrDrops]);
    setSelectedQrDrop(newQrDrop);
    setCurrentView('ready');
    window.scrollTo({ top: 0 });
    
    // Reload QR drops after a short delay to ensure backend has indexed the new QR drop
    // This ensures the list stays in sync with the backend
    setTimeout(async () => {
      try {
        await loadQrDrops();
      } catch (error) {
        console.error('Failed to reload QR drops after creation:', error);
        // Don't show error toast - the QR drop is already in state
      }
    }, 1000); // 1 second delay to allow backend to index
  };

  const handleActivationChanged = (id: string, changes: { activatesAt?: Date; expiryDate?: Date }) => {
    setQrDrops((drops) => drops.map((qr) => (qr.id === id ? { ...qr, ...changes } : qr)));
    setSelectedQrDrop((qr) => (qr?.id === id ? { ...qr, ...changes } : qr));
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteQrDrop(id);
      setQrDrops(qrDrops.filter(qr => qr.id !== id));
      toast.success(t('app.qrDeleted'));
    } catch (error) {
      console.error('Failed to delete QR drop:', error);
      toast.error(t('app.couldNotDeleteQr'));
    }
  };

  const navigate = (section: 'create' | 'keyring') => {
    if (leaveReadyGuard.current && !leaveReadyGuard.current()) return;
    if (scanId || window.location.pathname !== '/') window.history.pushState({}, '', '/');
    setScanId(null);
    setCurrentView(section === 'create' ? 'upload' : 'list');
    window.scrollTo({ top: 0 });
  };

  // The create flow, the key ring and the terms use the new look; scan and the rest keep theirs for now
  const newLook = !scanId && ['upload', 'list', 'ready', 'legal'].includes(currentView);

  return (
    <div className="lg-app relative">
      {!newLook && <DecorativeBackground />}

      <AppHeader
        section={scanId ? null : currentView === 'list' ? 'keyring' : ['upload', 'ready'].includes(currentView) ? 'create' : null}
        keyCount={qrDrops.length}
        showNav={!scanId}
        onNavigate={navigate}
      />

      {currentView === 'upload' && !scanId && <CreateFlow onQrCreated={handleQrCreated} />}

      {currentView === 'ready' && !scanId && selectedQrDrop && (
        <StepReady qrDrop={selectedQrDrop} onNew={() => navigate('create')} onKeyring={() => navigate('keyring')} />
      )}

      {currentView === 'legal' && !scanId && <LegalPage />}

      {currentView === 'list' && !scanId && (
        <Keyring
          qrDrops={qrDrops}
          isLoading={isLoading || authLoading}
          onDelete={handleDelete}
          onActivationChanged={handleActivationChanged}
          onCreate={() => navigate('create')}
        />
      )}

      {!newLook && (
        <main className="relative z-10 max-w-5xl mx-auto px-4 py-8">
          {scanId ? (
            // Public scan page
            <ScanView
              key={`${scanId}:${keyArrivals}`}
              qrDropId={scanId}
              isDirectScan={true}
              onBack={() => {
                window.location.href = '/';
              }}
            />
          ) : (
            <>
              {currentView === 'success' && <SuccessPage />}

              {currentView === 'how-it-works' && <HowItWorksPage onBack={() => navigate('create')} />}
            </>
          )}
        </main>
      )}

      {!scanId && (
        <footer className="lg-footer relative z-10">
          <div className="lg-wrap">
            <nav aria-label={t('nav.terms')}>
              <button type="button" onClick={() => { if (leaveReadyGuard.current && !leaveReadyGuard.current()) return; window.history.pushState({}, '', '/how-it-works'); setCurrentView('how-it-works'); window.scrollTo({ top: 0 }); }}>
                {t('nav.howItWorks')}
              </button>
              <button type="button" onClick={() => { if (leaveReadyGuard.current && !leaveReadyGuard.current()) return; window.history.pushState({}, '', '/terms'); setCurrentView('legal'); window.scrollTo({ top: 0 }); }}>
                {t('nav.terms')}
              </button>
            </nav>
          </div>
        </footer>
      )}
      <Toaster 
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#FFFFFF',
            color: '#0B0B0B',
            border: '1px solid #0B0B0B',
            borderRadius: 0,
            boxShadow: 'none',
            fontFamily: "'Inter Tight', system-ui, sans-serif",
          },
        }}
      />
    </div>
  );
}