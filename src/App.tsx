import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './utils/auth-context';
import { useTranslation } from 'react-i18next';
import { DecorativeBackground } from './components/decorative-background';
import { NordicLogo } from './components/nordic-logo';
import { AuthButton } from './components/auth-button';
import { UploadSection } from './components/upload-section';
import { QrList } from './components/qr-list';
import { ScanView } from './components/scan-view';
import { QrDetailView } from './components/qr-detail-view';
import { SuccessPage } from './components/success-page';
import { LegalPage } from './components/legal-page';
import { HowItWorksPage } from './components/how-it-works-page';
import { getAllQrDrops, deleteQrDrop, type QrDropData } from './utils/api-client';
import { toast, Toaster } from 'sonner@2.0.3';
import { LanguageSwitcher } from './components/language-switcher';
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
    maxScans: data.maxScans || undefined,
    maxDownloads: data.maxDownloads || undefined,
    scanCount: data.scanCount,
    downloadCount: data.downloadCount,
    viewOnly: data.viewOnly,
    password: data.password || undefined,
    createdAt: new Date(data.createdAt),
    expiredAt: data.expiredAt ? new Date(data.expiredAt) : undefined,
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
  const [currentView, setCurrentView] = useState<'upload' | 'list' | 'scan' | 'detail' | 'success' | 'legal' | 'how-it-works'>('upload');
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
  // Don't reload if we're in detail view (might have just created a QR drop)
  useEffect(() => {
    if (!authLoading && !scanId && currentView !== 'detail') {
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
    setCurrentView('detail');
    toast.success(t('app.qrCreated'));
    
    // Scroll til toppen av siden
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
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

  const handleScan = (qrDrop: QrDrop) => {
    setSelectedQrDrop(qrDrop);
    setCurrentView('scan');
  };

  const handleScanComplete = () => {
    // Reload QR drops to get updated stats
    loadQrDrops();
  };

  const handleDetail = (qrDrop: QrDrop) => {
    setSelectedQrDrop(qrDrop);
    setCurrentView('detail');
  };

  return (
    <div className="min-h-screen relative">
      <DecorativeBackground />
      
      {/* Header */}
      <header className="relative z-10 bg-white/90 backdrop-blur-sm border-b border-[#D5C5BD]">
        <div className="max-w-5xl mx-auto">
          {/* Top row: Logo + Title + Auth */}
          <div className="px-4 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentView('upload');
                  window.history.pushState({}, '', '/');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
                aria-label="Go to home"
              >
                <NordicLogo className="w-10 h-10 sm:w-12 sm:h-12" />
                <div>
                  <h1 className="text-[#3F3F3F]">{t('common.appName')}</h1>
                  <p className="text-[#5B5B5B] text-xs sm:text-sm">{t('common.tagline')}</p>
                </div>
              </button>
              
              <div className="flex items-center gap-3">
                {!scanId && <AuthButton />}
                <LanguageSwitcher />
              </div>
            </div>
          </div>
          
          {/* Bottom row: Navigation Tabs */}
          {!scanId && (
            <div className="border-t border-[#D5C5BD]/50">
              <nav className="flex px-4">
                <button
                  onClick={() => {
                    setCurrentView('upload');
                    window.history.pushState({}, '', '/');
                  }}
                  className={`flex-1 sm:flex-none sm:px-8 py-3 border-b-2 transition-all duration-200 ${
                    currentView === 'upload'
                      ? 'border-[#5D8CC9] text-[#5D8CC9]'
                      : 'border-transparent text-[#5B5B5B] hover:text-[#3F3F3F] hover:border-[#D5C5BD]'
                  }`}
                >
                  {t('common.upload')}
                </button>
                <button
                  onClick={() => {
                    setCurrentView('list');
                    // Keep URL as is for list view
                  }}
                  className={`flex-1 sm:flex-none sm:px-8 py-3 border-b-2 transition-all duration-200 ${
                    currentView === 'list'
                      ? 'border-[#5D8CC9] text-[#5D8CC9]'
                      : 'border-transparent text-[#5B5B5B] hover:text-[#3F3F3F] hover:border-[#D5C5BD]'
                  }`}
                >
                  <span className="hidden sm:inline">{t('common.myQrs')} ({qrDrops.length})</span>
                  <span className="sm:hidden">{t('common.myQrs')} ({qrDrops.length})</span>
                </button>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
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
            {currentView === 'success' && (
              <SuccessPage />
            )}
            
            {currentView === 'upload' && (
              <UploadSection onQrCreated={handleQrCreated} />
            )}
            
            {currentView === 'list' && (
              <QrList 
                qrDrops={qrDrops} 
                onDelete={handleDelete}
                onScan={handleScan}
                isLoading={isLoading}
              />
            )}
            
            {currentView === 'scan' && (selectedQrDrop || scanId) && (
              <ScanView 
                qrDropId={selectedQrDrop?.id || scanId || ''}
                isPreview={!!selectedQrDrop}
                isDirectScan={!selectedQrDrop && !!scanId}
                onBack={() => {
                  setCurrentView('list');
                  handleScanComplete();
                }}
              />
            )}
            
            {currentView === 'detail' && selectedQrDrop && (
              <QrDetailView 
                qrDrop={selectedQrDrop}
                onScan={() => {
                  setCurrentView('scan');
                }}
              />
            )}
            
            {currentView === 'legal' && (
              <LegalPage 
                onBack={() => {
                  setCurrentView('upload');
                  window.history.pushState({}, '', '/');
                }}
              />
            )}
            
            {currentView === 'how-it-works' && (
              <HowItWorksPage 
                onBack={() => {
                  setCurrentView('upload');
                  window.history.pushState({}, '', '/');
                }}
              />
            )}
          </>
        )}
      </main>
      <Toaster 
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#3F3F3F',
            border: '1px solid #D5C5BD',
            borderRadius: '1rem',
            boxShadow: '0 8px 24px rgba(63, 63, 63, 0.12)',
          },
        }}
      />
    </div>
  );
}