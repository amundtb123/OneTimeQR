import { useEffect, useRef, useState } from 'react';
import { X, Scan } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeScanType } from 'html5-qrcode';

interface QrScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
  qrNumber?: '1' | '2'; // Which QR code to scan (1 = access code, 2 = unlock code)
}

export function QrScanner({ onScan, onClose, qrNumber = '2' }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('📷 [QR SCANNER] Component mounted, starting scanner...');
    startScanner();
    return () => {
      console.log('📷 [QR SCANNER] Component unmounting, stopping scanner...');
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    try {
      console.log('📷 [QR SCANNER] Starting scanner...');
      console.log('📷 [QR SCANNER] Target element ID: qr-reader');
      
      // Detect if mobile device
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      console.log('📷 [QR SCANNER] Device type:', isMobile ? 'Mobile' : 'Desktop');
      
      // Create scanner instance
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      console.log('📷 [QR SCANNER] Scanner instance created');

      // Optimize settings for mobile vs desktop
      // Mobile needs larger scanning area and higher FPS for better detection
      const qrboxSize = isMobile ? { width: 300, height: 300 } : { width: 250, height: 250 };
      const fps = isMobile ? 20 : 10; // Higher FPS on mobile for better detection
      
      console.log('📷 [QR SCANNER] Scanner config:', { qrboxSize, fps, isMobile });

      // Start scanning
      console.log('📷 [QR SCANNER] Starting camera...');
      await scanner.start(
        { facingMode: 'environment' }, // Use back camera
        {
          fps: fps,
          qrbox: qrboxSize,
          aspectRatio: 1.0,
          // Additional mobile optimizations
          ...(isMobile && {
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          })
        },
        (decodedText) => {
          // Success callback
          console.log('✅ [QR SCANNER] QR code detected:', decodedText);
          console.log('✅ [QR SCANNER] Calling onScan callback...');
          stopScanner();
          try {
            onScan(decodedText);
            console.log('✅ [QR SCANNER] onScan callback completed');
          } catch (error) {
            console.error('❌ [QR SCANNER] Error in onScan callback:', error);
          }
        },
        (errorMessage) => {
          // Error callback (fires continuously, but log first few to see what's happening)
          // Log more frequently on mobile to help debug
          const logFrequency = isMobile ? 0.05 : 0.01; // Log 5% on mobile, 1% on desktop
          if (Math.random() < logFrequency) {
            console.log('📷 [QR SCANNER] Scanning error (sample):', errorMessage.substring(0, 100));
          }
        }
      );

      console.log('✅ [QR SCANNER] Camera started successfully');
      setIsScanning(true);
    } catch (err: any) {
      console.error('❌ [QR SCANNER] Error starting scanner:', err);
      console.error('❌ [QR SCANNER] Error details:', {
        name: err?.name,
        message: err?.message,
        stack: err?.stack?.substring(0, 200)
      });
      setError('Kunne ikke starte kamera. Sjekk tillatelser.');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      console.log('🛑 [QR SCANNER] Stopping scanner...');
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        console.log('✅ [QR SCANNER] Scanner stopped successfully');
      } catch (err) {
        console.error('❌ [QR SCANNER] Error stopping scanner:', err);
      }
      scannerRef.current = null;
    } else {
      console.log('📷 [QR SCANNER] No scanner instance to stop');
    }
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 z-10 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
      >
        <X className="size-6" />
      </button>

      {/* Instructions */}
      <div className="absolute top-8 left-0 right-0 text-center px-4 z-10">
        <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/90 backdrop-blur-sm">
          <Scan className="size-5 text-[#5D8CC9]" />
          <span className="text-[#3F3F3F] font-medium">
            {qrNumber === '1' 
              ? 'Skann QR #1 (tilgangskode)'
              : 'Skann QR #2 (opplåsingskode)'
            }
          </span>
        </div>
      </div>

      {/* Scanner container */}
      <div className="w-full max-w-md px-4">
        <div id="qr-reader" className="rounded-2xl overflow-hidden shadow-2xl" />
      </div>

      {/* Error message */}
      {error && (
        <div className="absolute bottom-20 left-4 right-4 text-center">
          <div className="inline-block px-6 py-3 rounded-xl bg-red-500/90 text-white backdrop-blur-sm">
            {error}
          </div>
        </div>
      )}

      {/* Help text */}
      <div className="absolute bottom-8 left-0 right-0 text-center px-4">
        <p className="text-white/70 text-sm">
          Hold QR-koden stabilt foran kameraet
        </p>
      </div>
    </div>
  );
}
