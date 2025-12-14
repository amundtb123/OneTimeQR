import { useState, useEffect, useRef } from 'react';
import { Shield, Key, Scan, Loader2, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SoftCard } from './soft-card';
import { NordicButton } from './nordic-button';
import { QrScanner } from './qr-scanner-html5';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { markQr1Scanned } from '../utils/api-client';
import { toast } from 'sonner@2.0.3';

// Safe storage wrapper that handles quota errors
function safeSetItem(storage: Storage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch (error: any) {
    if (error.name === 'QuotaExceededError' || error.message?.includes('quota')) {
      console.warn(`⚠️ [UNLOCK SCREEN] Storage quota exceeded for key: ${key}`);
      return false;
    }
    console.error(`❌ [UNLOCK SCREEN] Storage error for key: ${key}`, error);
    return false;
  }
}

interface UnlockScreenProps {
  onUnlock: (key: string) => Promise<void>;
  isUnlocking: boolean;
  qrDropId?: string; // Optional: to show expiry countdown
}

export function UnlockScreen({ onUnlock, isUnlocking, qrDropId }: UnlockScreenProps) {
  const { t } = useTranslation();
  const [hasK1, setHasK1] = useState(false);
  const [checkingK1, setCheckingK1] = useState(true);
  
  // DEBUG: Log qrDropId to check for truncation
  useEffect(() => {
    if (qrDropId) {
      console.log('🔍 [UNLOCK SCREEN] qrDropId received:', qrDropId);
      console.log('🔍 [UNLOCK SCREEN] qrDropId length:', qrDropId.length);
      console.log('🔍 [UNLOCK SCREEN] qrDropId type:', typeof qrDropId);
      // Check if it looks like a truncated UUID (should be 36 chars for full UUID)
      if (qrDropId.length < 36) {
        console.warn('⚠️ [UNLOCK SCREEN] qrDropId appears truncated! Expected 36 chars, got:', qrDropId.length);
      }
    }
  }, [qrDropId]);
  
  // CRITICAL: Check if k1 is already stored (QR1 was scanned)
  useEffect(() => {
    if (qrDropId) {
      setCheckingK1(true);
      // Check both localStorage and sessionStorage for k1
      const k1Local = localStorage.getItem(`k1_${qrDropId}`);
      const k1Session = sessionStorage.getItem(`k1_${qrDropId}`);
      const k1FromUrl = (() => {
        const hash = window.location.hash;
        const match = hash.match(/k1=([^&]+)/);
        return match ? match[1] : null;
      })();
      
      const hasK1Value = !!(k1Local || k1Session || k1FromUrl);
      
      console.log('🔍 [UNLOCK SCREEN] k1 check:', {
        qrDropId,
        k1Local: !!k1Local,
        k1Session: !!k1Session,
        k1FromUrl: !!k1FromUrl,
        hasK1: hasK1Value
      });
      
      setHasK1(hasK1Value);
      setCheckingK1(false);
      
      // If k1 is in URL but not in storage, store it now
      if (k1FromUrl && !k1Local && !k1Session) {
        console.log('💾 [UNLOCK SCREEN] Found k1 in URL, storing now...');
        const timestamp = Date.now().toString();
        const stored = safeSetItem(localStorage, `k1_${qrDropId}`, k1FromUrl);
        const storedSession = safeSetItem(sessionStorage, `k1_${qrDropId}`, k1FromUrl);
        safeSetItem(localStorage, `qr1_timestamp_${qrDropId}`, timestamp);
        safeSetItem(sessionStorage, `qr1_timestamp_${qrDropId}`, timestamp);
        if (stored || storedSession) {
          setHasK1(true);
        } else {
          console.error('❌ [UNLOCK SCREEN] Failed to store k1 due to storage quota');
          toast.error('Kunne ikke lagre nøkkel. Prøv å tømme nettleserens cache.');
        }
      }
    }
  }, [qrDropId]);
  
  // SECURITY: Mark QR #1 as scanned IMMEDIATELY when this screen renders
  // This must happen synchronously so QR #2 can check it instantly
  // IMPORTANT: Use sessionStorage to match App.tsx which checks sessionStorage for k1
  const hasMarkedRef = useRef(false);
  if (!hasMarkedRef.current && qrDropId) {
    // Note: k1 is stored in App.tsx when QR #1 is scanned with k1 in fragment
    // This is just a backup marker - the real k1 storage happens in App.tsx
    safeSetItem(sessionStorage, `qr1_scanned_${qrDropId}`, Date.now().toString());
    console.log('🔐 [SYNC] Marked QR #1 as scanned immediately on render for:', qrDropId);
    console.log('🔐 [SYNC] qrDropId full value:', JSON.stringify(qrDropId));
    hasMarkedRef.current = true;
  }

  // CRITICAL: Call API to mark QR1 as scanned on server (for cross-device support)
  useEffect(() => {
    if (qrDropId && hasMarkedRef.current) {
      // Only call once per qrDropId
      const apiCallKey = `qr1_api_called_${qrDropId}`;
      if (!sessionStorage.getItem(apiCallKey)) {
        safeSetItem(sessionStorage, apiCallKey, 'true');
        markQr1Scanned(qrDropId)
          .then((result) => {
            console.log('✅ [UNLOCK SCREEN] QR #1 scan recorded on server:', result);
          })
          .catch((error) => {
            console.error('⚠️ [UNLOCK SCREEN] Failed to record QR1 scan on server:', error);
            // Continue anyway - local storage is backup
          });
      }
    }
  }, [qrDropId]);

  const [showScanner, setShowScanner] = useState(false);
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [expiryType, setExpiryType] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Load QR drop expiry info using lightweight check (doesn't increment scan count)
  useEffect(() => {
    if (qrDropId) {
      // Use lightweight /check endpoint instead of full getQrDrop
      // This prevents incrementing the scan count when viewing QR #1
      fetch(`https://${projectId}.supabase.co/functions/v1/make-server-c3c9181e/qrdrop/${qrDropId}/check`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      })
        .then(async res => {
          if (!res.ok) throw new Error('Failed to load QR drop');
          const data = await res.json();
          if (data.expiresAt) {
            setExpiryDate(new Date(data.expiresAt));
          }
          if (data.expiryType) {
            setExpiryType(data.expiryType);
          }
        })
        .catch(err => {
          console.error('Failed to load QR drop expiry:', err);
        });
    }
  }, [qrDropId]);

  // Update current time every second for countdown
  useEffect(() => {
    if (!expiryDate) return;
    
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [expiryDate]);

  const formatExpiryTime = () => {
    if (!expiryDate) return null;
    
    const now = currentTime;
    const diff = expiryDate.getTime() - now.getTime();
    
    if (diff <= 0) {
      return t('qrList.expired');
    }
    
    const totalSeconds = Math.floor(diff / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    // Under 24 timer: vis minutter og sekunder
    if (hours < 24) {
      if (hours > 0) {
        const remainingMinutes = minutes % 60;
        return t('qrList.expiresInHours', { hours, minutes: remainingMinutes, seconds });
      }
      return t('qrList.expiresInMinutes', { minutes, seconds });
    }
    
    // Over 24 timer: vis dager
    if (days === 1) {
      return t('qrList.expiresInDays', { days });
    }
    return t('qrList.expiresInDaysPlural', { days });
  };

  const handleScanQr1Click = () => {
    console.log('🔘 [UNLOCK SCREEN] Scan QR1 button clicked');
    console.log('🔘 [UNLOCK SCREEN] Current qrDropId:', qrDropId);
    setShowScanner(true);
    console.log('🔘 [UNLOCK SCREEN] showScanner state updated (QR1 mode)');
  };
  
  const handleScanQr2Click = () => {
    console.log('🔘 [UNLOCK SCREEN] Scan QR2 button clicked');
    console.log('🔘 [UNLOCK SCREEN] Current qrDropId:', qrDropId);
    setShowScanner(true);
    console.log('🔘 [UNLOCK SCREEN] showScanner state updated (QR2 mode)');
  };
  
  // Legacy handler for backwards compatibility
  const handleScanClick = handleScanQr2Click;

  const handleQrScanned = (data: string) => {
    console.log('📱 [UNLOCK SCREEN] QR code scanned, raw data:', data);
    console.log('📱 [UNLOCK SCREEN] Current qrDropId:', qrDropId);
    
    // CRITICAL FIX: Some QR scanners convert # to @ in URLs
    // Fix this before parsing
    let fixedData = data;
    if (data.includes('@k1=') || data.includes('@k2=')) {
      console.warn('⚠️ [UNLOCK SCREEN] QR scanner converted # to @ - fixing...');
      fixedData = data.replace(/@k1=/g, '#k1=').replace(/@k2=/g, '#k2=');
      console.log('✅ [UNLOCK SCREEN] Fixed URL:', fixedData.substring(0, 100) + '...');
    }
    
    // Parse URL to extract key, unlock parameter, or k2 fragment
    try {
      const url = new URL(fixedData);
      console.log('📱 [UNLOCK SCREEN] Parsed URL:', {
        origin: url.origin,
        pathname: url.pathname,
        hash: url.hash,
        search: url.search,
        hadAtSymbol: data.includes('@k1=') || data.includes('@k2=')
      });
      
      const key = url.searchParams.get('key');
      const unlock = url.searchParams.get('unlock');
      
      // NEW: Check for k2 in URL fragment (split-key QR #2)
      const hash = url.hash;
      const hasK2 = hash && hash.includes('k2=');
      
      console.log('📱 [UNLOCK SCREEN] URL analysis:', {
        hasKey: !!key,
        hasUnlock: unlock === '1',
        hasK2: hasK2,
        hash: hash ? hash.substring(0, 50) + '...' : 'none'
      });
      
      // Extract k2 value if present (for split-key mode)
      let k2Value: string | null = null;
      if (hasK2) {
        const k2Match = hash.match(/k2=([^&]+)/);
        if (k2Match) {
          k2Value = k2Match[1];
          console.log('🔑 [UNLOCK SCREEN] Extracted k2 from scanned QR:', k2Value.substring(0, 20) + '...');
        } else {
          console.warn('⚠️ [UNLOCK SCREEN] Hash contains k2= but regex match failed');
        }
      }
      
      // Check if this is QR #1 (has k1 in fragment)
      const hasK1InScanned = hash && hash.includes('k1=');
      if (hasK1InScanned) {
        console.log('✅ [UNLOCK SCREEN] Valid QR #1 detected, processing...');
        const k1Match = hash.match(/k1=([^&]+)/);
        if (k1Match && qrDropId) {
          const k1Value = k1Match[1];
          console.log('🔑 [UNLOCK SCREEN] Extracted k1 from scanned QR:', k1Value.substring(0, 20) + '...');
          
          // Extract ID from pathname
          let pathMatch = url.pathname.match(/\/scan\/([^/]+)/);
          if (pathMatch) {
            const fileId = pathMatch[1];
            console.log('💾 [UNLOCK SCREEN] Storing k1 for QR1:', fileId);
            
            // Store k1 immediately
            const timestamp = Date.now().toString();
            const storedK1 = safeSetItem(localStorage, `k1_${fileId}`, k1Value);
            const storedK1Session = safeSetItem(sessionStorage, `k1_${fileId}`, k1Value);
            safeSetItem(localStorage, `qr1_timestamp_${fileId}`, timestamp);
            safeSetItem(sessionStorage, `qr1_timestamp_${fileId}`, timestamp);
            
            if (!storedK1 && !storedK1Session) {
              console.error('❌ [UNLOCK SCREEN] Failed to store k1 due to storage quota');
              toast.error('Kunne ikke lagre nøkkel. Prøv å tømme nettleserens cache.');
            }
            
            // Mark QR1 as scanned on server
            markQr1Scanned(fileId)
              .then((result) => {
                console.log('✅ [UNLOCK SCREEN] QR #1 scan recorded on server:', result);
              })
              .catch((error) => {
                console.error('⚠️ [UNLOCK SCREEN] Failed to record QR1 scan on server:', error);
              });
            
            // Update hasK1 state
            if (storedK1 || storedK1Session) {
              setHasK1(true);
            }
            
            // Also update for qrDropId if different
            if (qrDropId && qrDropId !== fileId) {
              safeSetItem(localStorage, `k1_${qrDropId}`, k1Value);
              safeSetItem(sessionStorage, `k1_${qrDropId}`, k1Value);
            }
            
            // Close scanner and show success message
            setShowScanner(false);
            console.log('✅ [UNLOCK SCREEN] QR1 scanned successfully, k1 stored. Ready for QR2.');
            
            // Show toast notification
            toast.success(t('unlockScreen.qr1Scanned', { defaultValue: 'QR #1 scanned! Now scan QR #2.' }));
            return;
          }
        }
      }
      
      // Check if this is QR #2 (legacy: key/unlock, or new: k2 fragment)
      if (key || unlock === '1' || hasK2) {
        console.log('✅ [UNLOCK SCREEN] Valid QR #2 detected, processing...');
        
        // For split-key mode (k2 in fragment), extract and store k2 BEFORE navigation
        // This ensures we don't lose k2 on mobile browsers that might mishandle fragments
        if (hasK2 && k2Value) {
          // Extract fileId from path (e.g., /unlock/:id or /scan/unlock/:id)
          // CRITICAL: Use fileId from the SCANNED QR2 URL, NOT qrDropId from props
          // qrDropId from props is QR1's ID, but we need QR2's ID from the scanned URL
          // Try both /unlock/:id and /scan/unlock/:id patterns
          let pathMatch = url.pathname.match(/\/unlock\/([^/]+)/);
          if (!pathMatch) {
            pathMatch = url.pathname.match(/\/scan\/unlock\/([^/]+)/);
          }
          if (pathMatch) {
            const fileId = pathMatch[1]; // This is QR2's ID from the scanned URL
            console.log('💾 [UNLOCK SCREEN] Storing k2 in sessionStorage before navigation for:', fileId);
            console.log('💾 [UNLOCK SCREEN] Current qrDropId (from props - QR1 ID):', qrDropId);
            console.log('💾 [UNLOCK SCREEN] fileId from scanned QR2 URL (QR2 ID):', fileId);
            console.log('💾 [UNLOCK SCREEN] k2 value length:', k2Value.length);
            
            // CRITICAL FIX: Store k2 with QR2's ID (fileId from scanned URL)
            // Use localStorage instead of sessionStorage so it works across windows/tabs
            // This is safe because k2 alone is useless without k1
            if (qrDropId && qrDropId !== fileId) {
              console.warn('⚠️ [UNLOCK SCREEN] ID mismatch! QR1 ID (props):', qrDropId, 'vs QR2 ID (scanned):', fileId);
              console.log('💾 [UNLOCK SCREEN] Storing k2 with BOTH keys for safety');
              // Store with QR1's ID as fallback
              const timestamp = Date.now().toString();
              safeSetItem(localStorage, `k2_temp_${qrDropId}`, k2Value);
              safeSetItem(localStorage, `k2_timestamp_${qrDropId}`, timestamp);
            }
            
            // Store k2 with QR2's ID (PRIMARY - from scanned URL)
            // Use localStorage so it persists across windows/tabs
            const timestamp = Date.now().toString();
            const storedK2 = safeSetItem(localStorage, `k2_temp_${fileId}`, k2Value);
            const storedK2Timestamp = safeSetItem(localStorage, `k2_timestamp_${fileId}`, timestamp);
            
            // Also store in sessionStorage as backup (for same-window flow)
            const storedK2Session = safeSetItem(sessionStorage, `k2_temp_${fileId}`, k2Value);
            const storedK2SessionTimestamp = safeSetItem(sessionStorage, `k2_timestamp_${fileId}`, timestamp);
            
            if (!storedK2 && !storedK2Session) {
              console.error('❌ [UNLOCK SCREEN] Failed to store k2 due to storage quota');
              toast.error('Kunne ikke lagre nøkkel. Prøv å tømme nettleserens cache.');
            }
            
            // Verify it was stored
            const verifyK2 = localStorage.getItem(`k2_temp_${fileId}`);
            const verifyK2Alt = qrDropId ? localStorage.getItem(`k2_temp_${qrDropId}`) : null;
            console.log('💾 [UNLOCK SCREEN] k2 stored verification:', {
              withFileId: verifyK2 ? 'SUCCESS' : 'FAILED',
              withQrDropId: verifyK2Alt ? 'SUCCESS' : 'FAILED'
            });
            
            // List all k2_temp keys in both storages for debugging
            const allK2KeysSession = Object.keys(sessionStorage).filter(k => k.startsWith('k2_temp_'));
            const allK2KeysLocal = Object.keys(localStorage).filter(k => k.startsWith('k2_temp_'));
            console.log('💾 [UNLOCK SCREEN] All k2_temp keys in sessionStorage:', allK2KeysSession);
            console.log('💾 [UNLOCK SCREEN] All k2_temp keys in localStorage:', allK2KeysLocal);
            
            const targetUrl = url.origin + url.pathname + url.hash;
            console.log('🚀 [UNLOCK SCREEN] Navigating to:', targetUrl);
            console.log('🚀 [UNLOCK SCREEN] Full URL breakdown:', {
              origin: url.origin,
              pathname: url.pathname,
              hash: url.hash,
              full: targetUrl
            });
            
            // Navigate to unlock route - App.tsx will handle combining k1 + k2
            // MOBILE FIX: Use longer delay for mobile browsers which may need more time
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const delay = isMobile ? 200 : 100;
            console.log(`⏳ [UNLOCK SCREEN] Waiting ${delay}ms before navigation (mobile: ${isMobile}) to ensure storage is written...`);
            setTimeout(() => {
              console.log('🚀 [UNLOCK SCREEN] Executing navigation to:', targetUrl);
              console.log('🚀 [UNLOCK SCREEN] Current location before navigation:', window.location.href);
              
              // Verify k2 is still in storage before navigating (check both localStorage and sessionStorage)
              const verifyK2BeforeNavLocal = localStorage.getItem(`k2_temp_${fileId}`);
              const verifyK2BeforeNavSession = sessionStorage.getItem(`k2_temp_${fileId}`);
              console.log('🔍 [UNLOCK SCREEN] k2 verification before navigation:', {
                localStorage: verifyK2BeforeNavLocal ? 'FOUND' : 'MISSING',
                sessionStorage: verifyK2BeforeNavSession ? 'FOUND' : 'MISSING'
              });
              
            // CRITICAL: Use history.pushState instead of window.location.href to avoid full reload
            // Full reload can clear sessionStorage and cause timing issues on mobile
            // Since k2 is already in localStorage, we can safely use pushState
            console.log('🚀 [UNLOCK SCREEN] Using history.pushState instead of window.location.href to preserve storage');
            
            // MOBILE FIX: Double-check k2 is stored before navigation (mobile browsers can be finicky)
            const finalK2Check = localStorage.getItem(`k2_temp_${fileId}`);
            if (!finalK2Check) {
              console.warn('⚠️ [UNLOCK SCREEN] k2 missing before navigation - storing again');
              const timestamp = Date.now().toString();
              safeSetItem(localStorage, `k2_temp_${fileId}`, k2Value);
              safeSetItem(localStorage, `k2_timestamp_${fileId}`, timestamp);
            }
            
            try {
              // MOBILE FIX: On mobile, hash fragments can be lost with pushState
              // Store k2 in a way that survives navigation, then use pushState
              // If pushState fails or hash is lost, App.tsx will recover k2 from storage
              window.history.pushState({}, '', targetUrl);
              
              // MOBILE FIX: Verify hash is still there after pushState (mobile browsers sometimes lose it)
              setTimeout(() => {
                const hashAfterNav = window.location.hash;
                const k2InHash = hashAfterNav && hashAfterNav.includes('k2=');
                console.log('🔍 [UNLOCK SCREEN] Hash verification after pushState:', {
                  hashPresent: !!hashAfterNav,
                  hasK2: k2InHash,
                  hash: hashAfterNav ? hashAfterNav.substring(0, 50) + '...' : 'EMPTY',
                  k2InStorage: !!localStorage.getItem(`k2_temp_${fileId}`)
                });
                
                // If hash was lost but k2 is in storage, that's OK - App.tsx will recover it
                if (!k2InHash && localStorage.getItem(`k2_temp_${fileId}`)) {
                  console.log('✅ [UNLOCK SCREEN] Hash lost but k2 is in storage - App.tsx will recover it');
                }
              }, 100);
              
              // Trigger popstate event to make App.tsx re-evaluate the route
              window.dispatchEvent(new PopStateEvent('popstate'));
              
              console.log('✅ [UNLOCK SCREEN] Navigation command executed (pushState)');
            } catch (error) {
              console.error('❌ [UNLOCK SCREEN] pushState failed, falling back to window.location:', error);
              // Fallback for browsers that don't support pushState properly
              // Use full URL with hash - this should work even if pushState doesn't
              window.location.href = targetUrl;
            }
            }, 100);
          } else {
            console.error('❌ [UNLOCK SCREEN] Could not extract fileId from unlock URL. Pathname:', url.pathname);
            // Fallback: try using qrDropId from props
            if (qrDropId && k2Value) {
              console.log('💾 [UNLOCK SCREEN] Fallback: storing k2 with qrDropId from props:', qrDropId);
              const timestamp = Date.now().toString();
              safeSetItem(localStorage, `k2_temp_${qrDropId}`, k2Value);
              safeSetItem(localStorage, `k2_timestamp_${qrDropId}`, timestamp);
              safeSetItem(sessionStorage, `k2_temp_${qrDropId}`, k2Value);
              safeSetItem(sessionStorage, `k2_timestamp_${qrDropId}`, timestamp);
            }
            window.location.href = data;
          }
        } else {
          // Legacy mode or no k2 - navigate normally
          console.log('📱 [UNLOCK SCREEN] Legacy mode or no k2, navigating normally');
          window.location.href = data;
        }
      } else {
        console.warn('⚠️ [UNLOCK SCREEN] Invalid QR code - not QR #2');
        alert(t('unlockScreen.invalidQr'));
        setShowScanner(false);
      }
    } catch (err) {
      console.error('❌ [UNLOCK SCREEN] Invalid QR code URL:', err);
      console.error('❌ [UNLOCK SCREEN] Raw data that failed:', data);
      alert(t('unlockScreen.invalidQr'));
      setShowScanner(false);
    }
  };

  // Show QR scanner fullscreen
  useEffect(() => {
    if (showScanner) {
      console.log('📷 [UNLOCK SCREEN] showScanner is true, should render QrScanner');
    } else {
      console.log('📷 [UNLOCK SCREEN] showScanner is false, showing unlock screen UI');
    }
  }, [showScanner]);

  if (showScanner) {
    console.log('📷 [UNLOCK SCREEN] Rendering QR scanner, qrDropId:', qrDropId);
    return (
      <QrScanner 
        onScan={(data) => {
          console.log('📷 [UNLOCK SCREEN] QrScanner onScan called with:', data);
          handleQrScanned(data);
        }}
        onClose={() => {
          console.log('📷 [UNLOCK SCREEN] QR scanner closed');
          setShowScanner(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F7F2EE' }}>
      <div className="max-w-md w-full">
        <SoftCard className="text-center">
          {/* Icon */}
          <div 
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ 
              background: 'linear-gradient(135deg, #E8927E, #E1C7BA)',
            }}
          >
            <Shield className="size-10 text-white" />
          </div>

          {/* Heading */}
          <h1 className="text-[#3F3F3F] mb-3">{t('unlockScreen.unlockFile')}</h1>
          {checkingK1 ? (
            <p className="text-[#5B5B5B] mb-8">
              <Loader2 className="size-4 inline animate-spin mr-2" />
              {t('unlockScreen.checkingQr1', { defaultValue: 'Checking QR1 status...' })}
            </p>
          ) : hasK1 ? (
            <p className="text-[#5B5B5B] mb-8">
              {t('unlockScreen.scanQr2')}
            </p>
          ) : (
            <p className="text-[#5B5B5B] mb-8">
              {t('unlockScreen.scanQr1First', { defaultValue: 'First, scan the access code (QR #1)' })}
            </p>
          )}

          {/* Scanner Placeholder */}
          {showScanner && (
            <div 
              className="mb-6 p-8 rounded-2xl border-2 border-dashed"
              style={{ 
                backgroundColor: '#E2EFFA',
                borderColor: '#5D8CC9'
              }}
            >
              <Loader2 className="size-12 text-[#5D8CC9] mx-auto mb-4 animate-spin" />
              <p className="text-[#5B5B5B] text-sm">{t('unlockScreen.openingCamera')}</p>
            </div>
          )}

          {/* Instructions */}
          <div 
            className="rounded-xl p-4 mb-6 text-left"
            style={{ 
              backgroundColor: '#F5E5E1',
              borderColor: '#D5C5BD'
            }}
          >
            <div className="flex items-start gap-3">
              <Key className="size-5 text-[#E8927E] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-[#3F3F3F] text-sm mb-2">{t('unlockScreen.secureModeActive')}</h3>
                <p className="text-[#5B5B5B] text-sm">
                  {t('unlockScreen.secureModeDesc')}
                </p>
              </div>
            </div>
          </div>

          {/* Expiry Countdown */}
          {expiryDate && (
            <div 
              className="rounded-xl p-4 mb-6 text-left"
              style={{ 
                backgroundColor: '#F5E5E1',
                borderColor: '#D5C5BD'
              }}
            >
              <div className="flex items-start gap-3">
                <Clock className="size-5 text-[#E8927E] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-[#3F3F3F] text-sm mb-2">{t('unlockScreen.expiryDate')}</h3>
                  <p className="text-[#5B5B5B] text-sm">
                    {formatExpiryTime()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Scan Buttons - Show QR1 or QR2 based on k1 status */}
          {checkingK1 ? (
            <NordicButton
              variant="coral"
              size="lg"
              disabled={true}
              className="w-full shadow-lg"
            >
              <Loader2 className="size-5 mr-2 animate-spin" />
              {t('unlockScreen.checking', { defaultValue: 'Checking...' })}
            </NordicButton>
          ) : hasK1 ? (
            <NordicButton
              variant="coral"
              size="lg"
              onClick={handleScanQr2Click}
              disabled={isUnlocking}
              className="w-full shadow-lg"
            >
              <Scan className="size-5 mr-2" />
              {isUnlocking ? t('unlockScreen.unlocking') : t('unlockScreen.scanQr2Button')}
            </NordicButton>
          ) : (
            <NordicButton
              variant="coral"
              size="lg"
              onClick={handleScanQr1Click}
              disabled={isUnlocking}
              className="w-full shadow-lg"
            >
              <Scan className="size-5 mr-2" />
              {t('unlockScreen.scanQr1Button', { defaultValue: 'Scan QR #1 (Access Code)' })}
            </NordicButton>
          )}

          <p className="text-[#5B5B5B] text-xs mt-4">
            {t('unlockScreen.neverStoredUnencrypted')}
          </p>
        </SoftCard>
      </div>
    </div>
  );
}