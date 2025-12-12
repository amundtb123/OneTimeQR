import { useState, useEffect, useRef } from 'react';
import { Shield, Key, Scan, Loader2, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SoftCard } from './soft-card';
import { NordicButton } from './nordic-button';
import { QrScanner } from './qr-scanner-html5';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface UnlockScreenProps {
  onUnlock: (key: string) => Promise<void>;
  isUnlocking: boolean;
  qrDropId?: string; // Optional: to show expiry countdown
}

export function UnlockScreen({ onUnlock, isUnlocking, qrDropId }: UnlockScreenProps) {
  const { t } = useTranslation();
  // SECURITY: Mark QR #1 as scanned IMMEDIATELY when this screen renders
  // This must happen synchronously so QR #2 can check it instantly
  // IMPORTANT: Use sessionStorage to match App.tsx which checks sessionStorage for k1
  const hasMarkedRef = useRef(false);
  if (!hasMarkedRef.current) {
    // Note: k1 is stored in App.tsx when QR #1 is scanned with k1 in fragment
    // This is just a backup marker - the real k1 storage happens in App.tsx
    sessionStorage.setItem(`qr1_scanned_${qrDropId}`, Date.now().toString());
    console.log('🔐 [SYNC] Marked QR #1 as scanned immediately on render for:', qrDropId);
    hasMarkedRef.current = true;
  }

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

  const handleScanClick = () => {
    setShowScanner(true);
  };

  const handleQrScanned = (data: string) => {
    console.log('📱 [UNLOCK SCREEN] QR code scanned, raw data:', data);
    console.log('📱 [UNLOCK SCREEN] Current qrDropId:', qrDropId);
    
    // Parse URL to extract key, unlock parameter, or k2 fragment
    try {
      const url = new URL(data);
      console.log('📱 [UNLOCK SCREEN] Parsed URL:', {
        origin: url.origin,
        pathname: url.pathname,
        hash: url.hash,
        search: url.search
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
      
      // Check if this is QR #2 (legacy: key/unlock, or new: k2 fragment)
      if (key || unlock === '1' || hasK2) {
        console.log('✅ [UNLOCK SCREEN] Valid QR #2 detected, processing...');
        
        // For split-key mode (k2 in fragment), extract and store k2 BEFORE navigation
        // This ensures we don't lose k2 on mobile browsers that might mishandle fragments
        if (hasK2 && k2Value) {
          // Extract fileId from path (e.g., /unlock/:id)
          const pathMatch = url.pathname.match(/\/unlock\/([^/]+)/);
          if (pathMatch) {
            const fileId = pathMatch[1];
            console.log('💾 [UNLOCK SCREEN] Storing k2 in sessionStorage before navigation for:', fileId);
            console.log('💾 [UNLOCK SCREEN] k2 value length:', k2Value.length);
            
            // Store k2 temporarily so App.tsx can find it even if fragment is lost
            // App.tsx will check for this and combine with k1
            sessionStorage.setItem(`k2_temp_${fileId}`, k2Value);
            sessionStorage.setItem(`k2_timestamp_${fileId}`, Date.now().toString());
            
            // Verify it was stored
            const verifyK2 = sessionStorage.getItem(`k2_temp_${fileId}`);
            console.log('💾 [UNLOCK SCREEN] k2 stored verification:', verifyK2 ? 'SUCCESS' : 'FAILED');
            
            const targetUrl = url.origin + url.pathname + url.hash;
            console.log('🚀 [UNLOCK SCREEN] Navigating to:', targetUrl);
            
            // Navigate to unlock route - App.tsx will handle combining k1 + k2
            window.location.href = targetUrl;
          } else {
            console.error('❌ [UNLOCK SCREEN] Could not extract fileId from unlock URL. Pathname:', url.pathname);
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
          <p className="text-[#5B5B5B] mb-8">
            {t('unlockScreen.scanQr2')}
          </p>

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

          {/* Scan Button */}
          <NordicButton
            variant="coral"
            size="lg"
            onClick={handleScanClick}
            disabled={isUnlocking}
            className="w-full shadow-lg"
          >
            <Scan className="size-5 mr-2" />
            {isUnlocking ? t('unlockScreen.unlocking') : t('unlockScreen.scanQr2Button')}
          </NordicButton>

          <p className="text-[#5B5B5B] text-xs mt-4">
            {t('unlockScreen.neverStoredUnencrypted')}
          </p>
        </SoftCard>
      </div>
    </div>
  );
}