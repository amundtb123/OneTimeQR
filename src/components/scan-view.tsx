import { useState, useEffect } from 'react';
import { ArrowLeft, Download, Eye, Lock, AlertCircle, CheckCircle, Loader2, Clock, FileText, Link as LinkIcon, ExternalLink, Copy, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Alert, AlertDescription } from './ui/alert';
import { SoftCard } from './soft-card';
import { NordicButton } from './nordic-button';
import { UnlockScreen } from './unlock-screen';
import { getQrDrop, verifyPassword, incrementScanCount, getFileUrl, incrementDownloadCount } from '../utils/api-client';
import { 
  decryptData, 
  decryptFile,
  decryptTextWithSplitKey,
  decryptFileWithSplitKey
} from '../utils/encryption';
import { toast } from 'sonner@2.0.3';

interface ScanViewProps {
  qrDropId: string;
  onBack: () => void;
  isPreview?: boolean; // Preview mode doesn't count scans
  isDirectScan?: boolean; // Direct scan from QR code (hide navigation)
  unlockKey?: string | null; // Decryption key from QR #2 (for Secure Mode)
  showQr2Error?: boolean; // Show error if QR2 was scanned without QR1
}

export function ScanView({ qrDropId, onBack, isPreview = false, isDirectScan = false, unlockKey = null, showQr2Error = false }: ScanViewProps) {
  const { t } = useTranslation();
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [qrDrop, setQrDrop] = useState<any>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null); // Backwards compatibility - first file
  const [fileUrls, setFileUrls] = useState<Array<{fileUrl: string; fileName: string; fileType: string; fileSize: number; fileIndex: number}>>([]);
  const [decryptedFileUrls, setDecryptedFileUrls] = useState<Record<number, string>>({}); // Store decrypted blob URLs for preview
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0); // Force re-render every second for countdown
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedContent, setDecryptedContent] = useState<{text?: string; urls?: string[]}>({});
  const [currentQrDropId] = useState(qrDropId); // Store ID in state so it doesn't get lost
  const [effectiveUnlockKey, setEffectiveUnlockKey] = useState<string | null>(unlockKey); // Use state to track unlockKey from prop or storage

  // CRITICAL FIX: Check storage for unlockKey if prop is not set
  // This handles the case where App.tsx has combined k1+k2 and stored masterKey in sessionStorage
  // but the prop hasn't been passed yet (React batching/timing issue)
  // Also handles Single QR Mode where K1 is converted to master key
  useEffect(() => {
    if (!unlockKey && qrDropId) {
      // Check sessionStorage for master key (App.tsx stores it as master_${id})
      const storedMasterKey = sessionStorage.getItem(`master_${qrDropId}`);
      if (storedMasterKey) {
        console.log('🔑 [SCAN VIEW] Found master key in storage, using it:', {
          keyLength: storedMasterKey.length,
          expectedLength: 64,
          isValidLength: storedMasterKey.length === 64,
          keyPreview: storedMasterKey.substring(0, 20) + '...',
          keyEnd: '...' + storedMasterKey.substring(storedMasterKey.length - 10),
          isHex: /^[0-9a-fA-F]+$/.test(storedMasterKey)
        });
        // Validate it's hex before using
        if (storedMasterKey.length === 64 && /^[0-9a-fA-F]+$/.test(storedMasterKey)) {
          setEffectiveUnlockKey(storedMasterKey);
        } else {
          console.error('❌ [SCAN VIEW] Invalid master key format in storage!', {
            length: storedMasterKey.length,
            isHex: /^[0-9a-fA-F]+$/.test(storedMasterKey)
          });
          setEffectiveUnlockKey(null);
        }
      } else {
        console.warn('⚠️ [SCAN VIEW] No master key found in storage for:', qrDropId);
        setEffectiveUnlockKey(null);
      }
    } else {
      if (unlockKey) {
        console.log('🔑 [SCAN VIEW] Using unlockKey from prop:', {
          keyLength: unlockKey.length,
          expectedLength: 64,
          isValidLength: unlockKey.length === 64,
          keyPreview: unlockKey.substring(0, 20) + '...',
          isHex: /^[0-9a-fA-F]+$/.test(unlockKey)
        });
      }
      setEffectiveUnlockKey(unlockKey);
    }
  }, [unlockKey, qrDropId]);
  
  // For Single QR Mode: Periodically check if master key was set by App.tsx
  // This is critical because App.tsx may set the key asynchronously after URL processing
  useEffect(() => {
    if (!effectiveUnlockKey && qrDropId) {
      console.log('🔍 [SCAN VIEW] No effectiveUnlockKey yet, starting periodic check for master key...');
      const checkInterval = setInterval(() => {
        const masterKey = sessionStorage.getItem(`master_${qrDropId}`);
        if (masterKey && masterKey.length === 64 && /^[0-9a-fA-F]+$/.test(masterKey)) {
          console.log('🔑 [SCAN VIEW] Single QR Mode: Found master key in storage (periodic check), using it');
          setEffectiveUnlockKey(masterKey);
          clearInterval(checkInterval);
        }
      }, 100); // Check every 100ms for faster response
      
      // Stop checking after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!effectiveUnlockKey) {
          console.warn('⚠️ [SCAN VIEW] Periodic check timed out - no master key found after 5 seconds');
        }
      }, 5000);
      
      return () => clearInterval(checkInterval);
    }
  }, [effectiveUnlockKey, qrDropId]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      // Revoke all decrypted blob URLs to prevent memory leaks
      Object.values(decryptedFileUrls).forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  // Prevent accidental page refresh when viewing scanned QR codes
  useEffect(() => {
    if (!qrDrop) return; // Only activate when QR drop is loaded
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Show browser's default confirmation dialog
      e.preventDefault();
      // Modern browsers ignore custom messages, but we can still trigger the dialog
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [qrDrop]);

  useEffect(() => {
    const loadQrDrop = async () => {
      try {
        setIsLoading(true);
        
        // Get access token from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        let accessToken = urlParams.get('access') || undefined;
        const unlockParam = urlParams.get('unlock'); // Preserve unlock flag
        
        // 🔐 SECURE MODE / SINGLE QR MODE: If this is a direct scan without unlock key or unlock param,
        // this might be QR #1 - just show UnlockScreen without loading data
        // Use effectiveUnlockKey (from prop or storage) instead of just unlockKey prop
        if (isDirectScan && !effectiveUnlockKey && !unlockParam && !accessToken) {
          // We need to check if this is a Secure Mode or Single QR Mode QR drop
          // Make a lightweight check without incrementing scan count
          const lightCheck = await fetch(`https://${(await import('../utils/supabase/info')).projectId}.supabase.co/functions/v1/make-server-c3c9181e/qrdrop/${currentQrDropId}/check`, {
            headers: {
              'Authorization': `Bearer ${(await import('../utils/supabase/info')).publicAnonKey}`
            }
          });
          
          if (lightCheck.ok) {
            const checkData = await lightCheck.json();
            if (checkData.secureMode || checkData.singleQrMode) {
              setIsEncrypted(true);
              setIsLoading(false);
              return; // Stop here - UnlockScreen will be shown
            }
          }
        }
        
        // First call: try to get QR drop (might return requiresToken)
        const response = await getQrDrop(currentQrDropId, accessToken);
        
        // Check if server requires token (first scan without token)
        if ((response as any).requiresToken) {
          // Server generated a token for us - redirect to URL with token
          const token = (response as any).accessToken;
          
          // Preserve unlock=1 and key parameters if they were present
          let redirectUrl = `/scan/${currentQrDropId}?access=${token}`;
          if (unlockParam === '1') {
            redirectUrl += '&unlock=1';
          }
          if (effectiveUnlockKey) {
            redirectUrl += `&key=${encodeURIComponent(effectiveUnlockKey)}`;
          }
          
          // Use pushState instead of full page reload to preserve React state
          window.history.pushState({}, '', redirectUrl);
          // Re-trigger the effect by reloading
          setIsLoading(true);
          // Recursive call with the access token
          const newUrlParams = new URLSearchParams(redirectUrl.split('?')[1]);
          const newAccessToken = newUrlParams.get('access') || undefined;
          const newResponse = await getQrDrop(currentQrDropId, newAccessToken);
          
          // Continue processing with the new response
          setQrDrop(newResponse.qrDrop);
          
          // OPTIMIZATION: Check if server already included fileUrl or files
          if ((newResponse as any).files && Array.isArray((newResponse as any).files)) {
            // Multiple files in response
            setFileUrls((newResponse as any).files);
            if ((newResponse as any).files.length > 0) {
              setFileUrl((newResponse as any).files[0].fileUrl);
            }
            console.log(`✅ ${(newResponse as any).files.length} file(s) received in response - skipping separate /file call`);
          } else if ((newResponse as any).fileUrl) {
            // Single file in response (backwards compatibility)
            setFileUrl((newResponse as any).fileUrl);
            setFileUrls([{
              fileUrl: (newResponse as any).fileUrl,
              fileName: (newResponse as any).fileName || newResponse.qrDrop?.fileName || 'file',
              fileType: (newResponse as any).fileType || newResponse.qrDrop?.fileType || 'application/octet-stream',
              fileSize: (newResponse as any).fileSize || newResponse.qrDrop?.fileSize || 0,
              fileIndex: 0
            }]);
            console.log('✅ fileUrl received in response - skipping separate /file call');
          }
          
          // Clean up URL after getting data
          // CRITICAL FIX: Don't remove ID from URL - we need it for k1/k2 recovery
          // Only clean up access token, but keep the ID
          // IMPORTANT: Don't remove ?key= parameter here - App.tsx handles it
          if (isDirectScan) {
            // Keep the ID in URL - don't remove it!
            // Only remove access token if present, but keep ?key= (App.tsx will handle it)
            const urlParams = new URLSearchParams(window.location.search);
            urlParams.delete('access');
            // DON'T delete 'key' here - App.tsx needs to process it first
            const newSearch = urlParams.toString();
            const newUrl = newSearch ? `/scan/${currentQrDropId}?${newSearch}` : `/scan/${currentQrDropId}`;
            window.history.replaceState({}, '', newUrl);
            console.log('🧹 [SCAN VIEW] Cleaned URL but kept ID and key param:', newUrl);
          } else if (newAccessToken) {
            window.history.replaceState({}, '', `/scan/${currentQrDropId}`);
          }
          
          // Check if content is in Secure Mode or Single QR Mode (requires unlock key)
          // NOTE: encrypted flag is for standard encryption (password/server key), not Secure Mode/Single QR Mode
          const isSecureMode = newResponse.qrDrop.secureMode;
          const isSingleQrMode = newResponse.qrDrop.singleQrMode;
          setIsEncrypted(isSecureMode || isSingleQrMode);
          
          // Set qrDrop first so UnlockScreen can be shown if needed
          setQrDrop(newResponse.qrDrop);
          
          // If Secure Mode or Single QR Mode but no unlock key, we'll show UnlockScreen later
          // Use effectiveUnlockKey (from prop or storage) instead of just unlockKey prop
          if ((isSecureMode || isSingleQrMode) && !effectiveUnlockKey) {
            setIsLoading(false);
            return;
          }
          
          // Decrypt content if we have the key (Secure Mode or Single QR Mode)
          if ((isSecureMode || isSingleQrMode) && effectiveUnlockKey) {
            try {
              setIsDecrypting(true);
              const decrypted: {text?: string; urls?: string[]} = {};
              
              // Check if this is split-key (new method) or legacy method
              const isSplitKey = !newResponse.qrDrop.encryptionKey;
              
              if (isSplitKey) {
                // NEW: Split-key zero-knowledge decryption
                // Validate master key format (should be hex string, 64 chars = 32 bytes)
                if (!effectiveUnlockKey || typeof effectiveUnlockKey !== 'string') {
                  throw new Error(`Invalid master key: expected hex string, got ${typeof effectiveUnlockKey}`);
                }
                
                const hexMatch = effectiveUnlockKey.match(/^[0-9a-fA-F]+$/);
                if (!hexMatch) {
                  throw new Error(`Invalid master key format: not a valid hex string. Length: ${effectiveUnlockKey.length}`);
                }
                
                if (effectiveUnlockKey.length !== 64) {
                  console.warn(`⚠️ [SCAN VIEW] Master key length is ${effectiveUnlockKey.length}, expected 64 (32 bytes)`);
                }
                
                const masterKeyBytes = new Uint8Array(
                  effectiveUnlockKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
                );
                
                console.log('🔑 [SCAN VIEW] Master key validation (retry):', {
                  keyLength: effectiveUnlockKey.length,
                  keyBytes: masterKeyBytes.length,
                  expectedBytes: 32,
                  isValid: masterKeyBytes.length === 32
                });
                
                if (masterKeyBytes.length !== 32) {
                  throw new Error(`Invalid master key length: ${masterKeyBytes.length} bytes, expected 32 bytes`);
                }
                
                if (newResponse.qrDrop.textContent) {
                  try {
                    console.log('🔍 [SCAN VIEW] Attempting to decrypt textContent (retry):', {
                      textContentType: typeof newResponse.qrDrop.textContent,
                      textContentLength: newResponse.qrDrop.textContent.length,
                      textContentPreview: newResponse.qrDrop.textContent.substring(0, 100) + '...'
                    });
                    
                    const ciphertextObj = JSON.parse(newResponse.qrDrop.textContent);
                    console.log('✅ [SCAN VIEW] Parsed ciphertext object (retry):', {
                      hasIv: !!ciphertextObj.iv,
                      hasSalt: !!ciphertextObj.salt,
                      hasCiphertext: !!ciphertextObj.ciphertext
                    });
                    
                    // CRITICAL: Use newResponse.qrDrop.id (which should be clientId) instead of currentQrDropId
                    const fileIdForDecryption = newResponse.qrDrop.id || currentQrDropId;
                    console.log('🔑 [SCAN VIEW] Using fileId for textContent decryption (retry):', {
                      fileIdForDecryption,
                      currentQrDropId,
                      responseId: newResponse.qrDrop.id,
                      usingResponseId: fileIdForDecryption === newResponse.qrDrop.id
                    });
                    decrypted.text = await decryptTextWithSplitKey(ciphertextObj, masterKeyBytes, fileIdForDecryption);
                    console.log('✅ [SCAN VIEW] Successfully decrypted textContent (retry)');
                  } catch (parseError) {
                    console.error('❌ [SCAN VIEW] Failed to parse/decrypt textContent ciphertext (retry):', parseError);
                    console.error('❌ [SCAN VIEW] textContent value:', newResponse.qrDrop.textContent);
                    throw new Error(`Invalid ciphertext format: ${parseError.message}`);
                  }
                }
                
                if (newResponse.qrDrop.urlContent) {
                  try {
                    console.log('🔍 [SCAN VIEW] Attempting to decrypt urlContent (retry):', {
                      urlContentType: typeof newResponse.qrDrop.urlContent,
                      urlContentLength: newResponse.qrDrop.urlContent.length,
                      urlContentPreview: newResponse.qrDrop.urlContent.substring(0, 100) + '...'
                    });
                    
                    const ciphertextObj = JSON.parse(newResponse.qrDrop.urlContent);
                    console.log('✅ [SCAN VIEW] Parsed urlContent ciphertext object (retry):', {
                      hasIv: !!ciphertextObj.iv,
                      hasSalt: !!ciphertextObj.salt,
                      hasCiphertext: !!ciphertextObj.ciphertext
                    });
                    
                    // CRITICAL: Use newResponse.qrDrop.id (which should be clientId) instead of currentQrDropId
                    const fileIdForDecryption = newResponse.qrDrop.id || currentQrDropId;
                    console.log('🔑 [SCAN VIEW] Using fileId for urlContent decryption (retry):', {
                      fileIdForDecryption,
                      currentQrDropId,
                      responseId: newResponse.qrDrop.id,
                      usingResponseId: fileIdForDecryption === newResponse.qrDrop.id
                    });
                    const decryptedUrlJson = await decryptTextWithSplitKey(ciphertextObj, masterKeyBytes, fileIdForDecryption);
                    decrypted.urls = JSON.parse(decryptedUrlJson);
                    console.log('✅ [SCAN VIEW] Successfully decrypted urlContent (retry)');
                  } catch (parseError) {
                    console.error('❌ [SCAN VIEW] Failed to parse/decrypt urlContent ciphertext (retry):', parseError);
                    console.error('❌ [SCAN VIEW] urlContent value:', newResponse.qrDrop.urlContent);
                    throw new Error(`Invalid ciphertext format: ${parseError.message}`);
                  }
                }
              } else {
                // LEGACY: Traditional decryption
                if (newResponse.qrDrop.textContent) {
                  decrypted.text = await decryptData(newResponse.qrDrop.textContent, effectiveUnlockKey);
                }
                
                if (newResponse.qrDrop.urlContent) {
                  const decryptedUrlJson = await decryptData(newResponse.qrDrop.urlContent, effectiveUnlockKey);
                  decrypted.urls = JSON.parse(decryptedUrlJson);
                }
              }
              
              setDecryptedContent(decrypted);
              toast.success('🔓 Innhold dekryptert lokalt');
            } catch (error) {
              console.error('Decryption failed:', error);
              setError(t('scanView.couldNotLoad'));
              setIsLoading(false);
              return;
            } finally {
              setIsDecrypting(false);
            }
          }

          // If no password is required, automatically unlock and load file
          if (!newResponse.qrDrop.password) {
            setIsUnlocked(true);
          // Load file URL(s) if there is actually a file (not just text/URL)
          // Always load files (they need to be decrypted since ALL files are encrypted)
          if ((newResponse.qrDrop.contentType === 'file' || newResponse.qrDrop.contentType === 'bundle') && (newResponse.qrDrop.filePath || (newResponse.qrDrop.files && newResponse.qrDrop.files.length > 0))) {
            const needsLoad = fileUrls.length === 0 && !fileUrl;
            // For secureMode, we need effectiveUnlockKey. For standard encrypted files, we always need to load/decrypt
            const needsDecrypt = newResponse.qrDrop.secureMode ? (newResponse.qrDrop.secureMode && effectiveUnlockKey) : true;
            if (needsLoad || needsDecrypt) {
              await loadFile();
            }
          }
            
            // Only increment scan count AFTER file is loaded (important for "scan once" type)
            if (!isPreview) {
              await incrementScanCount(currentQrDropId);
            }
          }
          
          setIsLoading(false);
          return; // Stop here, we've processed everything
        }
        
        // Token was valid and used - now clean up the URL
        // CRITICAL FIX: Keep the ID in URL - we need it for k1/k2 recovery
        if (isDirectScan) {
          // For direct scans, keep the ID but remove access token
          const urlParams = new URLSearchParams(window.location.search);
          urlParams.delete('access');
          const newSearch = urlParams.toString();
          const newUrl = newSearch ? `/scan/${currentQrDropId}?${newSearch}` : `/scan/${currentQrDropId}`;
          window.history.replaceState({}, '', newUrl);
          console.log('🧹 [SCAN VIEW] Cleaned URL but kept ID (token used):', newUrl);
        } else if (accessToken) {
          // For preview mode, just remove the token but keep the ID
          window.history.replaceState({}, '', `/scan/${currentQrDropId}`);
        }
        
        setQrDrop(response.qrDrop);
        
        // OPTIMIZATION: Check if server already included fileUrl or files
        if ((response as any).files && Array.isArray((response as any).files)) {
          // Multiple files in response
          setFileUrls((response as any).files);
          if ((response as any).files.length > 0) {
            setFileUrl((response as any).files[0].fileUrl);
          }
          console.log(`✅ ${(response as any).files.length} file(s) received in response - skipping separate /file call`);
        } else if ((response as any).fileUrl) {
          // Single file in response (backwards compatibility)
          setFileUrl((response as any).fileUrl);
          setFileUrls([{
            fileUrl: (response as any).fileUrl,
            fileName: (response as any).fileName || response.qrDrop?.fileName || 'file',
            fileType: (response as any).fileType || response.qrDrop?.fileType || 'application/octet-stream',
            fileSize: (response as any).fileSize || response.qrDrop?.fileSize || 0,
            fileIndex: 0
          }]);
          console.log('✅ fileUrl received in response - skipping separate /file call');
        }
        
        // Check if content is in Secure Mode or Single QR Mode (requires unlock key)
        // NOTE: encrypted flag is for standard encryption (password/server key), not Secure Mode/Single QR Mode
        const isSecureMode = response.qrDrop.secureMode;
        const isSingleQrMode = response.qrDrop.singleQrMode;
        setIsEncrypted(isSecureMode || isSingleQrMode);
        
        // Set qrDrop first so UnlockScreen can be shown if needed
        setQrDrop(response.qrDrop);
        
        // If Secure Mode or Single QR Mode but no unlock key, we'll show UnlockScreen later
        if ((isSecureMode || isSingleQrMode) && !effectiveUnlockKey) {
          setIsLoading(false);
          return;
        }
        
        // Decrypt content if we have the key (Secure Mode or Single QR Mode)
        if ((isSecureMode || isSingleQrMode) && effectiveUnlockKey) {
          try {
            setIsDecrypting(true);
            const decrypted: {text?: string; urls?: string[]} = {};
            
            // Check if this is split-key (new method) or legacy method
            // Split-key: textContent/urlContent are JSON strings of {iv, salt, ciphertext}
            // Legacy: textContent/urlContent are base64 encrypted strings
            const isSplitKey = !response.qrDrop.encryptionKey; // No encryptionKey on server = split-key
            
            if (isSplitKey) {
              // NEW: Split-key zero-knowledge decryption
              // Validate master key format (should be hex string, 64 chars = 32 bytes)
              if (!effectiveUnlockKey || typeof effectiveUnlockKey !== 'string') {
                throw new Error(`Invalid master key: expected hex string, got ${typeof effectiveUnlockKey}`);
              }
              
              const hexMatch = effectiveUnlockKey.match(/^[0-9a-fA-F]+$/);
              if (!hexMatch) {
                throw new Error(`Invalid master key format: not a valid hex string. Length: ${effectiveUnlockKey.length}`);
              }
              
              if (effectiveUnlockKey.length !== 64) {
                console.warn(`⚠️ [SCAN VIEW] Master key length is ${effectiveUnlockKey.length}, expected 64 (32 bytes)`);
              }
              
              const masterKeyBytes = new Uint8Array(
                effectiveUnlockKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
              );
              
              console.log('🔑 [SCAN VIEW] Master key validation:', {
                keyLength: effectiveUnlockKey.length,
                keyBytes: masterKeyBytes.length,
                expectedBytes: 32,
                isValid: masterKeyBytes.length === 32,
                keyPreview: effectiveUnlockKey.substring(0, 20) + '...'
              });
              
              if (masterKeyBytes.length !== 32) {
                throw new Error(`Invalid master key length: ${masterKeyBytes.length} bytes, expected 32 bytes`);
              }
              
              // Decrypt text content if exists
              if (response.qrDrop.textContent) {
                try {
                  console.log('🔍 [SCAN VIEW] Attempting to decrypt textContent:', {
                    textContentType: typeof response.qrDrop.textContent,
                    textContentLength: response.qrDrop.textContent.length,
                    textContentPreview: response.qrDrop.textContent.substring(0, 100) + '...',
                    masterKeyLength: masterKeyBytes.length,
                    qrDropId: currentQrDropId,
                    qrDropIdFromResponse: response.qrDrop.id,
                    idsMatch: currentQrDropId === response.qrDrop.id,
                    warning: currentQrDropId !== response.qrDrop.id ? '⚠️ ID MISMATCH - this will cause decryption to fail!' : '✅ IDs match'
                  });
                  
                  const ciphertextObj = JSON.parse(response.qrDrop.textContent);
                  console.log('✅ [SCAN VIEW] Parsed ciphertext object:', {
                    hasIv: !!ciphertextObj.iv,
                    hasSalt: !!ciphertextObj.salt,
                    hasCiphertext: !!ciphertextObj.ciphertext,
                    ivLength: ciphertextObj.iv?.length,
                    saltLength: ciphertextObj.salt?.length,
                    ciphertextLength: ciphertextObj.ciphertext?.length,
                    ivPreview: ciphertextObj.iv?.substring(0, 50),
                    saltPreview: ciphertextObj.salt?.substring(0, 50),
                    ivType: typeof ciphertextObj.iv,
                    saltType: typeof ciphertextObj.salt
                  });
                  
                  // CRITICAL DEBUG: Check if IV/Salt are already JSON strings (double-encoded)
                  let ivToDecode = ciphertextObj.iv;
                  let saltToDecode = ciphertextObj.salt;
                  
                  // Check if IV is a JSON string that needs parsing
                  if (typeof ciphertextObj.iv === 'string' && ciphertextObj.iv.trim().startsWith('{')) {
                    console.warn('⚠️ [SCAN VIEW] IV appears to be a JSON string! Attempting to parse...', {
                      ivPreview: ciphertextObj.iv.substring(0, 100)
                    });
                    try {
                      const parsedIv = JSON.parse(ciphertextObj.iv);
                      console.warn('⚠️ [SCAN VIEW] Parsed IV JSON:', parsedIv);
                      // If it's an object with a 'key' or 'iv' property, use that
                      ivToDecode = parsedIv.iv || parsedIv.key || ciphertextObj.iv;
                      console.log('✅ [SCAN VIEW] Using extracted IV:', ivToDecode?.substring(0, 50) + '...');
                    } catch (e) {
                      console.warn('⚠️ [SCAN VIEW] Failed to parse IV as JSON, using as-is:', e);
                    }
                  }
                  
                  // Check if Salt is a JSON string that needs parsing
                  if (typeof ciphertextObj.salt === 'string' && ciphertextObj.salt.trim().startsWith('{')) {
                    console.warn('⚠️ [SCAN VIEW] Salt appears to be a JSON string! Attempting to parse...', {
                      saltPreview: ciphertextObj.salt.substring(0, 100)
                    });
                    try {
                      const parsedSalt = JSON.parse(ciphertextObj.salt);
                      console.warn('⚠️ [SCAN VIEW] Parsed Salt JSON:', parsedSalt);
                      // If it's an object with a 'key' or 'salt' property, use that
                      saltToDecode = parsedSalt.salt || parsedSalt.key || ciphertextObj.salt;
                      console.log('✅ [SCAN VIEW] Using extracted Salt:', saltToDecode?.substring(0, 50) + '...');
                    } catch (e) {
                      console.warn('⚠️ [SCAN VIEW] Failed to parse Salt as JSON, using as-is:', e);
                    }
                  }
                  
                  // Validate IV and Salt are strings before using
                  if (typeof ivToDecode !== 'string' || !ivToDecode) {
                    throw new Error(`Invalid IV: expected string, got ${typeof ivToDecode}`);
                  }
                  if (typeof saltToDecode !== 'string' || !saltToDecode) {
                    throw new Error(`Invalid Salt: expected string, got ${typeof saltToDecode}`);
                  }
                  
                  // Use corrected values
                  const correctedCiphertextObj = {
                    iv: ivToDecode,
                    salt: saltToDecode,
                    ciphertext: ciphertextObj.ciphertext
                  };
                  
                  console.log('🔧 [SCAN VIEW] Corrected ciphertext object:', {
                    ivLength: correctedCiphertextObj.iv?.length,
                    saltLength: correctedCiphertextObj.salt?.length,
                    wasCorrected: ivToDecode !== ciphertextObj.iv || saltToDecode !== ciphertextObj.salt
                  });
                  
                  // CRITICAL: Use response.qrDrop.id (which should be clientId) instead of currentQrDropId
                  // This ensures we use the same ID that was used for encryption
                  const fileIdForDecryption = response.qrDrop.id || currentQrDropId;
                  console.log('🔑 [SCAN VIEW] Using fileId for decryption:', {
                    fileIdForDecryption,
                    currentQrDropId,
                    responseId: response.qrDrop.id,
                    usingResponseId: fileIdForDecryption === response.qrDrop.id
                  });
                  decrypted.text = await decryptTextWithSplitKey(correctedCiphertextObj, masterKeyBytes, fileIdForDecryption);
                  console.log('✅ [SCAN VIEW] Successfully decrypted textContent');
                } catch (parseError) {
                  console.error('❌ [SCAN VIEW] Failed to parse/decrypt textContent ciphertext:', parseError);
                  console.error('❌ [SCAN VIEW] textContent value:', response.qrDrop.textContent);
                  console.error('❌ [SCAN VIEW] parseError details:', {
                    message: parseError.message,
                    stack: parseError.stack,
                    name: parseError.name
                  });
                  throw new Error(`Invalid ciphertext format: ${parseError.message}`);
                }
              }
              
              // Decrypt URL content if exists
              if (response.qrDrop.urlContent) {
                try {
                  console.log('🔍 [SCAN VIEW] Attempting to decrypt urlContent:', {
                    urlContentType: typeof response.qrDrop.urlContent,
                    urlContentLength: response.qrDrop.urlContent.length,
                    urlContentPreview: response.qrDrop.urlContent.substring(0, 100) + '...',
                    masterKeyLength: masterKeyBytes.length,
                    qrDropId: currentQrDropId
                  });
                  
                  const ciphertextObj = JSON.parse(response.qrDrop.urlContent);
                  console.log('✅ [SCAN VIEW] Parsed urlContent ciphertext object:', {
                    hasIv: !!ciphertextObj.iv,
                    hasSalt: !!ciphertextObj.salt,
                    hasCiphertext: !!ciphertextObj.ciphertext,
                    ivLength: ciphertextObj.iv?.length,
                    saltLength: ciphertextObj.salt?.length
                  });
                  
                  // CRITICAL DEBUG: Check if IV/Salt are already JSON strings (double-encoded)
                  let ivToDecode = ciphertextObj.iv;
                  let saltToDecode = ciphertextObj.salt;
                  
                  if (typeof ciphertextObj.iv === 'string' && ciphertextObj.iv.trim().startsWith('{')) {
                    try {
                      const parsedIv = JSON.parse(ciphertextObj.iv);
                      ivToDecode = parsedIv.iv || parsedIv.key || ciphertextObj.iv;
                      console.log('✅ [SCAN VIEW] Using extracted IV for URL:', ivToDecode?.substring(0, 50) + '...');
                    } catch (e) {
                      console.warn('⚠️ [SCAN VIEW] Failed to parse IV as JSON for URL, using as-is:', e);
                    }
                  }
                  
                  if (typeof ciphertextObj.salt === 'string' && ciphertextObj.salt.trim().startsWith('{')) {
                    try {
                      const parsedSalt = JSON.parse(ciphertextObj.salt);
                      saltToDecode = parsedSalt.salt || parsedSalt.key || ciphertextObj.salt;
                      console.log('✅ [SCAN VIEW] Using extracted Salt for URL:', saltToDecode?.substring(0, 50) + '...');
                    } catch (e) {
                      console.warn('⚠️ [SCAN VIEW] Failed to parse Salt as JSON for URL, using as-is:', e);
                    }
                  }
                  
                  // Validate IV and Salt are strings before using
                  if (typeof ivToDecode !== 'string' || !ivToDecode) {
                    throw new Error(`Invalid IV: expected string, got ${typeof ivToDecode}`);
                  }
                  if (typeof saltToDecode !== 'string' || !saltToDecode) {
                    throw new Error(`Invalid Salt: expected string, got ${typeof saltToDecode}`);
                  }
                  
                  const correctedCiphertextObj = {
                    iv: ivToDecode,
                    salt: saltToDecode,
                    ciphertext: ciphertextObj.ciphertext
                  };
                  
                  // CRITICAL: Use response.qrDrop.id (which should be clientId) instead of currentQrDropId
                  // This ensures we use the same ID that was used for encryption
                  const fileIdForDecryption = response.qrDrop.id || currentQrDropId;
                  console.log('🔑 [SCAN VIEW] Using fileId for URL decryption:', {
                    fileIdForDecryption,
                    currentQrDropId,
                    responseId: response.qrDrop.id,
                    usingResponseId: fileIdForDecryption === response.qrDrop.id
                  });
                  const decryptedUrlJson = await decryptTextWithSplitKey(correctedCiphertextObj, masterKeyBytes, fileIdForDecryption);
                  decrypted.urls = JSON.parse(decryptedUrlJson);
                  console.log('✅ [SCAN VIEW] Successfully decrypted urlContent');
                } catch (parseError) {
                  console.error('❌ [SCAN VIEW] Failed to parse/decrypt urlContent ciphertext:', parseError);
                  console.error('❌ [SCAN VIEW] urlContent value:', response.qrDrop.urlContent);
                  console.error('❌ [SCAN VIEW] parseError details:', {
                    message: parseError.message,
                    stack: parseError.stack,
                    name: parseError.name
                  });
                  throw new Error(`Invalid ciphertext format: ${parseError.message}`);
                }
              }
            } else {
              // LEGACY: Traditional decryption with hex key
              if (response.qrDrop.textContent) {
                decrypted.text = await decryptData(response.qrDrop.textContent, effectiveUnlockKey);
              }
              
              if (response.qrDrop.urlContent) {
                const decryptedUrlJson = await decryptData(response.qrDrop.urlContent, effectiveUnlockKey);
                decrypted.urls = JSON.parse(decryptedUrlJson);
              }
            }
            
            console.log('✅ [SCAN VIEW] Setting decryptedContent:', {
              hasText: !!decrypted.text,
              textLength: decrypted.text?.length,
              textPreview: decrypted.text?.substring(0, 50) + '...',
              hasUrls: !!decrypted.urls,
              urlsLength: decrypted.urls?.length,
              urlsPreview: decrypted.urls?.slice(0, 2)
            });
            setDecryptedContent(decrypted);
            toast.success(t('scanView.secureModeDecrypted'));
          } catch (error) {
            console.error('Decryption failed:', error);
            setError('❌ Kunne ikke dekryptere innholdet. Ugyldig nøkkel.');
            setIsLoading(false);
            return;
          } finally {
            setIsDecrypting(false);
          }
        }

        // If no password is required, automatically unlock and load file
        if (!response.qrDrop.password) {
          setIsUnlocked(true);
          // Load file URL(s) if there is actually a file (not just text/URL)
          // Always load files (they need to be decrypted since ALL files are encrypted)
          if ((response.qrDrop.contentType === 'file' || response.qrDrop.contentType === 'bundle') && (response.qrDrop.filePath || (response.qrDrop.files && response.qrDrop.files.length > 0))) {
            const needsLoad = fileUrls.length === 0 && !fileUrl;
            // For secureMode/singleQrMode, we need effectiveUnlockKey. For standard encrypted files, we always need to load/decrypt
            const needsDecrypt = (response.qrDrop.secureMode || response.qrDrop.singleQrMode) ? ((response.qrDrop.secureMode || response.qrDrop.singleQrMode) && effectiveUnlockKey) : true;
            if (needsLoad || needsDecrypt) {
              await loadFile();
            }
          }
          
          // Only increment scan count AFTER file is loaded (important for "scan once" type)
          if (!isPreview) {
            await incrementScanCount(currentQrDropId);
          }
        }
      } catch (error: any) {
        console.error('Error loading QR drop:', error);
        
        // Check for invalid/expired token
        if (error.status === 403 || error.message.includes('tilgangslenke')) {
          setError(t('scanView.linkCannotBeShared'));
        }
        // Check for 410 Gone (expired)
        else if (error.status === 410 || error.message.includes('expired')) {
          setError(t('scanView.qrExpired'));
        } else if (error.status === 404 || error.message.includes('404')) {
          setError(t('scanView.qrNotFound'));
        } else {
          setError(t('scanView.couldNotLoad'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadQrDrop();
  }, [qrDropId, isPreview, isDirectScan, effectiveUnlockKey]);

  const loadFile = async () => {
    try {
      const response = await getFileUrl(currentQrDropId);
      
      // Get decryption key if files are encrypted
      // ALL files are now encrypted, so we always need to decrypt
      let decryptionKey: string | null = null;
      let isSplitKeyMode = false;
      if (qrDrop?.secureMode || qrDrop?.singleQrMode) {
        // Secure Mode or Single QR Mode: use unlock key
        // Check if this is split-key (no encryptionKey on server) or legacy
        // NOTE: For Single QR Mode, we use hex key format (same as Secure Mode with encryptFile/decryptFile)
        isSplitKeyMode = !qrDrop.encryptionKey;
        console.log('🔍 [LOAD FILE] Secure/Single QR Mode file decryption check:', {
          hasEffectiveUnlockKey: !!effectiveUnlockKey,
          effectiveUnlockKeyLength: effectiveUnlockKey?.length,
          effectiveUnlockKeyPreview: effectiveUnlockKey?.substring(0, 20) + '...',
          isSplitKeyMode,
          secureMode: qrDrop?.secureMode,
          singleQrMode: qrDrop?.singleQrMode,
          qrDropId: currentQrDropId
        });
        if (effectiveUnlockKey) {
          decryptionKey = effectiveUnlockKey;
          console.log('✅ [LOAD FILE] Using effectiveUnlockKey for file decryption');
          // Validate key format (should be 64 hex chars = 32 bytes)
          if (decryptionKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(decryptionKey)) {
            console.error('❌ [LOAD FILE] Invalid key format! Expected 64 hex chars, got:', {
              length: decryptionKey.length,
              isHex: /^[0-9a-fA-F]+$/.test(decryptionKey),
              preview: decryptionKey.substring(0, 20) + '...'
            });
          }
        } else {
          console.error('❌ [LOAD FILE] No effectiveUnlockKey available for Secure/Single QR Mode file decryption!');
          // Try to get from storage as fallback
          const storedMasterKey = sessionStorage.getItem(`master_${currentQrDropId}`);
          if (storedMasterKey) {
            console.log('🔑 [LOAD FILE] Found master key in storage, using it:', storedMasterKey.substring(0, 20) + '...');
            decryptionKey = storedMasterKey;
            // Validate key format
            if (decryptionKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(decryptionKey)) {
              console.error('❌ [LOAD FILE] Invalid stored key format! Expected 64 hex chars, got:', {
                length: decryptionKey.length,
                isHex: /^[0-9a-fA-F]+$/.test(decryptionKey)
              });
            }
          } else {
            console.error('❌ [LOAD FILE] No master key found in storage either!');
          }
        }
      } else {
        // Standard encrypted files (ALL files are encrypted): fetch key from server
        // Always try to fetch key for non-secureMode files since they're all encrypted
        try {
          const { projectId } = await import('../utils/supabase/info');
          const keyResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-c3c9181e/qrdrop/${currentQrDropId}/key`);
          if (keyResponse.ok) {
            const keyData = await keyResponse.json();
            decryptionKey = keyData.encryptionKey;
            console.log('✅ Fetched decryption key from server for standard encrypted file');
          } else {
            console.error('Failed to fetch decryption key for preview:', keyResponse.status);
          }
        } catch (error) {
          console.error('Failed to fetch decryption key for preview:', error);
        }
      }
      
      // Support both single file (backwards compatibility) and multiple files
      if (response.files && Array.isArray(response.files)) {
        // Multiple files
        console.log(`✅ Loaded ${response.files.length} file(s)`);
        setFileUrls(response.files);
        // Set first file URL for backwards compatibility
        if (response.files.length > 0) {
          setFileUrl(response.files[0].fileUrl);
        }
        
        // CRITICAL: Decrypt files for preview if we have a decryption key
        // ALL files are encrypted, so we always need to decrypt if we have the key
        if (decryptionKey) {
          console.log('🔐 Decrypting files for preview...');
          setIsDecrypting(true);
          const decryptedUrls: Record<number, string> = {};
          
          for (const file of response.files) {
            try {
              const fileResponse = await fetch(file.fileUrl);
              if (!fileResponse.ok) continue;
              
              const encryptedBlob = await fileResponse.blob();
              console.log('🔐 [DECRYPT FILE] Starting decryption:', {
                fileIndex: file.fileIndex || response.files.indexOf(file),
                fileName: file.fileName,
                encryptedBlobSize: encryptedBlob.size,
                keyLength: decryptionKey!.length,
                keyPreview: decryptionKey!.substring(0, 20) + '...',
                keyEnd: '...' + decryptionKey!.substring(decryptionKey!.length - 10),
                isHex: /^[0-9a-fA-F]+$/.test(decryptionKey!),
                mode: qrDrop?.singleQrMode ? 'Single QR' : qrDrop?.secureMode ? 'Secure' : 'Standard',
                isSplitKeyMode
              });
              const decryptedBlob = await decryptFile(encryptedBlob, decryptionKey!);
              console.log('✅ [DECRYPT FILE] Decryption successful:', {
                fileIndex: file.fileIndex || response.files.indexOf(file),
                decryptedBlobSize: decryptedBlob.size
              });
              
              // CRITICAL: Get original file type from qrDrop.files metadata (before encryption)
              // Backend returns application/octet-stream for encrypted files, so we need original type
              const originalFileMetadata = qrDrop?.files && Array.isArray(qrDrop.files) 
                ? qrDrop.files.find((f: any) => f.name === file.fileName || f.path === file.fileUrl.split('/').pop())
                : null;
              
              // Use original type from metadata, fallback to file.fileType, then qrDrop.fileType
              const originalType = originalFileMetadata?.type || file.fileType || qrDrop?.fileType || 'application/octet-stream';
              
              // If still octet-stream, try to infer from filename extension
              let finalType = originalType;
              if (originalType === 'application/octet-stream' && file.fileName) {
                const ext = file.fileName.split('.').pop()?.toLowerCase();
                const typeMap: Record<string, string> = {
                  'png': 'image/png',
                  'jpg': 'image/jpeg',
                  'jpeg': 'image/jpeg',
                  'gif': 'image/gif',
                  'webp': 'image/webp',
                  'pdf': 'application/pdf',
                  'mp4': 'video/mp4',
                  'mp3': 'audio/mpeg',
                  'wav': 'audio/wav',
                };
                if (ext && typeMap[ext]) {
                  finalType = typeMap[ext];
                }
              }
              
              const typedBlob = new Blob([decryptedBlob], { type: finalType });
              
              // Create blob URL for preview
              const blobUrl = URL.createObjectURL(typedBlob);
              decryptedUrls[file.fileIndex] = blobUrl;
              console.log(`✅ Decrypted file ${file.fileIndex} for preview:`, blobUrl, 'type:', finalType, 'original:', originalType);
            } catch (decryptError) {
              console.error(`❌ Failed to decrypt file ${file.fileIndex}:`, decryptError);
            }
          }
          
          setDecryptedFileUrls(decryptedUrls);
          setIsDecrypting(false);
          console.log('✅ All files decrypted for preview');
        }
      } else if (response.fileUrl) {
        // Single file (backwards compatibility)
        setFileUrl(response.fileUrl);
        setFileUrls([{
          fileUrl: response.fileUrl,
          fileName: response.fileName || qrDrop?.fileName || 'file',
          fileType: response.fileType || qrDrop?.fileType || 'application/octet-stream',
          fileSize: response.fileSize || qrDrop?.fileSize || 0,
          fileIndex: 0
        }]);
        
        // CRITICAL: Decrypt single file for preview if we have a decryption key
        // ALL files are encrypted, so we always need to decrypt if we have the key
        if (decryptionKey) {
          console.log('🔐 Decrypting single file for preview...');
          setIsDecrypting(true);
          try {
            const fileResponse = await fetch(response.fileUrl);
            if (fileResponse.ok) {
              const encryptedBlob = await fileResponse.blob();
              const decryptedBlob = await decryptFile(encryptedBlob, decryptionKey!);
              
              // CRITICAL: Get original file type from qrDrop metadata (before encryption)
              // Backend returns application/octet-stream for encrypted files, so we need original type
              const originalFileMetadata = qrDrop?.files && Array.isArray(qrDrop.files) && qrDrop.files.length > 0
                ? qrDrop.files[0]
                : null;
              
              // Use original type from metadata, fallback to response.fileType, then qrDrop.fileType
              let originalType = originalFileMetadata?.type || response.fileType || qrDrop?.fileType || 'application/octet-stream';
              
              // If still octet-stream, try to infer from filename extension
              if (originalType === 'application/octet-stream' && (response.fileName || qrDrop?.fileName)) {
                const fileName = response.fileName || qrDrop?.fileName || '';
                const ext = fileName.split('.').pop()?.toLowerCase();
                const typeMap: Record<string, string> = {
                  'png': 'image/png',
                  'jpg': 'image/jpeg',
                  'jpeg': 'image/jpeg',
                  'gif': 'image/gif',
                  'webp': 'image/webp',
                  'pdf': 'application/pdf',
                  'mp4': 'video/mp4',
                  'mp3': 'audio/mpeg',
                  'wav': 'audio/wav',
                };
                if (ext && typeMap[ext]) {
                  originalType = typeMap[ext];
                }
              }
              
              const typedBlob = new Blob([decryptedBlob], { type: originalType });
              const blobUrl = URL.createObjectURL(typedBlob);
              
              setDecryptedFileUrls({ 0: blobUrl });
              console.log('✅ Single file decrypted for preview:', blobUrl, 'type:', originalType);
            }
          } catch (decryptError) {
            console.error('❌ Failed to decrypt file:', decryptError);
            toast.error('Kunne ikke dekryptere fil for visning');
          }
          setIsDecrypting(false);
        }
      }
    } catch (error) {
      console.error('Error loading file(s):', error);
      toast.error(t('scanView.couldNotLoad'));
    }
  };

  // Reload and decrypt files when unlockKey changes (after QR2 scan) or when password is unlocked
  useEffect(() => {
    if (!qrDrop) return;
    
    // Only reload for Secure Mode or Single QR Mode (not standard encryption)
    const isSecureMode = qrDrop.secureMode;
    const isSingleQrMode = qrDrop.singleQrMode;
    const hasFiles = qrDrop.filePath || (qrDrop.files && qrDrop.files.length > 0);
    
    if ((!isSecureMode && !isSingleQrMode) || !hasFiles) return;
    
    // Check if we have decryption key (effectiveUnlockKey for secureMode/singleQrMode)
    const hasDecryptionKey = (isSecureMode || isSingleQrMode) && effectiveUnlockKey;
    
    if (hasDecryptionKey) {
      console.log('🔑 Decryption key available, loading/decrypting files...', {
        unlockKey: effectiveUnlockKey ? 'present' : 'missing',
        secureMode: qrDrop.secureMode,
        encrypted: qrDrop.encrypted,
        filesLoaded: fileUrls.length > 0 || !!fileUrl
      });
      
      // Always reload to decrypt (loadFile handles both loading and decrypting)
      loadFile();
    }
  }, [effectiveUnlockKey, isUnlocked, qrDrop?.id, qrDrop?.secureMode]);

  const handlePasswordSubmit = async () => {
    try {
      const response = await verifyPassword(currentQrDropId, passwordInput);
      
      if (response.valid) {
        setIsUnlocked(true);
        setPasswordError(false);
        
        // Load file(s) first if they exist
        if (qrDrop?.filePath || (qrDrop?.files && qrDrop.files.length > 0)) {
          await loadFile();
        }
        
        // Then increment scan count (important for "scan once" type)
        if (!isPreview) {
          await incrementScanCount(currentQrDropId);
        }
      } else {
        setPasswordError(true);
      }
    } catch (error) {
      console.error('Error verifying password:', error);
      toast.error(t('scanView.couldNotLoad'));
    }
  };

  const handleDownloadClick = async (fileIndex?: number) => {
    // If fileIndex is provided, download specific file; otherwise download first file (backwards compatibility)
    const filesToDownload = fileIndex !== undefined ? [fileUrls[fileIndex]] : (fileUrls.length > 0 ? fileUrls : (fileUrl ? [{fileUrl, fileName: qrDrop?.fileName || 'file', fileType: qrDrop?.fileType || 'application/octet-stream', fileSize: qrDrop?.fileSize || 0, fileIndex: 0}] : []));
    
    if (!qrDrop?.viewOnly && filesToDownload.length > 0) {
      try {
        await incrementDownloadCount(currentQrDropId);
        
        // Get decryption key if file is encrypted
        // ALL files are now encrypted, so we always need to decrypt
        let decryptionKey: string | null = null;
        if (qrDrop?.secureMode || qrDrop?.singleQrMode) {
          // Secure Mode or Single QR Mode: use unlock key
          if (unlockKey) {
            decryptionKey = unlockKey;
          }
        } else {
          // Standard encrypted files (ALL files are encrypted): fetch key from server
          // Always try to fetch key for non-secureMode files since they're all encrypted
          try {
            const { projectId } = await import('../utils/supabase/info');
            const keyResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-c3c9181e/qrdrop/${currentQrDropId}/key`);
            if (keyResponse.ok) {
              const keyData = await keyResponse.json();
              decryptionKey = keyData.encryptionKey;
              console.log('✅ Fetched decryption key from server for download');
            } else {
              console.error('Failed to fetch decryption key:', keyResponse.status);
            }
          } catch (error) {
            console.error('Failed to fetch decryption key:', error);
          }
        }
        
        // If file is encrypted but no key available, show error
        // For secureMode/singleQrMode, we need effectiveUnlockKey. For standard encrypted files, we need key from server
        if ((qrDrop?.secureMode || qrDrop?.singleQrMode) && !decryptionKey) {
          toast.error('Cannot decrypt file. Encryption key not available.');
          return;
        } else if (!qrDrop?.secureMode && !qrDrop?.singleQrMode && !decryptionKey) {
          // For standard encrypted files, if we couldn't fetch the key, show error
          toast.error('Cannot decrypt file. Encryption key not available.');
          return;
        }
        
        // Download all files (or single file if fileIndex specified)
        for (let i = 0; i < filesToDownload.length; i++) {
          const file = filesToDownload[i];
          
          // SECURITY: Download via fetch + blob URL to hide signed URL from browser
          const response = await fetch(file.fileUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.status}`);
          }
          let blob = await response.blob();
          
          // CRITICAL SECURITY: Decrypt file if we have a decryption key
          // ALL files are encrypted, so we always need to decrypt if we have the key
          if (decryptionKey) {
            try {
              console.log('🔐 Decrypting file before download...');
              blob = await decryptFile(blob, decryptionKey);
              console.log('✅ File decrypted successfully');
            } catch (decryptError) {
              console.error('❌ Failed to decrypt file:', decryptError);
              toast.error('Failed to decrypt file. Please ensure you have the correct decryption key.');
              return;
            }
          }
          
          // Create blob URL (this hides the original signed URL)
          const blobType = file.fileType || 'application/octet-stream';
          const typedBlob = new Blob([blob], { type: blobType });
          const blobUrl = URL.createObjectURL(typedBlob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = file.fileName;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Clean up object URL
          setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
          
          // MOBILE FIX: Add delay between downloads to prevent mobile browser blocking
          // Mobile browsers often block multiple rapid programmatic downloads
          if (i < filesToDownload.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between downloads
          }
        }
        
        toast.success(filesToDownload.length > 1 
          ? t('scanView.filesDownloaded', { count: filesToDownload.length, defaultValue: `${filesToDownload.length} files downloaded` })
          : t('scanView.fileDownloaded'));
      } catch (error) {
        console.error('Error downloading file(s):', error);
        toast.error(t('scanView.couldNotDownload'));
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatExpiryTime = () => {
    if (!qrDrop?.expiryDate) return null;
    
    const now = new Date();
    const expiryDate = new Date(qrDrop.expiryDate);
    const diffMs = expiryDate.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Utløpt';
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays > 0) {
      return `Utløper om ${diffDays} dag${diffDays !== 1 ? 'er' : ''}`;
    } else if (diffHours > 0) {
      return `Utløper om ${diffHours} time${diffHours !== 1 ? 'r' : ''}`;
    } else {
      return `Utløper om ${diffMinutes} minutt${diffMinutes !== 1 ? 'er' : ''}`;
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto">
        {!isDirectScan && (
          <Button variant="ghost" onClick={onBack} className="mb-6">
            <ArrowLeft className="size-4 mr-2" />
            {t('scanView.back')}
          </Button>
        )}
        
        <Card className="p-12 text-center">
          <Loader2 className="size-12 text-indigo-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">{t('scanView.loadingQr')}</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        {!isDirectScan && (
          <Button variant="ghost" onClick={onBack} className="mb-6">
            <ArrowLeft className="size-4 mr-2" />
            {t('scanView.back')}
          </Button>
        )}
        
        <Card className="p-12 text-center">
          <AlertCircle className="size-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-gray-900 mb-2">{t('scanView.couldNotLoadQr')}</h3>
          <p className="text-gray-600">{error}</p>
        </Card>
      </div>
    );
  }

  // Don't show password screen while loading - wait until we know if password is required
  if (!qrDrop) {
    // EXCEPTION: If this is Secure Mode QR #1, we can show UnlockScreen without qrDrop data
    // Only check secureMode, not encrypted (encrypted is for standard encryption)
    if (isEncrypted && !effectiveUnlockKey && !isLoading) {
      return (
        <UnlockScreen 
          onUnlock={async (key: string) => {
            // This won't actually be called in the URL flow
            // The unlock happens via URL with key parameter
          }}
          isUnlocking={false}
          qrDropId={currentQrDropId}
        />
      );
    }
    
    // If we're still loading, show loading state (should have been caught earlier, but just in case)
    if (isLoading) {
      return (
        <div className="max-w-3xl mx-auto">
          {!isDirectScan && (
            <Button variant="ghost" onClick={onBack} className="mb-6">
              <ArrowLeft className="size-4 mr-2" />
              {t('scanView.back')}
            </Button>
          )}
          
          <Card className="p-12 text-center">
            <Loader2 className="size-12 text-indigo-600 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">{t('scanView.loadingQr')}</p>
          </Card>
        </div>
      );
    }
    
    // If we have an error, show error (should have been caught earlier, but just in case)
    if (error) {
      return (
        <div className="max-w-3xl mx-auto">
          {!isDirectScan && (
            <Button variant="ghost" onClick={onBack} className="mb-6">
              <ArrowLeft className="size-4 mr-2" />
              {t('scanView.back')}
            </Button>
          )}
          
          <Card className="p-12 text-center">
            <AlertCircle className="size-12 text-red-600 mx-auto mb-4" />
            <h3 className="text-gray-900 mb-2">{t('scanView.couldNotLoadQr')}</h3>
            <p className="text-gray-600">{error}</p>
          </Card>
        </div>
      );
    }
    
    // Fallback: Show a message if qrDrop is null but no error/loading state
    return (
      <div className="max-w-3xl mx-auto">
        {!isDirectScan && (
          <Button variant="ghost" onClick={onBack} className="mb-6">
            <ArrowLeft className="size-4 mr-2" />
            {t('scanView.back')}
          </Button>
        )}
        
        <Card className="p-12 text-center">
          <AlertCircle className="size-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-gray-900 mb-2">{t('scanView.couldNotLoadQr')}</h3>
          <p className="text-gray-600">QR-koden kunne ikke lastes. Prøv å skanne på nytt.</p>
        </Card>
      </div>
    );
  }
  
  // Show unlock screen if Secure Mode/Single QR Mode and no key provided
  // NOTE: isEncrypted is set based on secureMode/singleQrMode, not encrypted flag
  // BUT: If showQr2Error is true, don't show UnlockScreen - let App.tsx show the error screen
  // CRITICAL FIX: Also check isLoading - if we're loading and effectiveUnlockKey is set, don't show UnlockScreen yet
  // This prevents showing UnlockScreen when effectiveUnlockKey was just set and useEffect is reloading data
  // For Single QR Mode: Also check if master key exists in sessionStorage (App.tsx may have set it)
  const isSingleQrMode = qrDrop?.singleQrMode;
  const masterKeyInStorage = isSingleQrMode ? sessionStorage.getItem(`master_${currentQrDropId}`) : null;
  const shouldShowUnlockScreen = isEncrypted && !effectiveUnlockKey && !masterKeyInStorage && !showQr2Error && !isLoading;
  
  if (shouldShowUnlockScreen) {
    return (
      <UnlockScreen 
        onUnlock={async (key: string) => {
          // This won't actually be called in the URL flow
          // The unlock happens via URL with key parameter
        }}
        isUnlocking={false}
        qrDropId={currentQrDropId}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {!isDirectScan && (
        <Button variant="ghost" onClick={onBack} className="mb-6">
          <ArrowLeft className="size-4 mr-2" />
          {t('scanView.back')}
        </Button>
      )}

      {!isUnlocked ? (
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
      ) : (
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
            {/* Secure Mode Badge - shown if Secure Mode content was decrypted */}
            {isEncrypted && effectiveUnlockKey && (
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
            
            {/* Expiry Time Tag - Always shown at top */}
            {formatExpiryTime() && (
              <div 
                className="mb-4 inline-flex px-3 py-1.5 rounded-xl border backdrop-blur-sm items-center gap-2 ml-2"
                style={{ 
                  backgroundColor: 'rgba(226, 239, 250, 0.95)', 
                  borderColor: '#D5C5BD',
                  color: '#4A6FA5'
                }}
              >
                <Clock className="size-3.5" />
                <span className="text-sm">{formatExpiryTime()}</span>
              </div>
            )}

            {/* Show title if exists */}
            {qrDrop?.title && (
              <div className="mb-4 pb-4 border-b border-gray-200">
                <h2 className="text-gray-900 text-lg">{qrDrop.title}</h2>
              </div>
            )}

            {/* Text Content */}
            {(() => {
              // Check if text content should be displayed
              const hasTextContent = (qrDrop?.contentType === 'text' || qrDrop?.contentType === 'bundle');
              if (!hasTextContent) return null;
              
              // For Secure Mode: check if decryptedContent.text exists
              if (isEncrypted) {
                if (!decryptedContent.text) {
                  return null;
                }
              } else {
                // For standard mode: check if textContent exists
                if (!qrDrop?.textContent) {
                  return null;
                }
              }
              
              return (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="size-5 text-[#4A6FA5]" />
                  <h3 className="text-gray-900">{t('scanView.textMessage')}</h3>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-gray-900 whitespace-pre-wrap">
                    {isEncrypted ? decryptedContent.text : qrDrop.textContent}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    const textToCopy = isEncrypted ? decryptedContent.text! : qrDrop.textContent;
                    navigator.clipboard.writeText(textToCopy);
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
              );
            })()}

            {/* URL Content */}
            {(() => {
              // Check if URL content should be displayed
              const hasUrlContent = (qrDrop?.contentType === 'url' || qrDrop?.contentType === 'bundle');
              if (!hasUrlContent) return null;
              
              // For Secure Mode: check if decryptedContent.urls exists and has items
              if (isEncrypted) {
                if (!decryptedContent.urls || !Array.isArray(decryptedContent.urls) || decryptedContent.urls.length === 0) {
                  return null;
                }
              } else {
                // For standard mode: check if urlContent exists
                if (!qrDrop?.urlContent) {
                  return null;
                }
              }
              
              return (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <LinkIcon className="size-5 text-[#4A6FA5]" />
                  <h3 className="text-gray-900">{(() => {
                    try {
                      const urls = isEncrypted ? decryptedContent.urls : (qrDrop?.urlContent ? JSON.parse(qrDrop.urlContent) : []);
                      return Array.isArray(urls) && urls.length > 1 ? t('scanView.urlsPlural') : t('scanView.urls');
                    } catch {
                      return t('scanView.urls');
                    }
                  })()}</h3>
                </div>
                {(() => {
                  try {
                    const urls = isEncrypted ? decryptedContent.urls : (qrDrop?.urlContent ? JSON.parse(qrDrop.urlContent) : []);
                    if (Array.isArray(urls) && urls.length > 0) {
                      // Filter out null/undefined URLs
                      const validUrls = urls.filter(url => url && typeof url === 'string');
                      if (validUrls.length === 0) {
                        console.warn('⚠️ [SCAN VIEW] No valid URLs found in decrypted content');
                        return <p className="text-gray-600">Ingen gyldige lenker funnet.</p>;
                      }
                      return (
                        <div className="space-y-2">
                          {validUrls.map((url, index) => (
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
                          {validUrls.length > 0 && (
                            <div className="grid grid-cols-2 gap-3 mt-4">
                              <Button
                                onClick={() => {
                                  navigator.clipboard.writeText(validUrls.join('\n'));
                                  toast.success(t('scanView.linksCopied'));
                                }}
                                variant="outline"
                                size="lg"
                              >
                                <Copy className="size-5 mr-2" />
                                {t('scanView.copyAll')}
                              </Button>
                              <Button
                                onClick={async () => {
                                  await incrementScanCount(currentQrDropId);
                                  validUrls.forEach(url => window.open(url, '_blank'));
                                }}
                                size="lg"
                              >
                                <ExternalLink className="size-5 mr-2" />
                                {t('scanView.openAll')}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    }
                  } catch {
                    // Fallback to single URL
                    return (
                      <>
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <a 
                            href={qrDrop.urlContent}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#5D8CC9] hover:underline break-all flex items-center gap-2"
                          >
                            {qrDrop.urlContent}
                            <ExternalLink className="size-4 flex-shrink-0" />
                          </a>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          <Button
                            onClick={() => {
                              navigator.clipboard.writeText(qrDrop.urlContent);
                              toast.success(t('scanView.linksCopied'));
                            }}
                            variant="outline"
                            size="lg"
                          >
                            <Copy className="size-5 mr-2" />
                            {t('scanView.copy')}
                          </Button>
                          <Button
                            onClick={async () => {
                              await incrementScanCount(currentQrDropId);
                              window.open(qrDrop.urlContent, '_blank');
                            }}
                            size="lg"
                          >
                            <ExternalLink className="size-5 mr-2" />
                            {t('scanView.open')}
                          </Button>
                        </div>
                      </>
                    );
                  }
                })()}
              </div>
              );
            })()}

            {/* File Content - Show all files */}
            {(qrDrop?.contentType === 'file' || qrDrop?.contentType === 'bundle') && (fileUrls.length > 0 || fileUrl || (qrDrop?.files && qrDrop.files.length > 0)) && !qrDrop?.noPreview && (
              <div className="space-y-4 mb-4 pb-20"> {/* pb-20 for space for sticky button */}
                {(() => {
                  // Use fileUrls if loaded, otherwise check qrDrop.files, otherwise fallback to single file
                  if (fileUrls.length > 0) {
                    return fileUrls;
                  } else if (qrDrop?.files && Array.isArray(qrDrop.files) && qrDrop.files.length > 0) {
                    // Files from backend but URLs not loaded yet - show placeholder
                    return qrDrop.files.map((file: any, index: number) => ({
                      fileUrl: '', // Will be loaded
                      fileName: file.name || qrDrop?.fileName || 'file',
                      fileType: file.type || qrDrop?.fileType || 'application/octet-stream',
                      fileSize: file.size || qrDrop?.fileSize || 0,
                      fileIndex: index
                    }));
                  } else if (fileUrl) {
                    return [{fileUrl, fileName: qrDrop?.fileName || 'file', fileType: qrDrop?.fileType || 'application/octet-stream', fileSize: qrDrop?.fileSize || 0, fileIndex: 0}];
                  }
                  return [];
                })().map((file, index) => {
                  // Get original file type from metadata (before encryption)
                  // Backend returns application/octet-stream for encrypted files
                  const originalFileMetadata = qrDrop?.files && Array.isArray(qrDrop.files) 
                    ? qrDrop.files.find((f: any) => f.name === file.fileName || index === file.fileIndex)
                    : null;
                  
                  // Use original type from metadata, fallback to file.fileType
                  let displayFileType = originalFileMetadata?.type || file.fileType || qrDrop?.fileType || 'application/octet-stream';
                  
                  // If still octet-stream, try to infer from filename extension
                  if (displayFileType === 'application/octet-stream' && file.fileName) {
                    const ext = file.fileName.split('.').pop()?.toLowerCase();
                    const typeMap: Record<string, string> = {
                      'png': 'image/png',
                      'jpg': 'image/jpeg',
                      'jpeg': 'image/jpeg',
                      'gif': 'image/gif',
                      'webp': 'image/webp',
                      'pdf': 'application/pdf',
                      'mp4': 'video/mp4',
                      'mp3': 'audio/mpeg',
                      'wav': 'audio/wav',
                    };
                    if (ext && typeMap[ext]) {
                      displayFileType = typeMap[ext];
                    }
                  }
                  
                  return (
                  <div key={index} className="border-4 rounded-2xl p-4" style={{ borderColor: '#D5C5BD' }}>
                    {/* Image Preview */}
                    {displayFileType.startsWith('image/') && (decryptedFileUrls[file.fileIndex] || file.fileUrl) && (
                      <img
                        src={decryptedFileUrls[file.fileIndex] || file.fileUrl}
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
                            toast.error('⚠️ Denne filen kan kun vises');
                          }
                        }}
                      />
                    )}
                    {displayFileType.startsWith('image/') && !decryptedFileUrls[file.fileIndex] && !file.fileUrl && (
                      <div className="w-full h-48 bg-gray-100 rounded-xl mb-2 flex items-center justify-center">
                        <Loader2 className="size-8 text-gray-400 animate-spin" />
                        {isDecrypting && <span className="ml-2 text-sm text-gray-600">Dekrypterer...</span>}
                      </div>
                    )}

                    {/* Video Preview */}
                    {displayFileType.startsWith('video/') && (decryptedFileUrls[file.fileIndex] || file.fileUrl) && (
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
                          <source src={decryptedFileUrls[file.fileIndex] || file.fileUrl} type={displayFileType} />
                          {t('scanView.browserNotSupported')}
                        </video>
                      </div>
                    )}

                    {/* Audio Preview */}
                    {displayFileType.startsWith('audio/') && (
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
                            <source src={decryptedFileUrls[file.fileIndex] || file.fileUrl} type={displayFileType} />
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
                          #download
                        </Button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* No Preview Message */}
            {(qrDrop?.contentType === 'file' || qrDrop?.contentType === 'bundle') && qrDrop?.filePath && qrDrop?.noPreview && (
              <Alert className="mb-4">
                <Eye className="size-4" />
                <AlertDescription>
                  {t('scanView.previewNotAvailable')}
                </AlertDescription>
              </Alert>
            )}

          </Card>

          {/* Sticky Download Button - Fixed at bottom */}
          {(qrDrop?.contentType === 'file' || qrDrop?.contentType === 'bundle') && (qrDrop?.filePath || (qrDrop?.files && qrDrop.files.length > 0)) && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg z-50 max-w-3xl mx-auto">
              {!qrDrop?.viewOnly ? (
                (() => {
                  const totalFiles = fileUrls.length > 0 ? fileUrls.length : (qrDrop?.files && Array.isArray(qrDrop.files) ? qrDrop.files.length : (qrDrop?.filePath ? 1 : 0));
                  const hasFiles = fileUrls.length > 0 || fileUrl || (qrDrop?.files && qrDrop.files.length > 0);
                  
                  if (hasFiles) {
                    return (
                      <Button onClick={() => handleDownloadClick()} className="w-full" size="lg">
                        <Download className="size-5 mr-2" />
                        {totalFiles > 1 
                          ? t('scanView.downloadFiles', { count: totalFiles, defaultValue: `Download files (${totalFiles})` })
                          : t('scanView.downloadFile', { defaultValue: 'Download file' })
                        }
                      </Button>
                    );
                  } else {
                    return (
                      <Button disabled className="w-full" size="lg">
                        <Loader2 className="size-5 mr-2 animate-spin" />
                        {t('scanView.loadingFile')}
                      </Button>
                    );
                  }
                })()
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

          {/* Statistics */}
          {!isDirectScan && (
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
      )}
    </div>
  );
}