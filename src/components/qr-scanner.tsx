import { useEffect, useRef, useState } from 'react';
import { X, Camera, Scan } from 'lucide-react';
import { NordicButton } from './nordic-button';
import jsQR from 'jsqr';

interface QrScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      // Request camera access with higher resolution
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready before scanning
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsScanning(true);
          // Give it a moment to stabilize
          setTimeout(() => {
            scanQrCode();
          }, 500);
        };
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Kunne ikke få tilgang til kamera. Sjekk tillatelser.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const scanQrCode = () => {
    if (!videoRef.current || !canvasRef.current) {
      console.error('Video or canvas ref not available');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      console.error('Could not get canvas context');
      return;
    }

    const scan = () => {
      if (!video || !canvas || !context) {
        return;
      }

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Update canvas size if video dimensions changed
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          console.log(`Canvas resized to ${canvas.width}x${canvas.height}`);
        }

        // Draw current video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get image data from canvas
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        // Try to decode QR code with multiple attempts
        try {
          // Try with default settings first
          let code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth', // Try both normal and inverted
          });

          if (code && code.data) {
            console.log('✅ QR code detected:', code.data);
            stopCamera();
            onScan(code.data);
            return;
          }
        } catch (err) {
          // Silent fail, continue scanning
        }
      }

      // Continue scanning
      animationRef.current = requestAnimationFrame(scan);
    };

    // Start the scanning loop
    scan();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {/* Close button */}
      <button
        onClick={() => {
          stopCamera();
          onClose();
        }}
        className="absolute top-4 right-4 z-10 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
      >
        <X className="size-6" />
      </button>

      {/* Camera view */}
      <div className="relative w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Hidden canvas for QR detection */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Scanning overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Dimmed overlay */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Scanning frame */}
          <div className="relative w-72 h-72 md:w-96 md:h-96">
            {/* Corner markers */}
            <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white rounded-tl-2xl" />
            <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white rounded-bl-2xl" />
            <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white rounded-br-2xl" />

            {/* Scanning line animation */}
            {isScanning && (
              <div
                className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white to-transparent"
                style={{
                  animation: 'scan 2s ease-in-out infinite',
                }}
              />
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="absolute bottom-8 left-0 right-0 text-center px-4">
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/90 backdrop-blur-sm">
            <Scan className="size-5 text-[#5D8CC9]" />
            <span className="text-[#3F3F3F] font-medium">
              Plasser QR-koden innenfor rammen
            </span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="absolute top-20 left-4 right-4 text-center">
            <div className="inline-block px-6 py-3 rounded-xl bg-red-500/90 text-white backdrop-blur-sm">
              {error}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% {
            top: 0;
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            top: 100%;
          }
        }
      `}</style>
    </div>
  );
}