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
import { LegalPage } from './components/legal-page';
import { getAllQrDrops, deleteQrDrop, type QrDropData } from './utils/api-client';
import { projectId, publicAnonKey } from './utils/supabase/info';
import { toast, Toaster } from 'sonner@2.0.3';
import { LanguageSwitcher } from './components/language-switcher';
import { extractK1FromUrl, extractK2FromUrl } from './utils/encryption';

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
  const [currentView, setCurrentView] = useState<'upload' | 'list' | 'scan' | 'detail' | 'unlock' | 'success' | 'legal'>('upload');
  const [selectedQrDrop, setSelectedQrDrop] = useState<QrDrop | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Start as false, will be set to true when actually loading
  const [scanId, setScanId] = useState<string | null>(null);
  const [unlockKey, setUnlockKey] = useState<string | null>(null);
  const [isFetchingKey, setIsFetchingKey] = useState(false); // Track if we're fetching encryption key
  const [showQr2Error, setShowQr2Error] = useState(false); // Track if QR #2 was scanned without QR #1
  const [isLoadingQrDrops, setIsLoadingQrDrops] = useState(false); // Prevent multiple simultaneous loads

  // Check if we're on a scan, unlock, or success URL
  useEffect(() => {
    const updateViewFromPath = async () => {
      // MOBILE FIX: Small delay to ensure localStorage/sessionStorage is accessible after navigation
      // Some mobile browsers need a moment after navigation before storage is ready
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log('🔄 [APP] updateViewFromPath called, current path:', window.location.pathname, 'hash:', window.location.hash);
      console.log('🔄 [APP] Full URL:', window.location.href);
      console.log('🔄 [APP] Storage check - localStorage keys:', Object.keys(localStorage).filter(k => k.startsWith('k2_temp_')).length, 'sessionStorage keys:', Object.keys(sessionStorage).filter(k => k.startsWith('k2_temp_')).length);
      
      // CRITICAL FIX: Extract and store k1 immediately if present in URL (before any other processing)
      // This handles cases where QR1 is scanned and URL fragment might be lost during navigation
      const k1FromUrl = extractK1FromUrl();
      console.log('🔍 [APP] Initial k1 check:', {
        hasK1InUrl: !!k1FromUrl,
        hash: window.location.hash ? window.location.hash.substring(0, 50) + '...' : 'none',
        fullUrl: window.location.href.substring(0, 150) + '...'
      });
      if (k1FromUrl) {
        const scanMatchForK1 = window.location.pathname.match(/\/scan\/([^\/]+)/);
        if (scanMatchForK1) {
          const qrId = scanMatchForK1[1];
          console.log('🔑 [APP] Found k1 in URL hash - storing immediately for QR:', qrId);
          console.log('💾 [APP] Early k1 storage - BEFORE storage:', {
            qrId,
            k1Length: k1FromUrl.length,
            k1Preview: k1FromUrl.substring(0, 20) + '...',
            pathname: window.location.pathname,
            hash: window.location.hash ? window.location.hash.substring(0, 50) + '...' : 'none'
          });
          
          try {
            localStorage.setItem(`k1_${qrId}`, k1FromUrl);
            sessionStorage.setItem(`k1_${qrId}`, k1FromUrl);
            localStorage.setItem(`qr1_timestamp_${qrId}`, Date.now().toString());
            sessionStorage.setItem(`qr1_timestamp_${qrId}`, Date.now().toString());
            
            // Verify immediately
            const verifyK1Local = localStorage.getItem(`k1_${qrId}`);
            const verifyK1Session = sessionStorage.getItem(`k1_${qrId}`);
            console.log('✅ [APP] Early k1 storage verification:', {
              localStorage: verifyK1Local ? 'SUCCESS' : 'FAILED',
              sessionStorage: verifyK1Session ? 'SUCCESS' : 'FAILED',
              k1Length: k1FromUrl.length,
              storedLength: verifyK1Local?.length || 0,
              keysMatch: verifyK1Local === k1FromUrl
            });
            
            if (!verifyK1Local || verifyK1Local !== k1FromUrl) {
              console.warn('⚠️ [APP] Early k1 storage verification failed, retrying...');
              setTimeout(() => {
                localStorage.setItem(`k1_${qrId}`, k1FromUrl);
                sessionStorage.setItem(`k1_${qrId}`, k1FromUrl);
                const retryVerify = localStorage.getItem(`k1_${qrId}`);
                console.log('✅ [APP] Early k1 retry verification:', retryVerify === k1FromUrl ? 'SUCCESS' : 'FAILED');
              }, 50);
            }
          } catch (error) {
            console.error('❌ [APP] Failed to store k1 in early check:', error);
          }
        } else {
          console.warn('⚠️ [APP] k1 found in URL but no scan ID in pathname:', window.location.pathname);
          console.warn('⚠️ [APP] Expected pathname format: /scan/:id, got:', window.location.pathname);
        }
      } else {
        console.warn('⚠️ [APP] k1 NOT found in URL hash - this is the problem!');
        console.warn('⚠️ [APP] This means QR1 URL fragment (#k1=...) was lost or QR1 was scanned on different device');
        console.warn('⚠️ [APP] Current hash:', window.location.hash || 'EMPTY');
      }
      
      const path = window.location.pathname;
      const scanMatch = path.match(/\/scan\/([^\/]+)/);
      const unlockMatch = path.match(/\/unlock\/([^\/]+)/);
      const successMatch = path === '/success';
      const termsMatch = path === '/terms';
      
      if (termsMatch) {
        setCurrentView('legal');
      } else if (successMatch) {
        setCurrentView('success');
      } else if (unlockMatch) {
        // CRITICAL FIX: Handle /unlock/:id route FIRST (before scanMatch)
        // This is QR #2 scanned - unlock route with k2 (from fragment or storage)
        const unlockId = unlockMatch[1];
        console.log('🔓 [APP] Detected /unlock/:id route, unlockId:', unlockId);
        console.log('🔓 [APP] Current URL:', window.location.href);
        console.log('🔓 [APP] Hash:', window.location.hash);
        
        const k2FromUrl = extractK2FromUrl();
        
        console.log('🔍 [APP] Checking for unlock route:', {
          pathname: window.location.pathname,
          hasUnlockMatch: !!unlockMatch,
          unlockId: unlockId,
          k2FromUrl: k2FromUrl ? k2FromUrl.substring(0, 20) + '...' : null,
          hash: window.location.hash ? window.location.hash.substring(0, 50) + '...' : 'none'
        });
        
        // MOBILE FIX: Also check for k2 stored in localStorage/sessionStorage (from QR scanner)
        // Use localStorage so it works across windows/tabs (when user opens in new window)
        // This handles cases where mobile browsers lose the fragment during navigation
        
        // Check for k2 in localStorage first (works across windows), then sessionStorage (same window)
        let k2FromStorage = null;
        if (unlockId) {
          k2FromStorage = localStorage.getItem(`k2_temp_${unlockId}`) || sessionStorage.getItem(`k2_temp_${unlockId}`);
          if (k2FromStorage) {
            console.log('🔍 [APP] Found k2 in storage (unlockId):', localStorage.getItem(`k2_temp_${unlockId}`) ? 'localStorage' : 'sessionStorage');
          }
        }
        
        // List all k2_temp keys for debugging
        const allK2KeysLocal = Object.keys(localStorage).filter(k => k.startsWith('k2_temp_'));
        const allK2KeysSession = Object.keys(sessionStorage).filter(k => k.startsWith('k2_temp_'));
        console.log('🔍 [APP] All k2_temp keys in localStorage:', allK2KeysLocal);
        console.log('🔍 [APP] All k2_temp keys in sessionStorage:', allK2KeysSession);
        
        let k2 = k2FromUrl || k2FromStorage; // Prefer URL fragment, fallback to storage
        
        // MOBILE FIX: If we're on unlock route but k2 is missing from URL, try to get it from storage
        // This handles cases where mobile browsers lose the fragment during navigation
        if (!k2) {
          console.log('⚠️ [APP] On unlock route but k2 missing from URL and storage - checking all k2_temp keys...');
          // Try to find ANY k2_temp key (in case ID mismatch)
          const allK2Keys = [
            ...Object.keys(localStorage).filter(k => k.startsWith('k2_temp_')),
            ...Object.keys(sessionStorage).filter(k => k.startsWith('k2_temp_'))
          ];
          if (allK2Keys.length > 0) {
            // Use the most recent k2_temp key (assuming there's only one active QR2 scan)
            const firstK2Key = allK2Keys[0];
            const foundK2 = localStorage.getItem(firstK2Key) || sessionStorage.getItem(firstK2Key);
            if (foundK2) {
              console.log('✅ [APP] Found k2 in storage using fallback key:', firstK2Key);
              k2 = foundK2; // Use the found k2
            }
          }
        }
        
        console.log('🔍 [APP] k2 sources:', {
          k2FromUrl: !!k2FromUrl,
          k2FromUrlValue: k2FromUrl ? k2FromUrl.substring(0, 20) + '...' : null,
          k2FromStorage: !!k2FromStorage,
          k2FromStorageValue: k2FromStorage ? k2FromStorage.substring(0, 20) + '...' : null,
          finalK2: !!k2,
          finalK2Value: k2 ? k2.substring(0, 20) + '...' : null,
          unlockId: unlockId,
          allK2KeysLocal: Object.keys(localStorage).filter(k => k.startsWith('k2_temp_')),
          allK2KeysSession: Object.keys(sessionStorage).filter(k => k.startsWith('k2_temp_'))
        });
        
        if (k2) {
          // This is QR #2 scanned - unlock route with k2 (from fragment or storage)
          console.log('✅ [APP] k2 found - processing QR #2 unlock');
          console.log('✅ [APP] unlockId:', unlockId);
          console.log('✅ [APP] k2 found:', !!k2);
          
          // CRITICAL: Verify with server that QR1 was scanned (works across devices!)
          // Server stores that QR1 was scanned WITHOUT seeing k1 (zero-knowledge)
          let serverVerified = false;
          try {
            const { verifyQr1ForQr2 } = await import('./utils/api-client');
            console.log('📤 [APP] Calling verifyQr1ForQr2 with unlockId:', unlockId);
            const verifyResult = await verifyQr1ForQr2(unlockId);
            console.log('📥 [APP] verifyQr1ForQr2 result:', verifyResult);
            
            if (verifyResult.success && verifyResult.qr1Scanned) {
              serverVerified = true;
              console.log('✅ [APP] Server verified QR1 was scanned (zero-knowledge)');
            } else if (verifyResult.expired) {
              console.warn('⚠️ [APP] QR1 scan expired on server (older than 5 minutes)');
              toast.error(t('app.qr1ScanExpired'));
              setScanId(unlockId);
              setCurrentView('scan');
              return;
            } else {
              console.warn('⚠️ [APP] Server says QR1 was not scanned');
              console.log('🔴 [APP] Setting showQr2Error to TRUE');
              setShowQr2Error(true);
              setScanId(unlockId); // Keep scanId so error shows on unlock page, not redirect to home
              setCurrentView('scan'); // Show scan view with error, not redirect to upload
              console.log('🔴 [APP] showQr2Error set, scanId:', unlockId, 'currentView: scan');
              toast.error(t('app.mustScanQr1First'));
              // Clean up k2 if stored
              if (k2FromStorage) {
                localStorage.removeItem(`k2_temp_${unlockId}`);
                localStorage.removeItem(`k2_timestamp_${unlockId}`);
                sessionStorage.removeItem(`k2_temp_${unlockId}`);
                sessionStorage.removeItem(`k2_timestamp_${unlockId}`);
              }
              return;
            }
          } catch (error) {
            console.error('❌ [APP] Failed to verify QR1 with server:', error);
            // Fall through to local check as backup
          }
          
          // SECURITY CHECK: Ensure QR #1 was scanned first (k1 must be stored locally)
          // CRITICAL: QR1 and QR2 might have different IDs, so we need to find k1
          // Use localStorage so it works across windows/tabs (when user opens in new window)
          // Try multiple strategies:
          // 1. k1 with unlockId (QR2's ID) - check localStorage first, then sessionStorage
          // 2. Find ANY k1_* key and use it (if QR1 and QR2 have different IDs)
          let storedK1 = localStorage.getItem(`k1_${unlockId}`) || sessionStorage.getItem(`k1_${unlockId}`);
          
          // CRITICAL FIX: Also check if k1 is in the current URL hash (in case QR1 was just scanned)
          // This handles the case where user scans QR1 and QR2 in quick succession
          if (!storedK1) {
            const k1FromCurrentUrl = extractK1FromUrl();
            if (k1FromCurrentUrl) {
              console.log('🔍 [APP] Found k1 in current URL hash - storing it now!');
              // Store k1 immediately
              localStorage.setItem(`k1_${unlockId}`, k1FromCurrentUrl);
              sessionStorage.setItem(`k1_${unlockId}`, k1FromCurrentUrl);
              localStorage.setItem(`qr1_timestamp_${unlockId}`, Date.now().toString());
              sessionStorage.setItem(`qr1_timestamp_${unlockId}`, Date.now().toString());
              storedK1 = k1FromCurrentUrl;
              console.log('✅ [APP] k1 stored from URL hash');
            }
          }
          
          // If still not found, search for ANY k1_* key (handles case where QR1 and QR2 have different IDs)
          if (!storedK1) {
            console.log('🔍 [APP] k1 not found with unlockId, searching for ANY k1_* key...');
            const allK1KeysLocal = Object.keys(localStorage).filter(k => k.startsWith('k1_'));
            const allK1KeysSession = Object.keys(sessionStorage).filter(k => k.startsWith('k1_'));
            const allK1Keys = [...allK1KeysLocal, ...allK1KeysSession];
            console.log('🔍 [APP] All k1 keys found:', allK1Keys);
            if (allK1Keys.length > 0) {
              // Use the first k1 we find (assuming there's only one active QR1 scan)
              const firstK1Key = allK1Keys[0];
              storedK1 = localStorage.getItem(firstK1Key) || sessionStorage.getItem(firstK1Key);
              console.log('🔍 [APP] Found k1 using key:', firstK1Key);
              // Also store it with unlockId for future use
              if (storedK1) {
                localStorage.setItem(`k1_${unlockId}`, storedK1);
                sessionStorage.setItem(`k1_${unlockId}`, storedK1);
                console.log('✅ [APP] k1 copied to unlockId key');
              }
            }
          }
          
          console.log('🔍 [APP] k1 lookup:', {
            serverVerified,
            withUnlockIdLocal: !!localStorage.getItem(`k1_${unlockId}`),
            withUnlockIdSession: !!sessionStorage.getItem(`k1_${unlockId}`),
            finalK1: !!storedK1,
            allK1KeysLocal: Object.keys(localStorage).filter(k => k.startsWith('k1_')),
            allK1KeysSession: Object.keys(sessionStorage).filter(k => k.startsWith('k1_'))
          });
          
          // If server verified but no local k1, we can't decrypt (k1 is in URL fragment from QR1)
          // This happens when QR1 was scanned on a different device, or k1 was lost
          // IMPROVED: Check URL one more time in case k1 is still in fragment (mobile browser quirk)
          if (serverVerified && !storedK1) {
            console.warn('⚠️ [APP] Server verified QR1 was scanned, but k1 not found locally');
            console.warn('⚠️ [APP] This means QR1 was scanned on a different device, or k1 was lost');
            
            // LAST CHANCE: Check if k1 is still in URL fragment (mobile browsers sometimes preserve it)
            const k1FromUrlLastChance = extractK1FromUrl();
            if (k1FromUrlLastChance) {
              console.log('🔍 [APP] Found k1 in URL fragment on last check - storing now!');
              localStorage.setItem(`k1_${unlockId}`, k1FromUrlLastChance);
              sessionStorage.setItem(`k1_${unlockId}`, k1FromUrlLastChance);
              localStorage.setItem(`qr1_timestamp_${unlockId}`, Date.now().toString());
              sessionStorage.setItem(`qr1_timestamp_${unlockId}`, Date.now().toString());
              storedK1 = k1FromUrlLastChance;
              console.log('✅ [APP] k1 recovered from URL fragment - continuing with unlock');
              // Continue to combine k1+k2 below instead of returning
            } else {
              console.warn('⚠️ [APP] Solution: User must scan QR1 again on THIS device to get k1');
              console.log('🔴 [APP] Setting showQr2Error to TRUE (server verified but no k1)');
              setShowQr2Error(true);
              setScanId(unlockId); // Keep scanId so error shows on unlock page, not redirect to home
              setCurrentView('scan'); // Show scan view with error, not redirect to upload
              console.log('🔴 [APP] showQr2Error set, scanId:', unlockId, 'currentView: scan');
              // Don't show error toast - the error screen will explain it better
              // Clean up k2 if stored (we'll need to scan QR2 again after scanning QR1)
              if (k2FromStorage) {
                console.log('🧹 [APP] Cleaning up k2 since k1 is missing - user needs to scan QR1 first');
                localStorage.removeItem(`k2_temp_${unlockId}`);
                localStorage.removeItem(`k2_timestamp_${unlockId}`);
                sessionStorage.removeItem(`k2_temp_${unlockId}`);
                sessionStorage.removeItem(`k2_timestamp_${unlockId}`);
              }
              return;
            }
          }
          
          // If no server verification and no local k1, fail
          if (!serverVerified && !storedK1) {
            console.warn('⚠️ [APP] QR #2 scanned without QR #1 - showing error message');
            console.warn('⚠️ [APP] Checked keys:', {
              unlockId: `k1_${unlockId}`
            });
            console.log('🔴 [APP] Setting showQr2Error to TRUE (no server verification and no k1)');
            setShowQr2Error(true);
            setScanId(unlockId); // Keep scanId so error shows on unlock page, not redirect to home
            setCurrentView('scan'); // Show scan view with error, not redirect to upload
            console.log('🔴 [APP] showQr2Error set, scanId:', unlockId, 'currentView: scan');
            toast.error(t('app.mustScanQr1First'));
            // Clean up k2 if stored (both localStorage and sessionStorage)
            if (k2FromStorage) {
              localStorage.removeItem(`k2_temp_${unlockId}`);
              localStorage.removeItem(`k2_timestamp_${unlockId}`);
              sessionStorage.removeItem(`k2_temp_${unlockId}`);
              sessionStorage.removeItem(`k2_timestamp_${unlockId}`);
            }
            return;
          }
          
          // SECURITY CHECK #2: Verify the timestamp is recent (within 5 minutes) - local backup check
          const timestamp = localStorage.getItem(`qr1_timestamp_${unlockId}`) || sessionStorage.getItem(`qr1_timestamp_${unlockId}`);
          if (timestamp) {
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            
            if (now - parseInt(timestamp, 10) > fiveMinutes) {
              console.warn('⚠️ QR #1 scan expired locally (older than 5 minutes) - please scan QR #1 again');
              localStorage.removeItem(`k1_${unlockId}`);
              sessionStorage.removeItem(`k1_${unlockId}`);
              localStorage.removeItem(`qr1_timestamp_${unlockId}`);
              sessionStorage.removeItem(`qr1_timestamp_${unlockId}`);
              if (k2FromStorage) {
                localStorage.removeItem(`k2_temp_${unlockId}`);
                localStorage.removeItem(`k2_timestamp_${unlockId}`);
                sessionStorage.removeItem(`k2_temp_${unlockId}`);
                sessionStorage.removeItem(`k2_timestamp_${unlockId}`);
              }
              setScanId(unlockId);
              setCurrentView('scan');
              toast.error(t('app.qr1ScanExpired'));
              return;
            }
          }
          
          // Combine k1 and k2 to get master key
          try {
            console.log('🔑 [APP] Combining k1 and k2 for QR drop:', unlockId);
            console.log('🔑 [APP] k1 (from storage):', storedK1 ? storedK1.substring(0, 20) + '...' : 'MISSING');
            console.log('🔑 [APP] k2 source:', k2FromUrl ? 'URL fragment' : k2FromStorage ? 'sessionStorage' : 'MISSING');
            console.log('🔑 [APP] k2 value:', k2 ? k2.substring(0, 20) + '...' : 'MISSING');
            
            const { combineKeys } = await import('./utils/encryption');
            const masterKey = combineKeys(storedK1, k2);
            const masterKeyHex = Array.from(masterKey)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
            
            console.log('✅ [APP] Master key generated, storing in sessionStorage...');
            
            // Store master key with unlockId
            sessionStorage.setItem(`master_${unlockId}`, masterKeyHex);
            
            // Clean up temporary k2 storage (both localStorage and sessionStorage)
            if (k2FromStorage) {
              localStorage.removeItem(`k2_temp_${unlockId}`);
              localStorage.removeItem(`k2_timestamp_${unlockId}`);
              sessionStorage.removeItem(`k2_temp_${unlockId}`);
              sessionStorage.removeItem(`k2_timestamp_${unlockId}`);
            }
            
            // Verify it was stored
            const verifyMaster = sessionStorage.getItem(`master_${unlockId}`);
            console.log('✅ [APP] Master key stored:', verifyMaster ? 'SUCCESS' : 'FAILED');
            
            setScanId(unlockId);
            setUnlockKey(masterKeyHex);
            setCurrentView('scan');
            
            // Clean up URL - redirect to scan view
            console.log('🔄 [APP] Redirecting to /scan/' + unlockId);
            window.history.replaceState({}, '', `/scan/${unlockId}`);
            
            console.log('✅ [APP] Combined split keys - master key ready for decryption');
            console.log('✅ [APP] Redirected to /scan/' + unlockId);
          } catch (error) {
            console.error('❌ [APP] Failed to combine split keys:', error);
            console.error('❌ [APP] Error details:', error);
            toast.error('Kunne ikke kombinere nøkler. Prøv på nytt.');
            // Clean up on error (both localStorage and sessionStorage)
            if (k2FromStorage) {
              localStorage.removeItem(`k2_temp_${unlockId}`);
              localStorage.removeItem(`k2_timestamp_${unlockId}`);
              sessionStorage.removeItem(`k2_temp_${unlockId}`);
              sessionStorage.removeItem(`k2_timestamp_${unlockId}`);
            }
          }
        } else {
          // k2 not found - show error
          console.warn('⚠️ [APP] On /unlock/:id route but k2 not found');
          setShowQr2Error(true);
          setScanId(unlockId);
          setCurrentView('scan');
          toast.error('QR2 nøkkel ikke funnet. Prøv å skanne QR2 på nytt.');
        }
      } else if (scanMatch) {
        // We're on a scan page (QR #1 scanned)
        const id = scanMatch[1];
        const searchParams = new URLSearchParams(window.location.search);
        const key = searchParams.get('key'); // Legacy: decryption key in query
        const unlock = searchParams.get('unlock'); // Legacy: unlock flag
        
        // PRIORITY: Check if we have master key already stored (from QR #2 scan that redirected here)
        // This must be checked FIRST, before checking for k1/k2 in URL
        const storedMasterKey = sessionStorage.getItem(`master_${id}`);
        if (storedMasterKey) {
          // We already have the master key from QR #2 - use it directly
          console.log('✅ Master key found in sessionStorage (priority check) - using for decryption');
          setScanId(id);
          setUnlockKey(storedMasterKey);
          setCurrentView('scan');
          return; // Don't continue to other checks
        }
        
        // NEW: Check for split-key in URL fragment (k1 from QR #1)
        // Also check if k1 is already stored (in case QR1 was scanned earlier)
        let k1 = extractK1FromUrl();
        const storedK1 = localStorage.getItem(`k1_${id}`) || sessionStorage.getItem(`k1_${id}`);
        
        console.log('🔍 [APP] QR1 scan check:', {
          id,
          hasK1InUrl: !!k1,
          hasK1InStorage: !!storedK1,
          k1Value: k1 ? k1.substring(0, 20) + '...' : (storedK1 ? storedK1.substring(0, 20) + '...' : null),
          hash: window.location.hash ? window.location.hash.substring(0, 50) + '...' : 'none',
          pathname: window.location.pathname,
          fullUrl: window.location.href.substring(0, 100) + '...'
        });
        
        // Use k1 from URL if available, otherwise use stored k1
        if (!k1 && storedK1) {
          console.log('💾 [APP] k1 not in URL, but found in storage - using stored k1');
          k1 = storedK1;
        }
        
        if (k1) {
          // This is QR #1 scanned - store k1 and show scan view
          // Use localStorage so it works across windows/tabs (when user opens in new window)
          console.log('💾 [APP] Storing k1 for QR1:', id, 'k1 length:', k1.length);
          
          // CRITICAL FIX: Store k1 IMMEDIATELY and verify BEFORE any async operations
          // This ensures k1 is persisted even if there are timing issues
          console.log('💾 [APP] Storing k1 - BEFORE storage:', {
            id,
            k1Length: k1.length,
            k1Preview: k1.substring(0, 20) + '...',
            localStorageAvailable: typeof localStorage !== 'undefined',
            sessionStorageAvailable: typeof sessionStorage !== 'undefined'
          });
          
          try {
            localStorage.setItem(`k1_${id}`, k1);
            localStorage.setItem(`qr1_timestamp_${id}`, Date.now().toString());
            // Also store in sessionStorage as backup (for same-window flow)
            sessionStorage.setItem(`k1_${id}`, k1);
            sessionStorage.setItem(`qr1_timestamp_${id}`, Date.now().toString());
            
            // Verify it was stored IMMEDIATELY (synchronous check)
            const verifyK1Local = localStorage.getItem(`k1_${id}`);
            const verifyK1Session = sessionStorage.getItem(`k1_${id}`);
            console.log('✅ [APP] k1 storage verification (immediate):', {
              localStorage: verifyK1Local ? 'SUCCESS' : 'FAILED',
              sessionStorage: verifyK1Session ? 'SUCCESS' : 'FAILED',
              k1Length: k1.length,
              storedLength: verifyK1Local?.length || 0,
              storedPreview: verifyK1Local ? verifyK1Local.substring(0, 20) + '...' : 'MISSING',
              keysMatch: verifyK1Local === k1
            });
            
            // CRITICAL: If storage failed, try again with a small delay (mobile browser quirk)
            if (!verifyK1Local || !verifyK1Session || verifyK1Local !== k1) {
              console.warn('⚠️ [APP] k1 storage verification failed or mismatch, retrying...');
              setTimeout(() => {
                localStorage.setItem(`k1_${id}`, k1);
                sessionStorage.setItem(`k1_${id}`, k1);
                const retryVerify = localStorage.getItem(`k1_${id}`);
                const retryMatch = retryVerify === k1;
                console.log('✅ [APP] k1 retry storage verification:', {
                  success: retryVerify ? 'YES' : 'NO',
                  match: retryMatch ? 'YES' : 'NO',
                  storedLength: retryVerify?.length || 0
                });
              }, 50);
            }
          } catch (storageError) {
            console.error('❌ [APP] Failed to store k1:', storageError);
            // Try one more time
            try {
              localStorage.setItem(`k1_${id}`, k1);
              sessionStorage.setItem(`k1_${id}`, k1);
              console.log('✅ [APP] k1 storage retry after error: SUCCESS');
            } catch (retryError) {
              console.error('❌ [APP] k1 storage retry also failed:', retryError);
            }
          }
          
          // CRITICAL: Mark QR1 as scanned on server (zero-knowledge - server never sees k1)
          // This allows QR2 to be scanned on a different device and still work
          try {
            const { markQr1Scanned } = await import('./utils/api-client');
            console.log('📤 [APP] Calling markQr1Scanned with ID:', id);
            const result = await markQr1Scanned(id);
            console.log('✅ [APP] QR #1 scan recorded on server (zero-knowledge):', result);
            console.log('✅ [APP] ID used for QR1 scan:', id);
          } catch (error) {
            console.error('⚠️ [APP] Failed to record QR1 scan on server:', error);
            // Continue anyway - local storage is backup
          }
          
          setScanId(id);
          setCurrentView('scan');
          
          // CRITICAL FIX: Clean up URL fragment AFTER k1 is stored and verified
          // Use setTimeout to ensure storage operations complete first (especially on mobile)
          setTimeout(() => {
            window.history.replaceState({}, '', `/scan/${id}`);
            console.log('🧹 [APP] URL fragment cleaned after k1 storage');
          }, 100);
          
          console.log('✅ QR #1 scanned - k1 stored, waiting for QR #2');
        } else if (unlock === '1') {
          // Legacy: QR #2 with unlock flag (old method - fetch from server)
          // This should not happen with new split-key system, but keep for backwards compatibility
          const qr1Scanned = localStorage.getItem(`qr1_scanned_${id}`);
          
          if (!qr1Scanned) {
            console.warn('⚠️ QR #2 scanned without QR #1 - showing error message');
            setShowQr2Error(true);
            toast.error(t('app.mustScanQr1First'));
            return;
          }
          
          const timestamp = parseInt(qr1Scanned, 10);
          const now = Date.now();
          const fiveMinutes = 5 * 60 * 1000;
          
          if (now - timestamp > fiveMinutes) {
            console.warn('⚠️ QR #1 scan expired (older than 5 minutes) - please scan QR #1 again');
            localStorage.removeItem(`qr1_scanned_${id}`);
            setScanId(id);
            setCurrentView('scan');
            toast.error(t('app.qr1ScanExpired'));
            return;
          }
          
          setScanId(id);
          setCurrentView('scan');
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
        } else {
          // Regular scan (not QR #2, no split-key)
          // BUT: Check if we have k2 in localStorage/sessionStorage (from QR #2 scan that navigated here)
          // Use localStorage so it works across windows/tabs
          // This handles the case where we navigated to /unlock/:id but ended up on /scan/:id
          const storedK2 = localStorage.getItem(`k2_temp_${id}`) || sessionStorage.getItem(`k2_temp_${id}`);
          const storedK1 = localStorage.getItem(`k1_${id}`) || sessionStorage.getItem(`k1_${id}`);
          
          console.log(`🔍 Regular scan check for ${id}:`, {
            hasK1: !!storedK1,
            hasK2: !!storedK2,
            hasKeyParam: !!key,
            path: window.location.pathname,
            hash: window.location.hash
          });
          
          // If we have both k1 and k2, combine them NOW (even though we're on /scan/:id)
          if (storedK1 && storedK2) {
            console.log('🔑 [APP] Found both k1 and k2 on /scan/:id - combining now!');
            try {
              const { combineKeys } = await import('./utils/encryption');
              const masterKey = combineKeys(storedK1, storedK2);
              const masterKeyHex = Array.from(masterKey)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
              
              console.log('✅ [APP] Master key generated from k1+k2 on /scan/:id');
              
              // Store master key
              sessionStorage.setItem(`master_${id}`, masterKeyHex);
              
              // Clean up temporary k2 storage (both localStorage and sessionStorage)
              localStorage.removeItem(`k2_temp_${id}`);
              localStorage.removeItem(`k2_timestamp_${id}`);
              sessionStorage.removeItem(`k2_temp_${id}`);
              sessionStorage.removeItem(`k2_timestamp_${id}`);
              
              setScanId(id);
              setUnlockKey(masterKeyHex);
              setCurrentView('scan');
              
              console.log('✅ [APP] Combined split keys on /scan/:id - master key ready');
            } catch (error) {
              console.error('❌ [APP] Failed to combine keys on /scan/:id:', error);
              // Fall through to regular scan handling
            }
          } else if (storedK1) {
            // We have k1 but not master key - waiting for QR #2
            console.log('⏳ k1 found but no master key - waiting for QR #2');
            setScanId(id);
            setCurrentView('scan');
            // Don't set unlockKey - ScanView will show UnlockScreen
          } else {
            // Regular scan (not QR #2, no split-key, no master key, no k1)
            console.log('📱 Regular scan (no split-key)');
            setScanId(id);
            setUnlockKey(key);
            setCurrentView('scan');
          }
        }
      } else {
        // Normal app flow - OAuth callback is now handled in AuthContext
        loadQrDrops();
      }
    };
    
    // Initial view update
    updateViewFromPath().catch(console.error);
    
    // Listen for pathname changes (including browser back/forward)
    const handlePopState = () => {
      updateViewFromPath().catch(console.error);
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
        {(() => {
          console.log('🎨 [APP] Rendering main content - showQr2Error:', showQr2Error, 'scanId:', scanId, 'currentView:', currentView);
          return null;
        })()}
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
                <br /><br />
                <span className="text-sm">
                  {t('app.qr1MayBeOnDifferentDevice', { defaultValue: 'Tip: If you scanned QR1 on a different device or in a different browser, scan QR1 again on this device to continue.' })}
                </span>
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    // Navigate to scan QR1 for this QR drop
                    setShowQr2Error(false);
                    if (scanId) {
                      window.location.href = `/scan/${scanId}`;
                    } else {
                      window.location.href = '/';
                    }
                  }}
                  className="px-6 py-3 rounded-xl transition-colors"
                  style={{ 
                    backgroundColor: '#5D8CC9', 
                    color: 'white',
                    border: 'none'
                  }}
                >
                  {t('app.scanQr1Now', { defaultValue: 'Scan QR #1 Now' })}
                </button>
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
              showQr2Error={showQr2Error}
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
            {/* Debug: Log scanId when unlock view is shown */}
            {currentView === 'unlock' && scanId && (
              <script dangerouslySetInnerHTML={{__html: `
                console.log('🔍 [APP] UnlockScreen rendered with scanId:', '${scanId}', 'length:', ${scanId?.length || 0});
              `}} />
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