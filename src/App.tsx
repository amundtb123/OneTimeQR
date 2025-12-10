import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './utils/auth-context';
import { useTranslation } from 'react-i18next';
import { DecorativeBackground } from './components/decorative-background';
import { NordicLogo } from './components/nordic-logo';
import { AuthButton } from './components/auth-button';
import { UploadSection } from './components/upload-section';
import { QrList } from './components/qr-list';
import { ScanView } from './components/scan-view';
import { UnlockScreen } from './components/unlock-screen';
import { QrDetailView } from './components/qr-detail-view';
import { SuccessPage } from './components/success-page';
import { getAllQrDrops, deleteQrDrop, type QrDropData } from './utils/api-client';
import { projectId, publicAnonKey } from './utils/supabase/info';
import { toast, Toaster } from 'sonner@2.0.3';
import { LanguageSwitcher } from './components/language-switcher';

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
  password?: string;
  createdAt: Date;
  expiredAt?: Date; // Timestamp when it was marked as expired
  qrCodeUrl: string;
  secureMode?: boolean; // Secure Mode flag
  qrCodeUrl2?: string; // QR #2 for Secure Mode (unlock code)
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
  const [currentView, setCurrentView] = useState<'upload' | 'list' | 'scan' | 'detail' | 'unlock' | 'success'>('upload');
  const [selectedQrDrop, setSelectedQrDrop] = useState<QrDrop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scanId, setScanId] = useState<string | null>(null);
  const [unlockKey, setUnlockKey] = useState<string | null>(null);
  const [isFetchingKey, setIsFetchingKey] = useState(false); // Track if we're fetching encryption key
  const [showQr2Error, setShowQr2Error] = useState(false); // Track if QR #2 was scanned without QR #1

  // Check if we're on a scan, unlock, or success URL
  useEffect(() => {
    const updateViewFromPath = () => {
      const path = window.location.pathname;
      const scanMatch = path.match(/\/scan\/([^\/]+)/);
      const unlockMatch = path.match(/\/unlock\/([^\/]+)/);
      const successMatch = path === '/success';
      
      if (successMatch) {
        setCurrentView('success');
      } else if (unlockMatch) {
        // We're on an unlock page (QR #2 scanned)
        const id = unlockMatch[1];
        const searchParams = new URLSearchParams(window.location.search);
        const key = searchParams.get('key');
        
        setScanId(id);
        setUnlockKey(key);
        setCurrentView('unlock');
      } else if (scanMatch) {
        // We're on a scan page (QR #1 scanned)
        const id = scanMatch[1];
        const searchParams = new URLSearchParams(window.location.search);
        const key = searchParams.get('key'); // Check for decryption key in query
        const unlock = searchParams.get('unlock'); // Check for unlock flag (QR #2)
        
        // If unlock flag is set, fetch the encryption key from server
        if (unlock === '1') {
          // This is QR #2 - fetch encryption key from server
          
          // SECURITY CHECK: Ensure QR #1 was scanned first
          const qr1Scanned = localStorage.getItem(`qr1_scanned_${id}`);
          
          if (!qr1Scanned) {
            console.warn('⚠️ QR #2 scanned without QR #1 - showing error message');
            setShowQr2Error(true);
            toast.error(t('app.mustScanQr1First'));
            return;
          }
          
          // SECURITY CHECK #2: Verify the timestamp is recent (within 5 minutes)
          const timestamp = parseInt(qr1Scanned, 10);
          const now = Date.now();
          const fiveMinutes = 5 * 60 * 1000;
          
          if (now - timestamp > fiveMinutes) {
            console.warn('⚠️ QR #1 scan expired (older than 5 minutes) - please scan QR #1 again');
            localStorage.removeItem(`qr1_scanned_${id}`); // Clear expired flag
            setScanId(id);
            setCurrentView('scan');
            toast.error(t('app.qr1ScanExpired'));
            return;
          }
          
          // Set scanId, view and fetching flag immediately
          setScanId(id);
          setCurrentView('scan'); // IMPORTANT: Show scan view while fetching
          setIsFetchingKey(true);
          
          const serverUrl = `https://${projectId}.supabase.co/functions/v1/make-server-c3c9181e/qrdrop/${id}/key`;
          fetch(serverUrl, {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`
            }
          })
            .then(res => res.json())
            .then(data => {
              if (data.encryptionKey) {
                setUnlockKey(data.encryptionKey);
                setIsFetchingKey(false);
              } else {
                console.error('❌ No encryption key in response:', data);
                toast.error(t('app.couldNotFetchKey'));
                setIsFetchingKey(false);
              }
            })
            .catch(err => {
              console.error('❌ Failed to fetch encryption key:', err);
              toast.error(t('app.couldNotFetchKey'));
              setIsFetchingKey(false);
            });
          // IMPORTANT: Don't continue to else block!
        } else {
          // Regular scan (not QR #2)
          setScanId(id);
          setUnlockKey(key);
          setCurrentView('scan');
        }
      } else {
        // Normal app flow - OAuth callback is now handled in AuthContext
        loadQrDrops();
      }
    };
    
    // Initial view update
    updateViewFromPath();
    
    // Listen for pathname changes (including browser back/forward)
    const handlePopState = () => {
      updateViewFromPath();
    };
    
    window.addEventListener('popstate', handlePopState);
    
    // Also check pathname periodically in case it changes without popstate
    const interval = setInterval(() => {
      const currentPath = window.location.pathname;
      if (currentPath === '/success' && currentView !== 'success') {
        setCurrentView('success');
      } else if (currentPath === '/' && currentView === 'success') {
        setCurrentView('upload');
      }
    }, 100);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      clearInterval(interval);
    };
  }, [currentView, t]);

  // Reload QR drops when user changes (login/logout)
  useEffect(() => {
    if (!authLoading && !scanId) {
      loadQrDrops();
    }
  }, [user, authLoading, scanId]);

  const loadQrDrops = async () => {
    try {
      setIsLoading(true);
      const { qrDrops: data } = await getAllQrDrops();
      
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
            let qrCodeUrl2: string | undefined;
            
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
            
            // If Secure Mode, generate QR #2 (unlock code)
            if (qr.secureMode) {
              const unlockUrl = `${window.location.origin}/scan/${qr.id}?unlock=1`;
              
              if (qr.qrStyle) {
                const baseQr2 = await generateStyledQrCode(unlockUrl, qr.qrStyle);
                qrCodeUrl2 = await createBrandedQrCode(baseQr2);
              } else {
                const baseQr2 = await QRCode.toDataURL(unlockUrl, {
                  width: 400,
                  margin: 2,
                  color: {
                    dark: '#E8927E', // Use coral color for QR #2
                    light: '#FFFFFF',
                  },
                });
                qrCodeUrl2 = await createBrandedQrCode(baseQr2);
              }
            }
            
            const qrDrop = convertToQrDrop(qr, qrCodeUrl);
            if (qrCodeUrl2) {
              qrDrop.qrCodeUrl2 = qrCodeUrl2;
            }
            return qrDrop;
          } catch (error) {
            console.error(`Error generating QR for ${qr.id}:`, error);
            // Return with placeholder QR if generation fails
            return convertToQrDrop(qr, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
          }
        })
      );
      
      setQrDrops(qrDropsWithQr);
    } catch (error) {
      console.error('Failed to load QR drops:', error);
      toast.error(t('app.couldNotLoadQrs'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleQrCreated = async (newQrDrop: QrDrop) => {
    setQrDrops([newQrDrop, ...qrDrops]);
    setSelectedQrDrop(newQrDrop);
    setCurrentView('detail');
    toast.success(t('app.qrCreated'));
    
    // Scroll til toppen av siden
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
              <div className="flex items-center gap-3">
                <NordicLogo className="w-10 h-10 sm:w-12 sm:h-12" />
                <div>
                  <h1 className="text-[#3F3F3F]">{t('common.appName')}</h1>
                  <p className="text-[#5B5B5B] text-xs sm:text-sm">{t('common.tagline')}</p>
                </div>
              </div>
              
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
        {showQr2Error ? (
          // Show error screen when QR #2 is scanned without QR #1
          <div className="max-w-3xl mx-auto">
            <div 
              className="p-12 text-center rounded-2xl border"
              style={{ backgroundColor: '#FEF3F2', borderColor: '#E8927E' }}
            >
              <div 
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border"
                style={{ backgroundColor: '#FEE4E2', borderColor: '#E8927E' }}
              >
                <span className="text-4xl">🔒</span>
              </div>
              <h3 className="text-[#3F3F3F] mb-4">{t('app.mustScanQr1First')}</h3>
              <p className="text-[#5B5B5B] mb-6 leading-relaxed">
                {t('app.qr2WithoutQr1')}
                <br /><br />
                {t('app.secureModeUsesTwoQrs')}
                <br />
                {t('app.qr1AccessCode')}
                <br />
                {t('app.qr2UnlockCode')}
              </p>
              <button
                onClick={() => {
                  setShowQr2Error(false);
                  window.location.href = '/';
                }}
                className="px-6 py-3 rounded-xl transition-colors"
                style={{ 
                  backgroundColor: '#E8927E', 
                  color: 'white',
                  border: 'none'
                }}
              >
                {t('app.backToHome')}
              </button>
            </div>
          </div>
        ) : scanId ? (
          // Public scan page - wait for encryption key if fetching
          isFetchingKey ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5D8CC9] mx-auto"></div>
                <p className="text-[#5B5B5B]">{t('app.fetchingDecryptionKey')}</p>
              </div>
            </div>
          ) : (
            <ScanView 
              qrDropId={scanId}
              isDirectScan={true}
              unlockKey={unlockKey}
              onBack={() => {
                window.location.href = '/';
              }}
            />
          )
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
                unlockKey={unlockKey}
                onBack={() => {
                  setCurrentView('list');
                  handleScanComplete();
                }}
              />
            )}
            
            {currentView === 'unlock' && scanId && (
              <UnlockScreen 
                qrDropId={scanId}
                onUnlock={async (key: string) => {
                  // Redirect to scan view with unlock key
                  window.location.href = `/scan/${scanId}?key=${key}`;
                }}
                isUnlocking={false}
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