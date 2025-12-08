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
import { decryptData } from '../utils/encryption';
import { toast } from 'sonner@2.0.3';

interface ScanViewProps {
  qrDropId: string;
  onBack: () => void;
  isPreview?: boolean; // Preview mode doesn't count scans
  isDirectScan?: boolean; // Direct scan from QR code (hide navigation)
  unlockKey?: string | null; // Decryption key from QR #2 (for Secure Mode)
}

export function ScanView({ qrDropId, onBack, isPreview = false, isDirectScan = false, unlockKey = null }: ScanViewProps) {
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [qrDrop, setQrDrop] = useState<any>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0); // Force re-render every second for countdown
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedContent, setDecryptedContent] = useState<{text?: string; urls?: string[]}>({});
  const [currentQrDropId] = useState(qrDropId); // Store ID in state so it doesn't get lost

  useEffect(() => {
    const loadQrDrop = async () => {
      try {
        setIsLoading(true);
        
        // Get access token from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        let accessToken = urlParams.get('access') || undefined;
        const unlockParam = urlParams.get('unlock'); // Preserve unlock flag
        
        // 🔐 SECURE MODE: If this is a direct scan without unlock key or unlock param,
        // this might be QR #1 - just show UnlockScreen without loading data
        if (isDirectScan && !unlockKey && !unlockParam && !accessToken) {
          // We need to check if this is a Secure Mode QR drop
          // Make a lightweight check without incrementing scan count
          const lightCheck = await fetch(`https://${(await import('../utils/supabase/info')).projectId}.supabase.co/functions/v1/make-server-c3c9181e/qrdrop/${currentQrDropId}/check`, {
            headers: {
              'Authorization': `Bearer ${(await import('../utils/supabase/info')).publicAnonKey}`
            }
          });
          
          if (lightCheck.ok) {
            const checkData = await lightCheck.json();
            if (checkData.secureMode) {
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
          if (unlockKey) {
            redirectUrl += `&key=${encodeURIComponent(unlockKey)}`;
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
          
          // OPTIMIZATION: Check if server already included fileUrl
          if ((newResponse as any).fileUrl) {
            setFileUrl((newResponse as any).fileUrl);
            console.log('✅ fileUrl received in response - skipping separate /file call');
          }
          
          // Clean up URL after getting data
          if (isDirectScan) {
            window.history.replaceState({}, '', '/scan');
          } else if (newAccessToken) {
            window.history.replaceState({}, '', `/scan/${currentQrDropId}`);
          }
          
          // Check if content is encrypted (Secure Mode)
          const isContentEncrypted = newResponse.qrDrop.encrypted || newResponse.qrDrop.secureMode;
          setIsEncrypted(isContentEncrypted);
          
          // If encrypted but no unlock key, we'll show UnlockScreen later
          if (isContentEncrypted && !unlockKey) {
            setIsLoading(false);
            return;
          }
          
          // Decrypt content if we have the key
          if (isContentEncrypted && unlockKey) {
            try {
              setIsDecrypting(true);
              const decrypted: {text?: string; urls?: string[]} = {};
              
              // Decrypt text content if exists
              if (newResponse.qrDrop.textContent) {
                decrypted.text = await decryptData(newResponse.qrDrop.textContent, unlockKey);
              }
              
              // Decrypt URL content if exists
              if (newResponse.qrDrop.urlContent) {
                const decryptedUrlJson = await decryptData(newResponse.qrDrop.urlContent, unlockKey);
                decrypted.urls = JSON.parse(decryptedUrlJson);
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
            // Load file URL only if there is actually a file (not just text/URL) AND we don't already have it
            if ((newResponse.qrDrop.contentType === 'file' || newResponse.qrDrop.contentType === 'bundle') && newResponse.qrDrop.filePath && !fileUrl) {
              await loadFile();
            }
            
            // Only increment scan count AFTER file is loaded (important for "scan once" type)
            if (!isPreview) {
              await incrementScanCount(currentQrDropId);
            }
          }
          
          setIsLoading(false);
          return; // Stop here, we've processed everything
        }
        
        // Token was valid and used - now clean up the URL completely (hide ID and token)
        if (isDirectScan) {
          // For direct scans (from QR code), hide the entire URL path
          window.history.replaceState({}, '', '/scan');
        } else if (accessToken) {
          // For preview mode, just remove the token but keep the ID
          window.history.replaceState({}, '', `/scan/${currentQrDropId}`);
        }
        
        setQrDrop(response.qrDrop);
        
        // OPTIMIZATION: Check if server already included fileUrl
        if ((response as any).fileUrl) {
          setFileUrl((response as any).fileUrl);
          console.log('✅ fileUrl received in response - skipping separate /file call');
        }
        
        // Check if content is encrypted (Secure Mode)
        const isContentEncrypted = response.qrDrop.encrypted || response.qrDrop.secureMode;
        setIsEncrypted(isContentEncrypted);
        
        // If encrypted but no unlock key, we'll show UnlockScreen later
        if (isContentEncrypted && !unlockKey) {
          setIsLoading(false);
          return;
        }
        
        // Decrypt content if we have the key
        if (isContentEncrypted && unlockKey) {
          try {
            setIsDecrypting(true);
            const decrypted: {text?: string; urls?: string[]} = {};
            
            // Decrypt text content if exists
            if (response.qrDrop.textContent) {
              decrypted.text = await decryptData(response.qrDrop.textContent, unlockKey);
            }
            
            // Decrypt URL content if exists
            if (response.qrDrop.urlContent) {
              const decryptedUrlJson = await decryptData(response.qrDrop.urlContent, unlockKey);
              decrypted.urls = JSON.parse(decryptedUrlJson);
            }
            
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
          // Load file URL only if there is actually a file (not just text/URL)
          if ((response.qrDrop.contentType === 'file' || response.qrDrop.contentType === 'bundle') && response.qrDrop.filePath) {
            await loadFile();
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
  }, [qrDropId, isPreview, isDirectScan, unlockKey]);

  const loadFile = async () => {
    try {
      const response = await getFileUrl(currentQrDropId);
      setFileUrl(response.fileUrl);
    } catch (error) {
      console.error('Error loading file:', error);
      toast.error(t('scanView.couldNotLoad'));
    }
  };

  const handlePasswordSubmit = async () => {
    try {
      const response = await verifyPassword(currentQrDropId, passwordInput);
      
      if (response.valid) {
        setIsUnlocked(true);
        setPasswordError(false);
        
        // Load file first if it exists
        if (qrDrop?.filePath) {
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

  const handleDownloadClick = async () => {
    if (!qrDrop?.viewOnly && fileUrl) {
      try {
        await incrementDownloadCount(currentQrDropId);
        
        // Download file
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = qrDrop.fileName;
        link.click();
        
        toast.success(t('scanView.fileDownloaded'));
      } catch (error) {
        console.error('Error downloading file:', error);
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
    if (isEncrypted && !unlockKey && !isLoading) {
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
    return null;
  }
  
  // Show unlock screen if encrypted and no key provided
  if (isEncrypted && !unlockKey) {
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
        <div className="space-y-4">
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
            {/* Secure Mode Badge - shown if content was decrypted */}
            {isEncrypted && unlockKey && (
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
            {(qrDrop?.contentType === 'text' || qrDrop?.contentType === 'bundle') && (isEncrypted ? decryptedContent.text : qrDrop?.textContent) && (
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
            )}

            {/* URL Content */}
            {(qrDrop?.contentType === 'url' || qrDrop?.contentType === 'bundle') && (isEncrypted ? decryptedContent.urls : qrDrop?.urlContent) && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <LinkIcon className="size-5 text-[#4A6FA5]" />
                  <h3 className="text-gray-900">{(() => {
                    try {
                      const urls = isEncrypted ? decryptedContent.urls : JSON.parse(qrDrop.urlContent);
                      return Array.isArray(urls) && urls.length > 1 ? t('scanView.urlsPlural') : t('scanView.urls');
                    } catch {
                      return t('scanView.urls');
                    }
                  })()}</h3>
                </div>
                {(() => {
                  try {
                    const urls = isEncrypted ? decryptedContent.urls : JSON.parse(qrDrop.urlContent);
                    if (Array.isArray(urls)) {
                      return (
                        <div className="space-y-2">
                          {urls.map((url, index) => (
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
                          {urls.length > 0 && (
                            <div className="grid grid-cols-2 gap-3 mt-4">
                              <Button
                                onClick={() => {
                                  navigator.clipboard.writeText(urls.join('\n'));
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
                                  urls.forEach(url => window.open(url, '_blank'));
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
            )}

            {/* File Content - Image Preview */}
            {(qrDrop?.contentType === 'file' || qrDrop?.contentType === 'bundle') && qrDrop?.fileType?.startsWith('image/') && fileUrl && !qrDrop?.noPreview && (
              <img
                src={fileUrl}
                alt={qrDrop.fileName}
                className="w-full h-auto rounded-2xl mb-4 border-4"
                style={{ 
                  borderColor: '#D5C5BD',
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

            {/* File Content - Video Preview */}
            {(qrDrop?.contentType === 'file' || qrDrop?.contentType === 'bundle') && qrDrop?.fileType?.startsWith('video/') && fileUrl && !qrDrop?.noPreview && (
              <div className="mb-4">
                <video
                  controls
                  className="w-full h-auto rounded-2xl border-4"
                  style={{ 
                    borderColor: '#D5C5BD',
                    maxHeight: '70vh',
                  }}
                  controlsList={qrDrop.viewOnly ? 'nodownload' : undefined}
                  onContextMenu={(e) => {
                    if (qrDrop.viewOnly) {
                      e.preventDefault();
                      toast.error(t('scanView.fileViewOnly'));
                    }
                  }}
                >
                  <source src={fileUrl} type={qrDrop.fileType} />
                  {t('scanView.browserNotSupported')}
                </video>
              </div>
            )}

            {/* File Content - Audio Preview */}
            {(qrDrop?.contentType === 'file' || qrDrop?.contentType === 'bundle') && qrDrop?.fileType?.startsWith('audio/') && fileUrl && !qrDrop?.noPreview && (
              <div className="mb-4">
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-8 border-4" style={{ borderColor: '#D5C5BD' }}>
                  <div className="text-center mb-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                    <h3 className="text-gray-900 mb-1">{qrDrop.fileName}</h3>
                    <p className="text-gray-600 text-sm">{qrDrop.fileType.split('/')[1]?.toUpperCase() || 'AUDIO'}</p>
                  </div>
                  <audio
                    controls
                    className="w-full"
                    style={{
                      filter: 'hue-rotate(200deg) saturate(0.8)',
                    }}
                    controlsList={qrDrop.viewOnly ? 'nodownload' : undefined}
                    onContextMenu={(e) => {
                      if (qrDrop.viewOnly) {
                        e.preventDefault();
                        toast.error(t('scanView.fileViewOnly'));
                      }
                    }}
                  >
                    <source src={fileUrl} type={qrDrop.fileType} />
                    {t('scanView.browserNotSupportedAudio')}
                  </audio>
                </div>
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

            {/* File Info - Only for files or bundles with files, and NOT when noPreview is enabled */}
            {(qrDrop?.contentType === 'file' || qrDrop?.contentType === 'bundle') && qrDrop?.fileType && !qrDrop?.noPreview && (
              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{t('scanView.fileType')}</p>
                    <p className="text-gray-900 text-sm">{qrDrop?.fileType.split('/')[1]?.toUpperCase() || 'Ukjent'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{t('scanView.size')}</p>
                    <p className="text-gray-900 text-sm">{formatFileSize(qrDrop?.fileSize || 0)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Download Button - Only for files or bundles with files */}
            {(qrDrop?.contentType === 'file' || qrDrop?.contentType === 'bundle') && qrDrop?.filePath && (
              <>
                {!qrDrop?.viewOnly ? (
                  fileUrl ? (
                    <Button onClick={handleDownloadClick} className="w-full" size="lg">
                      <Download className="size-5 mr-2" />
                      {t('scanView.downloadFile')}
                    </Button>
                  ) : (
                    <Button disabled className="w-full" size="lg">
                      <Loader2 className="size-5 mr-2 animate-spin" />
                      {t('scanView.loadingFile')}
                    </Button>
                  )
                ) : (
                  <Alert>
                    <Eye className="size-4" />
                    <AlertDescription>
                      {t('scanView.viewOnly')}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </Card>

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