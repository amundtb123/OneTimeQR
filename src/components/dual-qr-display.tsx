import { Download, Share2, Shield, Key, Copy, Check, Link2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner@2.0.3';
import { SoftCard } from './soft-card';
import { NordicButton } from './nordic-button';

interface DualQrDisplayProps {
  qr1Url: string; // QR #1 image data URL
  qr2Url: string; // QR #2 image data URL
  qr1LinkUrl?: string; // QR #1 actual link URL
  qr2LinkUrl?: string; // QR #2 actual link URL
  title?: string;
  onClose: () => void;
}

export function DualQrDisplay({ qr1Url, qr2Url, qr1LinkUrl, qr2LinkUrl, title, onClose }: DualQrDisplayProps) {
  const [copiedQr1, setCopiedQr1] = useState(false);
  const [copiedQr2, setCopiedQr2] = useState(false);
  const [copiedUrl1, setCopiedUrl1] = useState(false);
  const [copiedUrl2, setCopiedUrl2] = useState(false);

  const downloadQr = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`${filename} lastet ned`);
  };

  const shareQr = async (dataUrl: string, qrNumber: string) => {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `qr-${qrNumber}.png`, { type: 'image/png' });
      
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `QR ${qrNumber}`,
        });
        toast.success('QR-kode delt');
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob
          })
        ]);
        toast.success('QR-kode kopiert til utklippstavle');
      }
    } catch (error) {
      console.error('Share failed:', error);
      toast.error('Kunne ikke dele QR-kode');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <SoftCard className="relative">
          {/* Header */}
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ 
                background: 'linear-gradient(135deg, #5D8CC9, #E8927E)',
              }}
            >
              <Shield className="size-8 text-white" />
            </div>
            <h2 className="text-[#3F3F3F] mb-2">
              To QR-koder generert – Secure Mode
            </h2>
            {title && (
              <p className="text-[#5B5B5B] text-sm mb-2">{title}</p>
            )}
            <p className="text-[#E8927E] text-sm">
              Begge QR-kodene må skannes for å åpne filen
            </p>
          </div>

          {/* Two QR Codes Side by Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* QR #1 - Access Code */}
            <div 
              className="rounded-2xl p-6 border-2"
              style={{ 
                backgroundColor: '#E2EFFA',
                borderColor: '#5D8CC9'
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#5D8CC9] flex items-center justify-center">
                  <span className="text-white">1</span>
                </div>
                <div>
                  <h3 className="text-[#3F3F3F]">QR #1 – Tilgangskode</h3>
                  <p className="text-[#5B5B5B] text-xs">Del denne koden</p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 mb-4">
                <img 
                  src={qr1Url} 
                  alt="QR Code 1"
                  className="w-full h-auto"
                />
              </div>

              <p className="text-[#5B5B5B] text-sm mb-4">
                Denne QR-koden gir tilgang til filen. Del den med mottakeren.
              </p>

              {qr1LinkUrl && (
                <div 
                  className="rounded-lg p-3 mb-4 text-xs break-all"
                  style={{ 
                    backgroundColor: 'rgba(93, 140, 201, 0.1)',
                    border: '1px solid rgba(93, 140, 201, 0.2)'
                  }}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[#5B5B5B] flex-1">{qr1LinkUrl}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(qr1LinkUrl);
                        setCopiedUrl1(true);
                        setTimeout(() => setCopiedUrl1(false), 2000);
                        toast.success('URL kopiert!');
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
              )}

              <div className="flex gap-2">
                <NordicButton
                  variant="blue"
                  size="sm"
                  onClick={() => downloadQr(qr1Url, 'qr-1-access.png')}
                  className="flex-1"
                >
                  <Download className="size-4 mr-2" />
                  Last ned
                </NordicButton>
                <NordicButton
                  variant="blue"
                  size="sm"
                  onClick={() => shareQr(qr1Url, '1')}
                  className="flex-1"
                >
                  <Share2 className="size-4 mr-2" />
                  Del
                </NordicButton>
              </div>
            </div>

            {/* QR #2 - Unlock Code */}
            <div 
              className="rounded-2xl p-6 border-2"
              style={{ 
                backgroundColor: '#F5E5E1',
                borderColor: '#E8927E'
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#E8927E] flex items-center justify-center">
                  <Key className="size-4 text-white" />
                </div>
                <div>
                  <h3 className="text-[#3F3F3F]">QR #2 – Opplåsingskode</h3>
                  <p className="text-[#5B5B5B] text-xs">Nøkkel for å låse opp</p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 mb-4 relative">
                <img 
                  src={qr2Url} 
                  alt="QR Code 2"
                  className="w-full h-auto"
                />
                {/* Lock overlay indicator */}
                <div className="absolute top-6 right-6 w-10 h-10 rounded-lg bg-[#E8927E] flex items-center justify-center shadow-lg">
                  <Shield className="size-5 text-white" />
                </div>
              </div>

              <p className="text-[#5B5B5B] text-sm mb-4">
                Denne koden låser opp filen. Må skannes for å åpne innholdet.
              </p>

              {qr2LinkUrl && (
                <div 
                  className="rounded-lg p-3 mb-4 text-xs break-all"
                  style={{ 
                    backgroundColor: 'rgba(232, 146, 126, 0.1)',
                    border: '1px solid rgba(232, 146, 126, 0.2)'
                  }}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[#5B5B5B] flex-1">{qr2LinkUrl}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(qr2LinkUrl);
                        setCopiedUrl2(true);
                        setTimeout(() => setCopiedUrl2(false), 2000);
                        toast.success('URL kopiert!');
                      }}
                      className="flex-shrink-0 p-1 rounded hover:bg-white/50 transition-colors"
                    >
                      {copiedUrl2 ? (
                        <Check className="size-4 text-green-600" />
                      ) : (
                        <Copy className="size-4 text-[#E8927E]" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <NordicButton
                  variant="coral"
                  size="sm"
                  onClick={() => downloadQr(qr2Url, 'qr-2-unlock.png')}
                  className="flex-1"
                >
                  <Download className="size-4 mr-2" />
                  Last ned
                </NordicButton>
                <NordicButton
                  variant="coral"
                  size="sm"
                  onClick={() => shareQr(qr2Url, '2')}
                  className="flex-1"
                >
                  <Share2 className="size-4 mr-2" />
                  Del
                </NordicButton>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <NordicButton
              variant="blue"
              onClick={() => {
                downloadQr(qr1Url, 'qr-1-access.png');
                setTimeout(() => downloadQr(qr2Url, 'qr-2-unlock.png'), 200);
                toast.success('Begge QR-koder lastet ned!');
              }}
              className="flex items-center justify-center gap-2"
            >
              <Download className="size-4" />
              Last ned begge
            </NordicButton>
            
            <NordicButton
              variant="blue"
              onClick={() => shareQr(qr1Url, '1')}
              className="flex items-center justify-center gap-2"
            >
              <Share2 className="size-4" />
              Del QR #1
            </NordicButton>
            
            <NordicButton
              variant="blue"
              onClick={() => {
                const url = qr1LinkUrl || '';
                if (url) {
                  navigator.clipboard.writeText(url);
                  toast.success('QR#1 lenke kopiert!');
                } else {
                  toast.error('URL ikke tilgjengelig');
                }
              }}
              className="flex items-center justify-center gap-2"
            >
              <Link2 className="size-4" />
              QR#1 lenke
            </NordicButton>
          </div>

          {/* Close Button */}
          <div className="text-center">
            <NordicButton
              variant="blue"
              onClick={onClose}
              className="min-w-[200px]"
            >
              Ferdig
            </NordicButton>
            <p className="text-[#5B5B5B] text-xs mt-3">
              Filen slettes automatisk når den er åpnet
            </p>
          </div>
        </SoftCard>
      </div>
    </div>
  );
}