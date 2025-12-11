import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Download, Eye, Clock, Shield, Lock, Trash2, Link2, Calendar, EyeOff, AlertCircle, QrCode as QrCodeIcon, FileText, Timer, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SoftCard } from './soft-card';
import { NordicButton } from './nordic-button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { useAuth } from '../utils/auth-context';
import type { QrDrop } from '../App';
import { getFileUrl } from '../utils/api-client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';

interface QrListProps {
  qrDrops: QrDrop[];
  onDelete: (id: string) => void;
  onScan: (qrDrop: QrDrop) => void;
  onDetail?: (qrDrop: QrDrop) => void;
  isLoading?: boolean;
}

export function QrList({ qrDrops, onDelete, onScan, onDetail, isLoading }: QrListProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [expandedQrId, setExpandedQrId] = useState<string | null>(null);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [loadingFiles, setLoadingFiles] = useState<Record<string, boolean>>({});
  const [, setTick] = useState(0); // Force re-render every second for countdown
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedQrForView, setSelectedQrForView] = useState<QrDrop | null>(null);
  const [copiedUrl1, setCopiedUrl1] = useState(false);
  
  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Sort QR drops by creation date (newest first)
  const sortedQrDrops = [...qrDrops].sort((a, b) => 
    b.createdAt.getTime() - a.createdAt.getTime()
  );

  const loadFilePreview = async (qrDropId: string) => {
    if (fileUrls[qrDropId] || loadingFiles[qrDropId]) {
      return; // Already loaded or loading
    }

    setLoadingFiles({ ...loadingFiles, [qrDropId]: true });
    
    try {
      const response = await getFileUrl(qrDropId);
      setFileUrls({ ...fileUrls, [qrDropId]: response.fileUrl });
    } catch (error) {
      console.error('Error loading file preview:', error);
    } finally {
      setLoadingFiles({ ...loadingFiles, [qrDropId]: false });
    }
  };

  const handleExpandToggle = (qrDropId: string, isOpen: boolean) => {
    setExpandedQrId(isOpen ? qrDropId : null);
    if (isOpen) {
      loadFilePreview(qrDropId);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatExpiryLabel = (qrDrop: QrDrop) => {
    if (qrDrop.expiryType === 'scan') {
      return t('qrList.untilFirstScan');
    }
    
    if (!qrDrop.expiryDate) {
      return t('qrList.noExpiry');
    }
    
    const now = new Date();
    const diff = qrDrop.expiryDate.getTime() - now.getTime();
    
    if (diff < 0) {
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

  const isExpired = (qrDrop: QrDrop): boolean => {
    if (qrDrop.expiryType === 'scan' && qrDrop.scanCount > 1) {
      return true;
    }
    
    if (qrDrop.maxScans && qrDrop.scanCount >= qrDrop.maxScans) {
      return true;
    }
    
    if (qrDrop.maxDownloads && qrDrop.downloadCount >= qrDrop.maxDownloads) {
      return true;
    }
    
    if (qrDrop.expiryDate && qrDrop.expiryDate < new Date()) {
      return true;
    }
    
    return false;
  };

  const downloadQr = (qrDrop: QrDrop) => {
    if (qrDrop.secureMode && qrDrop.qrCodeUrl2) {
      // Download both QR codes for Secure Mode
      const link1 = document.createElement('a');
      link1.href = qrDrop.qrCodeUrl;
      link1.download = `qr-1-access-${qrDrop.fileName}.png`;
      link1.click();
      
      setTimeout(() => {
        const link2 = document.createElement('a');
        link2.href = qrDrop.qrCodeUrl2!;
        link2.download = `qr-2-unlock-${qrDrop.fileName}.png`;
        link2.click();
      }, 100);
      
      toast(t('qrList.bothQrsDownloaded'));
    } else {
      // Download single QR code
      const link = document.createElement('a');
      link.href = qrDrop.qrCodeUrl;
      link.download = `qrdrop-${qrDrop.fileName}.png`;
      link.click();
      toast(t('qrList.qrDownloaded'));
    }
  };

  if (isLoading) {
    return (
      <SoftCard className="p-12 text-center">
        <div 
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border"
          style={{ backgroundColor: '#E8DCD4', borderColor: '#D5C5BD' }}
        >
          <Clock className="size-10 text-[#5B5B5B]" />
        </div>
        <h3 className="text-[#3F3F3F] mb-2">{t('qrList.noQrsYet')}</h3>
        <p className="text-[#5B5B5B] mb-6">{t('qrList.uploadFile')}</p>
        <NordicButton variant="blue">
          {t('qrList.uploadFile')}
        </NordicButton>
      </SoftCard>
    );
  }

  if (qrDrops.length === 0) {
    return (
      <SoftCard className="p-12 text-center">
        <div 
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border"
          style={{ 
            background: 'linear-gradient(135deg, #E2EFFA, #F5E5E1)',
            borderColor: '#D5C5BD'
          }}
        >
          <QrCodeIcon className="size-10 text-[#4A6FA5]" />
        </div>
        <h3 className="text-[#3F3F3F] mb-2">
          {user ? t('qrList.noQrsYet') : t('qrList.loginToSee')}
        </h3>
        <p className="text-[#5B5B5B] mb-6">
          {user 
            ? t('qrList.uploadFile')
            : t('qrList.loginPrompt')}
        </p>
      </SoftCard>
    );
  }

  return (
    <div className="space-y-6">
      
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[#3F3F3F]">{t('qrList.myQrs')}</h2>
          <p className="text-[#5B5B5B]">{t('qrList.manageShares')}</p>
        </div>
      </div>

      <div className="grid gap-4">
        {sortedQrDrops.map((qrDrop) => {
          const expired = isExpired(qrDrop);
          
          return (
            <SoftCard key={qrDrop.id} className={`relative ${expired ? 'opacity-60' : ''}`}>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                {/* QR Code Preview */}
                <div className="flex-shrink-0 mx-auto sm:mx-0">
                  <div 
                    className="p-3 rounded-xl border-4 cursor-pointer hover:opacity-80 transition-opacity relative"
                    style={{ borderColor: '#D5C5BD' }}
                    onClick={() => {
                      setSelectedQrForView(qrDrop);
                      setShowQrModal(true);
                    }}
                  >
                    <img 
                      src={qrDrop.qrCodeUrl} 
                      alt="QR Code"
                      className="w-24 h-24 rounded-lg"
                    />
                    
                    {/* Secure Mode Badge - Shows "2x" indicator */}
                    {qrDrop.secureMode && qrDrop.qrCodeUrl2 && (
                      <div 
                        className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-xs border-2 border-white shadow-lg"
                        style={{ 
                          background: 'linear-gradient(135deg, #5D8CC9, #E8927E)',
                          color: 'white'
                        }}
                      >
                        2×
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[#3F3F3F] truncate">{qrDrop.fileName}</h3>
                      <p className="text-[#5B5B5B] text-sm">
                        {t('qrList.created')} {qrDrop.createdAt.toLocaleDateString('nb-NO')} kl. {qrDrop.createdAt.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    
                    <div className="flex gap-2 ml-4 flex-shrink-0">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="px-3 py-2 rounded-xl hover:bg-[#F5E5E1] transition-colors border border-transparent hover:border-[#D5C5BD]"
                          >
                            <Trash2 className="size-4 text-[#E8927E]" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-white border-[#D5C5BD] rounded-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-[#3F3F3F]">
                              {t('qrList.deleteQr')}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-[#5B5B5B]">
                              {t('qrList.deleteConfirm', { fileName: qrDrop.fileName })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl border-[#D5C5BD]">
                              {t('qrList.cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => onDelete(qrDrop.id)}
                              className="rounded-xl bg-[#E8927E] hover:bg-[#D67B6A] text-white"
                            >
                              {t('qrList.delete')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {expired ? (
                      <span 
                        className="px-3 py-1 rounded-full text-sm flex items-center gap-1 border"
                        style={{ backgroundColor: '#F5E5E1', color: '#E8927E', borderColor: '#D5C5BD' }}
                      >
                        <Timer className="size-3" />
                        {t('qrList.expired')}
                      </span>
                    ) : (
                      <span 
                        className="px-3 py-1 rounded-full text-sm flex items-center gap-1 border"
                        style={{ backgroundColor: '#E2EFFA', color: '#4A6FA5', borderColor: '#D5C5BD' }}
                      >
                        <Clock className="size-3" />
                        {formatExpiryLabel(qrDrop)}
                      </span>
                    )}
                    
                    {qrDrop.secureMode && (
                      <span 
                        className="px-3 py-1 rounded-full text-sm flex items-center gap-1 border"
                        style={{ backgroundColor: '#F5E5E1', color: '#E8927E', borderColor: '#E8927E' }}
                      >
                        <Shield className="size-3" />
                        {t('qrList.secureMode')}
                      </span>
                    )}
                    
                    {qrDrop.password && (
                      <span 
                        className="px-3 py-1 rounded-full text-sm flex items-center gap-1 border"
                        style={{ backgroundColor: '#E1C7BA', color: '#5B5B5B', borderColor: '#D5C5BD' }}
                      >
                        <Lock className="size-3" />
                        {t('qrList.passwordProtected')}
                      </span>
                    )}
                    
                    {qrDrop.viewOnly && (
                      <span 
                        className="px-3 py-1 rounded-full text-sm flex items-center gap-1 border"
                        style={{ backgroundColor: '#E8DCD4', color: '#5B5B5B', borderColor: '#D5C5BD' }}
                      >
                        <Eye className="size-3" />
                        {t('qrList.viewOnly')}
                      </span>
                    )}
                  </div>

                  {/* Statistics */}
                  <div 
                    className="grid grid-cols-2 gap-2 sm:gap-4 rounded-xl p-3 sm:p-4 border"
                    style={{ backgroundColor: '#E8DCD4', borderColor: '#D5C5BD' }}
                  >
                    <div>
                      <div className="flex items-center gap-1 sm:gap-2 text-[#5B5B5B] mb-1">
                        <Eye className="size-3 sm:size-4 flex-shrink-0" />
                        <span className="text-xs sm:text-sm">{t('qrList.scans')}</span>
                      </div>
                      <p className="text-[#3F3F3F] text-sm sm:text-base">
                        {qrDrop.scanCount}
                        {qrDrop.maxScans && (
                          <span className="text-[#5B5B5B] text-xs sm:text-sm"> / {qrDrop.maxScans}</span>
                        )}
                      </p>
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-1 sm:gap-2 text-[#5B5B5B] mb-1">
                        <Download className="size-3 sm:size-4 flex-shrink-0" />
                        <span className="text-xs sm:text-sm">{t('qrList.downloads')}</span>
                      </div>
                      <p className="text-[#3F3F3F] text-sm sm:text-base">
                        {qrDrop.downloadCount}
                        {qrDrop.maxDownloads && (
                          <span className="text-[#5B5B5B] text-xs sm:text-sm"> / {qrDrop.maxDownloads}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* File Preview */}
                  <Collapsible 
                    open={expandedQrId === qrDrop.id}
                    onOpenChange={(isOpen) => handleExpandToggle(qrDrop.id, isOpen)}
                  >
                    <CollapsibleTrigger className="flex items-center gap-2 text-[#6D8DAF] hover:text-[#5D8CC9] mt-4 transition-colors">
                      <ChevronDown className={`size-4 transition-transform ${expandedQrId === qrDrop.id ? 'rotate-180' : ''}`} />
                      <span className="text-sm">
                        {expandedQrId === qrDrop.id ? t('qrList.hideFile') : t('qrList.showFile')}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4 overflow-hidden">
                      <div className="max-w-full overflow-x-auto">
                        {loadingFiles[qrDrop.id] ? (
                          <div 
                            className="rounded-xl p-6 text-center border"
                            style={{ backgroundColor: '#E8DCD4', borderColor: '#D5C5BD' }}
                          >
                            <p className="text-[#5B5B5B]">{t('qrList.loadingFile')}</p>
                          </div>
                        ) : fileUrls[qrDrop.id] ? (
                          <div 
                            className="rounded-xl p-4 border max-w-full"
                            style={{ backgroundColor: '#E8DCD4', borderColor: '#D5C5BD' }}
                          >
                            {qrDrop.fileType.startsWith('image/') ? (
                              <img
                                src={fileUrls[qrDrop.id]}
                                alt={qrDrop.fileName}
                                className="w-full max-w-full h-auto rounded-xl border-4"
                                style={{ borderColor: '#D5C5BD' }}
                              />
                            ) : (
                              <div className="flex items-center gap-4 p-4 min-w-0">
                                <div 
                                  className="p-3 rounded-xl border flex-shrink-0"
                                  style={{ backgroundColor: '#E2EFFA', borderColor: '#D5C5BD' }}
                                >
                                  <FileText className="size-8 text-[#4A6FA5]" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[#3F3F3F] truncate">{qrDrop.fileName}</p>
                                  <p className="text-[#5B5B5B] text-sm">{formatFileSize(qrDrop.fileSize)}</p>
                                  <p className="text-[#5B5B5B] text-sm">{qrDrop.fileType.split('/')[1]?.toUpperCase()}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div 
                            className="rounded-xl p-6 text-center border"
                            style={{ backgroundColor: '#E8DCD4', borderColor: '#D5C5BD' }}
                          >
                            <p className="text-[#5B5B5B] text-sm">{t('qrList.couldNotLoadFile')}</p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </SoftCard>
          );
        })}
      </div>

      {/* QR Code Modal - Zero-Link Design */}
      <Dialog open={showQrModal} onOpenChange={(open) => {
        setShowQrModal(open);
        
        // When opening modal, the QR code is already generated with clean URL
        // No need to regenerate - it's always shareable via QR scanning
        // Server handles token generation on-demand when scanned
      }}>
        <DialogContent className="bg-white border-[#D5C5BD] rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#3F3F3F]">{selectedQrForView?.fileName}</DialogTitle>
            <DialogDescription className="text-[#5B5B5B]">
              {selectedQrForView?.secureMode 
                ? t('qrList.twoQrsForSecurity')
                : t('qrList.scanToShare')}
            </DialogDescription>
          </DialogHeader>
          
          {selectedQrForView?.secureMode && selectedQrForView?.qrCodeUrl2 ? (
            // SECURE MODE: Show both QR codes
            <div className="flex flex-col py-6">
              {/* Secure Mode Badge */}
              <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl mb-6 self-center"
                style={{ 
                  background: 'linear-gradient(135deg, #5D8CC9, #E8927E)',
                  color: 'white'
                }}
              >
                <Shield className="size-5" />
                <span>Secure Mode</span>
              </div>

              {/* Two QR Codes Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* QR #1 - Access Code */}
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-[#5D8CC9] flex items-center justify-center">
                      <span className="text-white">1</span>
                    </div>
                    <h4 className="text-[#3F3F3F]">{t('qrList.accessCode')}</h4>
                  </div>
                  <div className="relative">
                    <img 
                      src={selectedQrForView.qrCodeUrl} 
                      alt="QR Code 1"
                      className="w-72 h-72 rounded-2xl border-4"
                      style={{ 
                        backgroundColor: '#000000',
                        borderColor: '#5D8CC9'
                      }}
                    />
                  </div>
                  <p className="text-[#5B5B5B] text-sm mt-2">{t('qrList.shareWithRecipient')}</p>
                  
                  {/* URL Box under QR #1 */}
                  <div 
                    className="rounded-lg p-2 mt-3 text-xs break-all max-w-64"
                    style={{ 
                      backgroundColor: 'rgba(93, 140, 201, 0.1)',
                      border: '1px solid rgba(93, 140, 201, 0.2)'
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[#5B5B5B] flex-1">
                        {`${window.location.origin}/scan/${selectedQrForView.id}`}
                      </span>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/scan/${selectedQrForView.id}`;
                          navigator.clipboard.writeText(url);
                          setCopiedUrl1(true);
                          setTimeout(() => setCopiedUrl1(false), 2000);
                          toast.success(t('qrList.copied'));
                        }}
                        className="flex-shrink-0 p-1 rounded hover:bg-white/50 transition-colors"
                      >
                        {copiedUrl1 ? (
                          <Check className="size-4 text-green-600" />
                        ) : (
                          <Copy className="size-4 text-[#5D8CC9]" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* QR #2 - Unlock Code */}
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-[#E8927E] flex items-center justify-center">
                      <Lock className="size-4 text-white" />
                    </div>
                    <h4 className="text-[#3F3F3F]">{t('qrList.unlockCode')}</h4>
                  </div>
                  <div className="relative">
                    <img 
                      src={selectedQrForView.qrCodeUrl2} 
                      alt="QR Code 2"
                      className="w-64 h-64 rounded-2xl border-4"
                      style={{ 
                        backgroundColor: '#000000',
                        borderColor: '#E8927E'
                      }}
                    />
                  </div>
                  <p className="text-[#5B5B5B] text-sm mt-2">{t('qrList.keyToUnlock')}</p>
                  
                  {/* Info: No URL for QR #2 */}
                  <div 
                    className="rounded-lg p-2 mt-3 text-xs text-center max-w-64"
                    style={{ 
                      backgroundColor: 'rgba(232, 146, 126, 0.1)',
                      border: '1px solid rgba(232, 146, 126, 0.2)'
                    }}
                  >
                    <p className="text-[#5B5B5B]">
                      {t('qrList.noUrl')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Info Card */}
              <div 
                className="rounded-xl p-4 border mb-6"
                style={{ 
                  backgroundColor: '#E8DCD4',
                  borderColor: '#D5C5BD'
                }}
              >
                <p className="text-[#5B5B5B] text-sm text-center">
                  {t('qrList.shareQr1First')}
                </p>
              </div>

              {/* Action Button */}
              <NordicButton
                onClick={() => selectedQrForView && downloadQr(selectedQrForView)}
                variant="coral"
                size="lg"
                className="w-full"
              >
                <Download className="size-5 mr-2" />
                {t('qrList.downloadBothQrs')}
              </NordicButton>
            </div>
          ) : (
            // STANDARD MODE: Show single QR code
            <div className="flex flex-col items-center py-6">
              {/* Large QR Code */}
              <div className="relative mb-6">
                <img 
                  src={selectedQrForView?.qrCodeUrl} 
                  alt="QR Code"
                  className="w-80 h-80 rounded-2xl"
                  style={{ backgroundColor: '#000000' }}
                />
              </div>

              {/* URL Box - Copyable Link */}
              <div className="w-full mb-6">
                <label className="text-[#5B5B5B] text-sm mb-2 block">
                  {t('qrList.qrCodePointsTo')}
                </label>
                <div 
                  className="rounded-xl p-4 border"
                  style={{ 
                    backgroundColor: '#E2EFFA',
                    borderColor: '#D5C5BD'
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div 
                      className="p-2 rounded-lg border flex-shrink-0"
                      style={{ 
                        backgroundColor: '#D0E3F4',
                        borderColor: '#D5C5BD'
                      }}
                    >
                      <Link2 className="size-5 text-[#4A6FA5]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#5B5B5B] text-sm break-all mb-3">
                        {`${window.location.origin}/scan/${selectedQrForView?.id}`}
                      </p>
                      <NordicButton
                        onClick={() => {
                          const url = `${window.location.origin}/scan/${selectedQrForView?.id}`;
                          navigator.clipboard.writeText(url);
                          setCopiedUrl1(true);
                          setTimeout(() => setCopiedUrl1(false), 2000);
                          toast.success(t('qrList.copied'));
                        }}
                        variant="blue"
                        size="sm"
                        className="w-full"
                      >
                        {copiedUrl1 ? (
                          <>
                            <Check className="size-4 mr-2" />
                            {t('qrList.copied')}
                          </>
                        ) : (
                          <>
                            <Copy className="size-4 mr-2" />
                            {t('qrList.copyLink')}
                          </>
                        )}
                      </NordicButton>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button - Only Download QR */}
              <NordicButton
                onClick={() => selectedQrForView && downloadQr(selectedQrForView)}
                variant="coral"
                size="lg"
                className="w-full"
              >
                <Download className="size-5 mr-2" />
                {t('qrList.downloadQr')}
              </NordicButton>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}