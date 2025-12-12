import { useEffect, useRef, useState } from 'react';
import { X, Scan } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
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
      
      // Create scanner instance
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      console.log('📷 [QR SCANNER] Scanner instance created');

      // Start scanning
      console.log('📷 [QR SCANNER] Starting camera...');
      await scanner.start(
        { facingMode: 'environment' }, // Use back camera
        {
          fps: 10, // Frames per second
          qrbox: { width: 250, height: 250 }, // Scanning box size
          aspectRatio: 1.0,
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
          // Only log occasionally to avoid spam
          if (Math.random() < 0.01) { // Log ~1% of errors
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
            Skann QR #2 (opplåsingskode)
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
