import { useState } from 'react';
import { QrDrop } from '../types/qr-drop';
import { Check, Download, Copy, Share2, Eye, Shield, Clock, Key } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SoftCard } from './soft-card';
import { NordicButton } from './nordic-button';
import { toast } from 'sonner@2.0.3';
import { copyToClipboard } from '../utils/clipboard';

interface QrDetailViewProps {
  qrDrop: QrDrop;
  onScan: () => void;
}

export function QrDetailView({ qrDrop, onScan }: QrDetailViewProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/scan/${qrDrop.id}`;
    const success = await copyToClipboard(link);
    
    if (success) {
      setCopied(true);
      toast.success(t('qrDetail.linkCopied'));
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t('qrDetail.couldNotCopyLink'));
    }
  };

  const handleDownloadQr = () => {
    if (qrDrop.secureMode && qrDrop.qrCodeUrl2) {
      // Download both QR codes
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
      
      toast.success(t('qrDetail.bothQrsDownloaded'));
    } else {
      // Download single QR code
      const link = document.createElement('a');
      link.href = qrDrop.qrCodeUrl;
      link.download = `qr-${qrDrop.fileName}.png`;
      link.click();
      toast.success(t('qrDetail.qrDownloaded'));
    }
  };

  const handleShare = async () => {
    const link = `${window.location.origin}/scan/${qrDrop.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('qrDetail.shareFile', { fileName: qrDrop.fileName }),
          text: t('qrDetail.scanQrToAccess'),
          url: link,
        });
      } catch (error) {
        console.log('Share cancelled');
      }
    } else {
      handleCopyLink();
    }
  };

  // Share QR code as image (for individual QR sharing)
  const shareQrAsImage = async (qrCodeUrl: string, qrNumber: string) => {
    try {
      const blob = await (await fetch(qrCodeUrl)).blob();
      const file = new File([blob], `qr-${qrNumber}.png`, { type: 'image/png' });
      
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `QR ${qrNumber}`,
        });
        toast.success(t('qrDetail.qrImageShared', { qrNumber }));
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob
          })
        ]);
        toast.success(t('qrDetail.qrImageCopied', { qrNumber }));
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Share failed:', error);
        toast.error(t('qrDetail.couldNotShareQr', { qrNumber }));
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatExpiryTime = () => {
    if (qrDrop.expiryType === 'first-scan') return t('qrDetail.untilFirstScan');
    if (qrDrop.expiryType === 'never') return t('qrDetail.never');
    if (qrDrop.expiryDate) {
      const now = new Date();
      const diff = qrDrop.expiryDate.getTime() - now.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      if (days > 0) {
        if (days === 1) return `${days} ${t('qrDetail.day')}`;
        return `${days} ${t('qrDetail.days')}`;
      }
      if (hours > 0) {
        if (hours === 1) return `${hours} ${t('qrDetail.hour')}`;
        return `${hours} ${t('qrDetail.hours')}`;
      }
      return t('qrDetail.lessThanHour');
    }
    return 'Ukjent';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* QR Code Display */}
      <SoftCard>
        {qrDrop.secureMode && qrDrop.qrCodeUrl2 ? (
          // Secure Mode: Show BOTH QR codes
          <div>
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl mb-4"
                style={{ 
                  background: 'linear-gradient(135deg, #5D8CC9, #E8927E)',
                  color: 'white'
                }}
              >
                <Shield className="size-5" />
                <span>{t('qrDetail.secureModeTwoQrs')}</span>
              </div>
              <h2 className="text-[#3F3F3F] mb-2">{t('qrDetail.yourQrCodes')}</h2>
              <p className="text-[#5B5B5B]">{t('qrDetail.bothMustBeScanned')}</p>
            </div>

            {/* Two QR Codes Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* QR #1 - Access Code */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#5D8CC9] flex items-center justify-center">
                    <span className="text-white">1</span>
                  </div>
                    <h3 className="text-[#3F3F3F]">{t('qrDetail.accessCode')}</h3>
                </div>
                <div 
                  className="inline-block p-3 bg-white rounded-2xl border-4"
                  style={{ 
                    borderColor: '#5D8CC9',
                    boxShadow: '0 8px 24px rgba(93, 140, 201, 0.15)',
                  }}
                >
                  <img 
                    src={qrDrop.qrCodeUrl} 
                    alt="QR Code 1" 
                    className="w-56 h-56 rounded-xl"
                  />
                </div>
                <p className="text-[#5B5B5B] text-sm mt-3">{t('qrDetail.shareWithRecipient')}</p>
                <div className="mt-3">
                  <NordicButton
                    variant="blue"
                    size="sm"
                    onClick={() => shareQrAsImage(qrDrop.qrCodeUrl, '1')}
                  >
                    <Share2 className="size-4 mr-2" />
                    {t('qrDetail.shareQrImage', { qrNumber: '1' })}
                  </NordicButton>
                </div>
              </div>

              {/* QR #2 - Unlock Code */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#E8927E] flex items-center justify-center">
                    <Key className="size-4 text-white" />
                  </div>
                  <h3 className="text-[#3F3F3F]">{t('qrDetail.unlockCode')}</h3>
                </div>
                <div 
                  className="inline-block p-3 bg-white rounded-2xl border-4"
                  style={{ 
                    borderColor: '#E8927E',
                    boxShadow: '0 8px 24px rgba(232, 146, 126, 0.15)',
                  }}
                >
                  <img 
                    src={qrDrop.qrCodeUrl2} 
                    alt="QR Code 2" 
                    className="w-56 h-56 rounded-xl"
                  />
                </div>
                <p className="text-[#5B5B5B] text-sm mt-3">{t('qrDetail.keyToUnlock')}</p>
                <div className="mt-3">
                  <NordicButton
                    variant="coral"
                    size="sm"
                    onClick={() => shareQrAsImage(qrDrop.qrCodeUrl2!, '2')}
                  >
                    <Share2 className="size-4 mr-2" />
                    {t('qrDetail.shareQrImage', { qrNumber: '2' })}
                  </NordicButton>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div 
              className="rounded-xl p-4 mb-6"
              style={{ 
                backgroundColor: '#E8DCD4',
                borderColor: '#D5C5BD'
              }}
            >
              <p className="text-[#5B5B5B] text-sm text-center">
                {t('qrDetail.shareQr1First')}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <NordicButton onClick={handleDownloadQr} variant="ghost" size="lg">
                <Download className="size-5 mr-2" />
                {t('qrDetail.downloadBoth')}
              </NordicButton>
              <NordicButton onClick={handleShare} variant="blue" size="lg">
                <Share2 className="size-5 mr-2" />
                {t('qrDetail.shareQr1')}
              </NordicButton>
            </div>
          </div>
        ) : (
          // Standard Mode: Show single QR code
          <div className="text-center">
            <h2 className="text-[#3F3F3F] mb-8">{t('qrDetail.yourQrCode')}</h2>
            
            {/* Large QR Code with pastel frame */}
            <div 
              className="inline-block p-4 bg-white rounded-2xl border-8"
              style={{ 
                borderColor: '#D5C5BD',
                boxShadow: '0 12px 36px rgba(63, 63, 63, 0.08), 0 4px 12px rgba(63, 63, 63, 0.04)',
              }}
            >
              <img 
                src={qrDrop.qrCodeUrl} 
                alt="QR Code" 
                className="w-64 h-64 md:w-80 md:h-80 rounded-xl"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
              <NordicButton onClick={handleDownloadQr} variant="ghost" size="lg">
                <Download className="size-5 mr-2" />
                {t('qrDetail.downloadQr')}
              </NordicButton>
              <NordicButton onClick={handleCopyLink} variant="ghost" size="lg">
                {copied ? (
                  <>
                    <Check className="size-5 mr-2" />
                    {t('qrList.copied')}
                  </>
                ) : (
                  <>
                    <Copy className="size-5 mr-2" />
                    {t('qrList.copyLink')}
                  </>
                )}
              </NordicButton>
              <NordicButton onClick={handleShare} variant="blue" size="lg">
                <Share2 className="size-5 mr-2" />
                {t('qrDetail.share')}
              </NordicButton>
            </div>
            
            {/* Share QR code as image button */}
            <div className="flex justify-center mt-4">
              <NordicButton
                variant="ghost"
                size="lg"
                onClick={() => shareQrAsImage(qrDrop.qrCodeUrl, '')}
              >
                <Share2 className="size-5 mr-2" />
                {t('qrDetail.shareQrImageSingle')}
              </NordicButton>
            </div>
          </div>
        )}
      </SoftCard>

      {/* File Information */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* File Details */}
        <SoftCard variant="neutral">
          <h3 className="text-[#3F3F3F] mb-4 flex items-center gap-2">
            <Eye className="size-5 text-[#4A6FA5]" />
            {t('qrDetail.fileDetails')}
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-[#5B5B5B]">{t('qrDetail.fileName')}</span>
              <span className="text-[#3F3F3F] text-right max-w-[200px] truncate">{qrDrop.fileName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#5B5B5B]">{t('qrDetail.size')}</span>
              <span className="text-[#3F3F3F]">{formatFileSize(qrDrop.fileSize)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#5B5B5B]">{t('qrDetail.type')}</span>
              <span className="text-[#3F3F3F]">{qrDrop.fileType.split('/')[1]?.toUpperCase()}</span>
            </div>
            {qrDrop.viewOnly && (
              <div className="flex justify-between">
                <span className="text-[#5B5B5B]">{t('qrDetail.mode')}</span>
                <span className="text-[#5D8CC9]">{t('qrDetail.viewOnly')}</span>
              </div>
            )}
          </div>
        </SoftCard>

        {/* Settings */}
        <SoftCard variant="coral">
          <h3 className="text-[#3F3F3F] mb-4 flex items-center gap-2">
            <Shield className="size-5 text-[#E8927E]" />
            {t('qrDetail.settings')}
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-[#5B5B5B]">{t('qrDetail.expiresIn')}</span>
              <span className="text-[#3F3F3F]">{formatExpiryTime()}</span>
            </div>
            {qrDrop.maxScans && (
              <div className="flex justify-between">
                <span className="text-[#5B5B5B]">{t('qrDetail.maxScans')}</span>
                <span className="text-[#3F3F3F]">{qrDrop.maxScans}</span>
              </div>
            )}
            {qrDrop.maxDownloads && (
              <div className="flex justify-between">
                <span className="text-[#5B5B5B]">{t('qrDetail.maxDownloads')}</span>
                <span className="text-[#3F3F3F]">{qrDrop.maxDownloads}</span>
              </div>
            )}
            {qrDrop.password && (
              <div className="flex justify-between">
                <span className="text-[#5B5B5B]">{t('qrDetail.password')}</span>
                <span className="text-[#5D8CC9]">{t('qrDetail.activated')}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#5B5B5B]">{t('qrDetail.created')}</span>
              <span className="text-[#3F3F3F]">
                {new Date(qrDrop.createdAt).toLocaleDateString('nb-NO', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>
        </SoftCard>
      </div>

      {/* Statistics */}
      <SoftCard>
        <h3 className="text-[#3F3F3F] mb-4">{t('qrDetail.realtimeStats')}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div 
            className="rounded-xl p-4 border"
            style={{ 
              backgroundColor: '#E2EFFA',
              borderColor: '#D5C5BD'
            }}
          >
            <div className="flex items-center gap-2 text-[#4A6FA5] mb-2">
              <Eye className="size-5" />
              <span>{t('qrDetail.scans')}</span>
            </div>
            <p className="text-[#3F3F3F] text-2xl">
              {qrDrop.scanCount}
              {qrDrop.maxScans && (
                <span className="text-[#5B5B5B] text-lg"> / {qrDrop.maxScans}</span>
              )}
            </p>
          </div>
          
          <div 
            className="rounded-xl p-4 border"
            style={{ 
              backgroundColor: '#F5E5E1',
              borderColor: '#D5C5BD'
            }}
          >
            <div className="flex items-center gap-2 text-[#E8927E] mb-2">
              <Download className="size-5" />
              <span>{t('qrDetail.downloads')}</span>
            </div>
            <p className="text-[#3F3F3F] text-2xl">
              {qrDrop.downloadCount}
              {qrDrop.maxDownloads && (
                <span className="text-[#5B5B5B] text-lg"> / {qrDrop.maxDownloads}</span>
              )}
            </p>
          </div>
        </div>
      </SoftCard>

      {/* Preview Button */}
      <SoftCard variant="neutral">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[#3F3F3F]">{t('qrDetail.previewHowFileLooks')}</h3>
            <p className="text-[#5B5B5B] text-sm">{t('qrDetail.previewDesc')}</p>
          </div>
          <NordicButton onClick={onScan} variant="blue">
            <Eye className="size-4 mr-2" />
            {t('qrDetail.preview')}
          </NordicButton>
        </div>
      </SoftCard>
    </div>
  );
}