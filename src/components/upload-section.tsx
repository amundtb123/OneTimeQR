import { useState, useEffect } from 'react';
import { Upload, X, Plus, Image, FileText, LinkIcon, Clock, Shield, Eye, Lock, Info, ChevronDown, Crown, EyeOff, Key } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { useTranslation } from 'react-i18next';
import type { QrDrop } from '../App';
import { uploadFile, createQrDrop } from '../utils/api-client';
import { generateStyledQrCode } from '../utils/qr-generator';
import { createBrandedQrCode } from '../utils/qr-with-branding';
import { 
  generateEncryptionKey, 
  encryptData, 
  encryptFile, 
  createDecryptionKeyUrl,
  splitKey,
  encryptTextWithSplitKey,
  encryptFileWithSplitKey,
  createQr1Url,
  createQr2Url
} from '../utils/encryption';
import { SoftCard } from './soft-card';
import { NordicButton } from './nordic-button';
import { NordicLogo } from './nordic-logo';
import { DualQrDisplay } from './dual-qr-display';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Checkbox } from './ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { QrStylePicker, type QrStyle } from './qr-style-picker';
import { useAuth } from '../utils/auth-context';
import { deductCoins } from '../utils/api-client';
import { CoinShop } from './coin-shop';

const defaultQrStyle: QrStyle = {
  dotsColor: '#5D8CC9',
  backgroundColor: '#000000',
  gradientType: 'none',
  dotsType: 'rounded',
  cornersSquareType: 'extra-rounded',
  cornersDotType: 'dot',
  logoSize: 0.2,
  logoMargin: 4,
};

interface UploadSectionProps {
  onQrCreated: (qrDrop: QrDrop) => void;
}

export function UploadSection({ onQrCreated }: UploadSectionProps) {
  const { user, coins, refreshCoins } = useAuth();
  const { t } = useTranslation();
  
  // Title
  const [title, setTitle] = useState('');
  
  // Files state (multiple files)
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<{ [key: string]: string }>({});
  
  // Text state (200 chars max)
  const [textContent, setTextContent] = useState('');
  
  // URLs state (multiple URLs)
  const [urls, setUrls] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  
  // Common settings
  const [expiryType, setExpiryType] = useState('10m');
  const [maxScans, setMaxScans] = useState<string>('');
  const [maxDownloads, setMaxDownloads] = useState<string>('');
  const [viewOnly, setViewOnly] = useState(false);
  const [noPreview, setNoPreview] = useState(false);
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [qrStyle, setQrStyle] = useState<QrStyle>(defaultQrStyle);
  const [secureMode, setSecureMode] = useState(false);
  const [showDualQr, setShowDualQr] = useState(false);
  const [dualQrData, setDualQrData] = useState<{ qr1: string; qr2: string; qr1Url: string; qr2Url: string; title?: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleFilesChange = (selectedFiles: File[]) => {
    if (selectedFiles.length > 0) {
      // Add new files to existing files
      const newFiles = [...files, ...selectedFiles];
      setFiles(newFiles);
      
      // Create previews for image files
      selectedFiles.forEach((file) => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setPreviewUrls(prev => ({
              ...prev,
              [file.name]: reader.result as string
            }));
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    handleFilesChange(selectedFiles);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      handleFilesChange(droppedFiles);
    }
  };

  const removeFile = (index: number) => {
    const fileToRemove = files[index];
    setFiles(files.filter((_, i) => i !== index));
    
    // Remove preview if exists
    if (previewUrls[fileToRemove.name]) {
      setPreviewUrls(prev => {
        const newPreviews = { ...prev };
        delete newPreviews[fileToRemove.name];
        return newPreviews;
      });
    }
  };

  const addUrl = () => {
    const trimmedUrl = currentUrl.trim();
    if (trimmedUrl && trimmedUrl.length > 0) {
      // Basic URL validation
      try {
        new URL(trimmedUrl);
        setUrls([...urls, trimmedUrl]);
        setCurrentUrl('');
      } catch {
        toast.error(t('upload.invalidUrl'));
      }
    }
  };

  const removeUrl = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index));
  };

  // Prevent default browser behavior for drag and drop (opening files)
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', handleGlobalDrop);

    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver);
      window.removeEventListener('drop', handleGlobalDrop);
    };
  }, []);

  const expiryOptions = user ? [
    { value: '10m', label: t('upload.expiry10m'), icon: Clock },
    { value: '30m', label: t('upload.expiry30m'), icon: Clock },
    { value: '1h', label: t('upload.expiry1h'), icon: Clock },
    { value: '24h', label: t('upload.expiry24h'), icon: Clock },
    { value: '7d', label: t('upload.expiry7d'), icon: Clock, isPro: true },
    { value: 'scan', label: t('upload.expiryScan'), icon: Eye, isPro: true },
  ] : [
    { value: '10m', label: t('upload.expiry10m'), icon: Clock },
  ];

  const calculateExpiryDate = (type: string): Date | undefined => {
    const now = new Date();
    switch (type) {
      case '10m':
        return new Date(now.getTime() + 10 * 60 * 1000);
      case '30m':
        return new Date(now.getTime() + 30 * 60 * 1000);
      case '1h':
        return new Date(now.getTime() + 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'scan':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      default:
        return undefined;
    }
  };

  const hasContent = () => {
    if (files.length > 0) return true;
    if (textContent.trim().length > 0) return true;
    if (urls.length > 0) return true;
    return false;
  };

  // Calculate coin cost based on user choices
  const calculateCoinCost = (): number => {
    // Free tier: 1 MB, 10 minutes, no password
    const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);
    const freeSizeLimit = 1 * 1024 * 1024; // 1 MB
    const freeExpiryMinutes = 10;
    
    let cost = 0;
    
    // Check if password is used (+1 coin)
    if (usePassword) {
      cost += 1;
    }
    
    // Check file size beyond free limit (+1 coin per 2 MB extra)
    if (totalFileSize > freeSizeLimit) {
      const extraMB = (totalFileSize - freeSizeLimit) / (2 * 1024 * 1024);
      cost += Math.ceil(extraMB);
    }
    
    // Check expiry beyond 10 minutes (+1 coin per 24 hours extra)
    if (expiryType !== '10m') {
      const expiryMinutes = {
        '30m': 30,
        '1h': 60,
        '24h': 24 * 60,
        '7d': 7 * 24 * 60,
        'scan': 7 * 24 * 60, // Treat as 7 days
      }[expiryType] || 10;
      
      if (expiryMinutes > freeExpiryMinutes) {
        const extraHours = (expiryMinutes - freeExpiryMinutes) / 60;
        const extra24HourPeriods = extraHours / 24;
        cost += Math.ceil(extra24HourPeriods);
      }
    }
    
    return cost;
  };

  const coinCost = calculateCoinCost();
  const isFreeTier = coinCost === 0;

  const handleGenerateQr = async () => {
    console.log('🔵 handleGenerateQr called', { coinCost, isFreeTier, user: !!user, coins, hasContent: hasContent() });
    
    if (!hasContent()) {
      toast.error(t('upload.addContent'));
      return;
    }

    // Check if terms of use are accepted
    if (!acceptedTerms) {
      toast.error(t('upload.mustAcceptTerms'));
      return;
    }

    // Check file size limits based on login status
    const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxSize = user ? 20 * 1024 * 1024 : 1 * 1024 * 1024; // 20 MB logged in, 1 MB not logged in
    
    if (totalFileSize > maxSize) {
      const maxSizeMB = user ? '20 MB' : '1 MB';
      const loginPrompt = !user ? t('upload.loginPrompt') : '';
      toast.error(t('upload.fileSizeExceeded', { maxSize: maxSizeMB, loginPrompt }));
      return;
    }

    // Check if Secure Mode requires login
    if (secureMode && !user) {
      toast.error(t('upload.secureModeRequiresLogin'));
      return;
    }

    // Check coin cost and user balance
    // Only check coins if cost > 0 (premium features)
    // Free tier (coinCost === 0) should work for everyone, logged in or not
    if (coinCost > 0) {
      if (!user) {
        toast.error(t('upload.loginRequiredForCoins'));
        return;
      }
      
      // Only check coins if user is logged in and cost > 0
      if (coins === null || coins === undefined) {
        toast.error(t('upload.loadingCoins'));
        return;
      }
      
      if (coins < coinCost) {
        toast.error(t('upload.insufficientCoins', { required: coinCost, current: coins }));
        return;
      }
    }
    
    console.log('✅ All checks passed, generating QR...');
    setIsGenerating(true);
    
    try {
      const expiryDate = calculateExpiryDate(expiryType);
      
      // SECURE MODE: Use split-key encryption (zero-knowledge)
      // For secureMode: Generate split keys (k1, k2) where master = k1 XOR k2
      // Server never sees the keys - only ciphertext
      let splitKeys: { k1: string; k2: string; master: Uint8Array } | undefined;
      let encryptedTextContent: { iv: string; salt: string; ciphertext: string } | undefined;
      let encryptedUrlContent: { iv: string; salt: string; ciphertext: string } | undefined;
      
      // CRITICAL SECURITY: Generate encryption key for ALL files (not just secureMode)
      // This ensures files are never stored unencrypted in Supabase Storage
      const encryptionKeyForFiles = await generateEncryptionKey();
      
      // CRITICAL FIX: Generate QR drop ID on client side FIRST for Secure Mode
      // This ensures we can encrypt with the actual ID that will be used for decryption
      // The server will use this ID if provided, or generate a new one if not
      const clientGeneratedId = secureMode ? crypto.randomUUID() : undefined;
      
      if (secureMode) {
        // Generate split keys for zero-knowledge encryption
        splitKeys = await splitKey();
        
        if (!clientGeneratedId) {
          throw new Error('Failed to generate QR drop ID for Secure Mode encryption');
        }
        
        console.log('🔐 [UPLOAD] Using client-generated ID for encryption:', clientGeneratedId);
        
        // Encrypt text content with split-key master (using actual ID)
        if (textContent.trim()) {
          encryptedTextContent = await encryptTextWithSplitKey(textContent.trim(), splitKeys.master, clientGeneratedId);
          console.log('✅ [UPLOAD] Encrypted textContent with ID:', clientGeneratedId);
        }
        
        // Encrypt URL content with split-key master (using actual ID)
        if (urls.length > 0) {
          const urlJson = JSON.stringify(urls);
          encryptedUrlContent = await encryptTextWithSplitKey(urlJson, splitKeys.master, clientGeneratedId);
          console.log('✅ [UPLOAD] Encrypted urlContent with ID:', clientGeneratedId);
        }
      }
      
      // Generate QR code FIRST (before sending to backend)
      const tempId = crypto.randomUUID();
      
      // Don't generate the actual QR image yet - we'll do that on-demand with access tokens
      // This is a placeholder QR code just for initial display
      const qrUrl = `${window.location.origin}/scan/${tempId}`;
      const qrCodeDataUrl = await generateStyledQrCode(qrUrl, qrStyle);
      const brandedQrCode = await createBrandedQrCode(qrCodeDataUrl);
      
      // Store original file types in metadata (before encryption)
      // Files will be encrypted and uploaded as application/octet-stream, but we need original types
      const originalFileTypes: Record<string, string> = {};
      files.forEach((file, index) => {
        originalFileTypes[index === 0 ? 'file' : `file${index}`] = file.type;
      });
      
      // SECURITY: For secureMode, ciphertext is sent separately (not in metadata)
      // This prevents metadata from exceeding 10 KB limit and keeps ciphertext out of metadata
      const metadata = {
        title: title.trim() || undefined,
        contentType: 'bundle' as const, // New type for mixed content
        // For secureMode: DON'T include ciphertext in metadata (sent separately)
        // For standard: send plain text
        textContent: secureMode 
          ? undefined // Ciphertext sent separately for secureMode
          : (textContent.trim() || undefined),
        urlContent: secureMode
          ? undefined // Ciphertext sent separately for secureMode
          : (urls.length > 0 ? JSON.stringify(urls) : undefined),
        expiryType,
        expiryDate: expiryDate ? expiryDate.toISOString() : undefined, // Convert Date to ISO string for JSON
        maxScans: maxScans ? parseInt(maxScans) : undefined,
        maxDownloads: maxDownloads ? parseInt(maxDownloads) : undefined,
        viewOnly,
        noPreview,
        password: usePassword ? password : undefined,
        qrStyle, // Store QR styling preferences
        // NOTE: qrCodeDataUrl is NOT sent in metadata (too large - 30-50 KB)
        // QR code is generated on-demand when needed
        secureMode, // Flag to indicate Secure Mode (split-key zero-knowledge)
        encrypted: true, // ALL files are now encrypted
        // For secureMode: NO encryption key stored (zero-knowledge)
        // For standard: store encryption key for file decryption
        encryptionKey: secureMode ? undefined : encryptionKeyForFiles,
        originalFileTypes, // Store original file types for proper decryption
      };
      
      // For secureMode: Prepare ciphertext as separate fields (not in metadata)
      const secureModeCiphertext = secureMode ? {
        textContentCiphertext: encryptedTextContent ? JSON.stringify(encryptedTextContent) : undefined,
        urlContentCiphertext: encryptedUrlContent ? JSON.stringify(encryptedUrlContent) : undefined,
        // CRITICAL: Send client-generated ID so server uses it
        clientId: clientGeneratedId,
      } : undefined;
      
      // Log metadata size for debugging
      const metadataSize = JSON.stringify(metadata).length;
      console.log(`📋 Metadata prepared, size: ${metadataSize} bytes`);
      if (metadataSize > 10 * 1024) {
        const keys = Object.keys(metadata);
        const sizes = keys.map(key => ({
          key,
          size: JSON.stringify(metadata[key]).length
        })).sort((a, b) => b.size - a.size);
        console.warn('⚠️ Metadata is large. Top fields:', sizes.slice(0, 5));
      }

      let response;
      
      console.log('📤 Sending to backend...', { hasFiles: files.length > 0, metadataKeys: Object.keys(metadata) });
      
      // If we have files, use upload endpoint
      if (files.length > 0) {
        // CRITICAL SECURITY: Encrypt ALL files before upload
        // For secureMode: Use split-key encryption (zero-knowledge)
        // For standard: Use traditional encryption with server-stored key
        console.log('🔐 Encrypting ALL files before upload for security...');
        
        let filesToUpload: File[];
        let fileEncryptionData: Array<{ iv: string; salt: string; ciphertext: string }> | undefined;
        
        if (secureMode && splitKeys) {
          // SECURE MODE: Encrypt with split-key master (zero-knowledge)
          // Convert master key to hex string for compatibility with existing encryptFile function
          const masterKeyHex = Array.from(splitKeys.master)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          
          // Use existing encryptFile function with master key
          filesToUpload = await Promise.all(
            files.map(async (file) => {
              const encryptedBlob = await encryptFile(file, masterKeyHex);
              return new File([encryptedBlob], file.name, { type: 'application/octet-stream' });
            })
          );
          
          console.log(`✅ Encrypted ${filesToUpload.length} file(s) with split-key master (zero-knowledge)`);
        } else {
          // STANDARD MODE: Encrypt with traditional method (server stores key)
          filesToUpload = await Promise.all(
            files.map(async (file) => {
              const encryptedBlob = await encryptFile(file, encryptionKeyForFiles);
              return new File([encryptedBlob], file.name, { type: 'application/octet-stream' });
            })
          );
          console.log(`✅ Encrypted ${filesToUpload.length} file(s) with standard encryption`);
        }
        
        // Upload all files (now encrypted)
        // For secureMode: Include clientId in metadata so server uses same ID
        const uploadMetadata = secureMode && clientGeneratedId
          ? { ...metadata, clientId: clientGeneratedId }
          : metadata;
        console.log(`📁 Uploading ${filesToUpload.length} encrypted file(s):`, files.map(f => f.name).join(', '));
        response = await uploadFile(filesToUpload, uploadMetadata);
        console.log('✅ Upload response:', response);
      } else {
        // No files, just text/URLs
        console.log('📝 Creating QR drop without file');
        try {
          // For secureMode: Include ciphertext in metadata object (but not counted in metadata size check)
          const createMetadata = secureMode && secureModeCiphertext
            ? {
                ...metadata,
                textContentCiphertext: secureModeCiphertext.textContentCiphertext,
                urlContentCiphertext: secureModeCiphertext.urlContentCiphertext,
                clientId: secureModeCiphertext.clientId, // Send client-generated ID
              }
            : metadata;
          
          // DEBUG: Log what we're sending
          console.log('📤 [UPLOAD] Sending createMetadata:', {
            hasClientId: !!createMetadata.clientId,
            clientIdValue: createMetadata.clientId,
            secureMode: secureMode,
            hasTextContentCiphertext: !!createMetadata.textContentCiphertext,
            hasUrlContentCiphertext: !!createMetadata.urlContentCiphertext,
            metadataKeys: Object.keys(createMetadata).slice(0, 15)
          });
          
          response = await createQrDrop(createMetadata);
          console.log('✅ Create response:', response);
          
          // Verify that server used our client-generated ID
          if (secureMode && clientGeneratedId && response.id !== clientGeneratedId) {
            console.error('❌ [UPLOAD] CRITICAL: Server ID mismatch!');
            console.error('❌ [UPLOAD] Client ID:', clientGeneratedId);
            console.error('❌ [UPLOAD] Server ID:', response.id);
            console.error('❌ [UPLOAD] This will cause decryption to fail!');
            toast.error('Kritisk feil: ID mismatch. Dekryptering vil feile.');
          } else if (secureMode && clientGeneratedId && response.id === clientGeneratedId) {
            console.log('✅ [UPLOAD] Server used client-generated ID - encryption/decryption will match!');
          }
        } catch (createError: any) {
          console.error('❌ createQrDrop failed:', createError);
          console.error('❌ Error details:', {
            message: createError?.message,
            status: createError?.status,
            stack: createError?.stack
          });
          throw createError;
        }
      }
      
      // Deduct coins if cost > 0
      if (coinCost > 0 && user) {
        try {
          await deductCoins(coinCost);
          await refreshCoins();
          toast.success(t('upload.coinsDeducted', { amount: coinCost }));
        } catch (error: any) {
          console.error('Error deducting coins:', error);
          // QR was already created, but coins weren't deducted
          // This is a problem - we should rollback or handle this
          toast.error(t('upload.coinDeductionFailed'));
        }
      }
      
      // SECURE MODE: Generate TWO QR codes with split keys
      if (secureMode && splitKeys) {
        // QR #1: Access code with k1 in URL fragment
        const qr1Url = createQr1Url(window.location.origin, response.id, splitKeys.k1);
        
        // DEBUG: Verify URL format
        console.log('🔍 [DEBUG] QR #1 URL before QR generation:', qr1Url);
        console.log('🔍 [DEBUG] QR #1 URL contains #k1:', qr1Url.includes('#k1='));
        console.log('🔍 [DEBUG] QR #1 URL contains @k1:', qr1Url.includes('@k1='));
        
        const qr1Base = await generateStyledQrCode(qr1Url, qrStyle);
        const qr1Final = await createBrandedQrCode(qr1Base);
        
        // QR #2: Unlock code with k2 in URL fragment
        const qr2Url = createQr2Url(window.location.origin, response.id, splitKeys.k2);
        
        // DEBUG: Verify URL format
        console.log('🔍 [DEBUG] QR #2 URL before QR generation:', qr2Url);
        console.log('🔍 [DEBUG] QR #2 URL contains #k2:', qr2Url.includes('#k2='));
        
        console.log('🔑 QR #1 URL (access):', qr1Url.replace(/#k1=.*/, '#k1=***'));
        console.log('🔑 QR #2 URL (unlock):', qr2Url.replace(/#k2=.*/, '#k2=***'));
        console.log('✅ Split-key encryption: Server never sees keys (zero-knowledge)');
        // Use high contrast (black on white) with standard square corners for maximum scanner readability
        const qr2Base = await generateStyledQrCode(qr2Url, {
          dotsColor: '#000000', // Pure black for maximum contrast
          backgroundColor: '#FFFFFF', // Pure white background
          gradientType: 'none',
          dotsType: 'square', // Standard square dots for reliability
          cornersSquareType: 'square', // Standard square corners - critical for scanner detection
          cornersDotType: 'square', // Standard square center dots
          logoSize: 0.2,
          logoMargin: 4,
        });
        const qr2Final = await createBrandedQrCode(qr2Base);
        
        // Show dual QR display modal
        setDualQrData({
          qr1: qr1Final,
          qr2: qr2Final,
          qr1Url: qr1Url,
          qr2Url: qr2Url,
          title: title.trim() || t('upload.sharedContent')
        });
        setShowDualQr(true);
        
        // Still create QrDrop for list (but don't show single QR)
        const totalSize = files.reduce((sum, file) => sum + file.size, 0) + 
                          (textContent?.length || 0) + 
                          urls.reduce((sum, url) => sum + url.length, 0);

        const newQrDrop: QrDrop = {
          id: response.id,
          title: title.trim() || undefined,
          contentType: 'bundle',
          fileName: title.trim() || 'Delt innhold',
          fileType: 'bundle',
          fileSize: totalSize,
          textContent: textContent.trim() || undefined,
          urlContent: urls.length > 0 ? JSON.stringify(urls) : undefined,
          expiryType,
          expiryDate,
          maxScans: maxScans ? parseInt(maxScans) : undefined,
          maxDownloads: maxDownloads ? parseInt(maxDownloads) : undefined,
          scanCount: 0,
          downloadCount: 0,
          viewOnly,
          password: usePassword ? password : undefined,
          createdAt: new Date(),
          qrCodeUrl: qr1Final, // Store QR #1 as primary
          secureMode: true, // Mark as Secure Mode
          qrCodeUrl2: qr2Final, // Store QR #2
        };

        onQrCreated(newQrDrop);
      } else {
        // STANDARD MODE: Generate single QR code
        const cleanUrl = `${window.location.origin}/scan/${response.id}`;
        
        let finalQrCode: string;
        if (qrStyle) {
          const baseQr = await generateStyledQrCode(cleanUrl, qrStyle);
          finalQrCode = await createBrandedQrCode(baseQr);
        } else {
          const QRCode = (await import('qrcode')).default;
          const baseQr = await QRCode.toDataURL(cleanUrl, {
            width: 400,
            margin: 2,
            color: {
              dark: '#4F46E5',
              light: '#FFFFFF',
            },
          });
          finalQrCode = await createBrandedQrCode(baseQr);
        }

        // Calculate total size
        const totalSize = files.reduce((sum, file) => sum + file.size, 0) + 
                          (textContent?.length || 0) + 
                          urls.reduce((sum, url) => sum + url.length, 0);

        const newQrDrop: QrDrop = {
          id: response.id,
          title: title.trim() || undefined,
          contentType: 'bundle',
          fileName: title.trim() || t('upload.sharedContent'),
          fileType: 'bundle',
          fileSize: totalSize,
          textContent: textContent.trim() || undefined,
          urlContent: urls.length > 0 ? JSON.stringify(urls) : undefined,
          expiryType,
          expiryDate,
          maxScans: maxScans ? parseInt(maxScans) : undefined,
          maxDownloads: maxDownloads ? parseInt(maxDownloads) : undefined,
          scanCount: 0,
          downloadCount: 0,
          viewOnly,
          password: usePassword ? password : undefined,
          createdAt: new Date(),
          qrCodeUrl: finalQrCode,
        };

        onQrCreated(newQrDrop);
      }
      
      // Reset form
      setTitle('');
      setFiles([]);
      setPreviewUrls({});
      setTextContent('');
      setUrls([]);
      setCurrentUrl('');
      setExpiryType('10m');
      setMaxScans('');
      setMaxDownloads('');
      setViewOnly(false);
      setNoPreview(false);
      setPassword('');
      setUsePassword(false);
      setQrStyle(defaultQrStyle);
    } catch (error: any) {
      console.error('❌ Error creating QR drop:', error);
      console.error('Error details:', {
        message: error?.message,
        status: error?.status,
        stack: error?.stack
      });

      if (error?.status === 401) {
        toast.error(t('upload.mustBeLoggedIn'));
      } else {
        const errorMessage = error?.message || t('upload.createQrError');
        toast.error(errorMessage);
        console.error('Full error object:', error);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-32">
      
      {/* Coin Shop - Show for authenticated users */}
      {user && <CoinShop />}
      
      {/* Show info if user is not authenticated */}
      {!user && (
        <SoftCard className="text-center py-8">
          <h3 className="text-[#3F3F3F] mb-2">{t('upload.getStarted')}</h3>
          <p className="text-[#5B5B5B] mb-4" dangerouslySetInnerHTML={{ __html: t('upload.freeLimit') }} />
          <p className="text-[#4A6FA5] text-sm">
            {t('upload.loginPrompt')}
          </p>
        </SoftCard>
      )}
      
      {/* Main Upload Card */}
      <SoftCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-[#E2EFFA] p-3 rounded-xl border border-[#D5C5BD]">
            <Upload className="size-5 text-[#4A6FA5]" />
          </div>
          <div className="flex-1">
            <h2 className="text-[#3F3F3F]">{t('upload.shareContent')}</h2>
          </div>
        </div>

        {/* Title Field - First and optional */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[#3F3F3F]">{t('upload.title')}</span>
          </div>
          <Input
            type="text"
            placeholder={t('upload.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl border-[#D5C5BD] bg-[#E8DCD4] text-[#3F3F3F]"
          />
        </div>

        {/* Content Type Selection - Always visible */}
        <div className="mb-6">
          {/* File Upload Section */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Image className="size-4 text-[#4A6FA5]" />
              <span className="text-[#3F3F3F]">{t('upload.files')}</span>
            </div>
            
            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-2 mb-3">
                {files.map((file, index) => (
                  <div 
                    key={`${file.name}-${index}`}
                    className="border rounded-xl p-3"
                    style={{ 
                      backgroundColor: '#E8DCD4',
                      borderColor: '#D5C5BD'
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {previewUrls[file.name] ? (
                        <img src={previewUrls[file.name]} alt={file.name} className="w-12 h-12 object-cover rounded-lg border border-[#D5C5BD]" />
                      ) : (
                        <div className="w-12 h-12 bg-[#E1C7BA] rounded-lg flex items-center justify-center border border-[#D5C5BD]">
                          <Upload className="size-6 text-[#5B5B5B]" />
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-[#3F3F3F] truncate text-sm">{file.name}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[#5B5B5B] text-xs">{formatFileSize(file.size)}</p>
                          {file.size > 1 * 1024 * 1024 && (() => {
                            const extraMB = (file.size - 1 * 1024 * 1024) / (2 * 1024 * 1024);
                            const coinCostForFile = Math.ceil(extraMB);
                            return coinCostForFile > 0 ? (
                              <span className="text-xs text-indigo-600 font-medium">+{coinCostForFile} coin{coinCostForFile > 1 ? 's' : ''}</span>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => removeFile(index)}
                        className="p-2 text-[#5B5B5B] hover:bg-white/50 rounded-lg transition-colors"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add file button with drag'n drop */}
            <label className="block">
              <input
                type="file"
                onChange={handleFileInputChange}
                className="hidden"
                accept="image/*,video/*,application/pdf,.doc,.docx,.txt"
                multiple
              />
              <div 
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
                  isDragging 
                    ? 'border-[#5D8CC9] bg-[#E2EFFA] scale-105' 
                    : 'hover:border-[#5D8CC9] hover:bg-[#F7F2EE]'
                }`}
                style={{ borderColor: isDragging ? '#5D8CC9' : '#D5C5BD' }}
              >
                <Upload className={`size-12 text-[#5B5B5B] mx-auto mb-4 ${isDragging ? 'text-[#5D8CC9]' : ''}`} />
                <p className="text-[#3F3F3F] text-base mb-2 font-medium">{t('upload.addFiles')}</p>
                <p className="text-[#5B5B5B] text-sm mb-2">{t('upload.fileTypes')}</p>
                <p className="text-[#5B5B5B] text-xs">{t('upload.dragDropHint') || 'Eller dra og slipp filer her'}</p>
              </div>
            </label>
          </div>

          {/* Text Input Section */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="size-4 text-[#4A6FA5]" />
              <span className="text-[#3F3F3F]">{t('upload.text')}</span>
            </div>
            
            <Textarea
              placeholder={t('upload.textPlaceholder')}
              value={textContent}
              onChange={(e) => {
                if (e.target.value.length <= 200) {
                  setTextContent(e.target.value);
                }
              }}
              className="rounded-xl border-[#D5C5BD] bg-[#E8DCD4] text-[#3F3F3F] min-h-[80px]"
              maxLength={200}
            />
          </div>

          {/* URL Input Section */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <LinkIcon className="size-4 text-[#4A6FA5]" />
              <span className="text-[#3F3F3F]">{t('upload.urls')}</span>
            </div>
            
            {/* URL list */}
            {urls.length > 0 && (
              <div className="space-y-2 mb-3">
                {urls.map((url, index) => (
                  <div 
                    key={`${url}-${index}`}
                    className="border rounded-xl p-3"
                    style={{ 
                      backgroundColor: '#E8DCD4',
                      borderColor: '#D5C5BD'
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <LinkIcon className="size-4 text-[#4A6FA5] flex-shrink-0" />
                      <p className="text-[#3F3F3F] text-sm break-all flex-1">{url}</p>
                      <button
                        onClick={() => removeUrl(index)}
                        className="p-2 text-[#5B5B5B] hover:bg-white/50 rounded-lg transition-colors"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add URL input */}
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder={t('upload.urlPlaceholder')}
                value={currentUrl}
                onChange={(e) => setCurrentUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addUrl()}
                className="rounded-xl border-[#D5C5BD] bg-[#E8DCD4] text-[#3F3F3F] flex-1"
              />
              <button
                onClick={addUrl}
                className="px-4 py-2 bg-[#5D8CC9] text-white rounded-xl hover:bg-[#4A6FA5] transition-colors"
              >
                <Plus className="size-5" />
              </button>
            </div>
          </div>
        </div>
      </SoftCard>

      {/* Settings Card - Show only when content is selected */}
      {hasContent() && (
        <>
          <SoftCard>
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-[#E2EFFA] p-3 rounded-xl border border-[#D5C5BD]">
                <Clock className="size-5 text-[#4A6FA5]" />
              </div>
              <div>
                <h2 className="text-[#3F3F3F]">{t('upload.expiryTitle')}</h2>
                <p className="text-[#5B5B5B] text-sm">{t('upload.expirySubtitle')}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {expiryOptions.map((option) => {
                const isPro = option.isPro || false;
                // Calculate coin cost for this expiry option
                const expiryMinutes = {
                  '10m': 10,
                  '30m': 30,
                  '1h': 60,
                  '24h': 24 * 60,
                  '7d': 7 * 24 * 60,
                  'scan': 7 * 24 * 60,
                }[option.value] || 10;
                const freeExpiryMinutes = 10;
                const extraHours = expiryMinutes > freeExpiryMinutes ? (expiryMinutes - freeExpiryMinutes) / 60 : 0;
                const extra24HourPeriods = extraHours / 24;
                const coinCostForExpiry = expiryMinutes > freeExpiryMinutes ? Math.ceil(extra24HourPeriods) : 0;
                
                return (
                  <button
                    key={option.value}
                    onClick={() => setExpiryType(option.value)}
                    className={`p-4 rounded-xl border-2 transition-all relative ${
                      expiryType === option.value
                        ? 'bg-[#5D8CC9] text-white border-[#4A6FA5]'
                        : 'bg-[#E8DCD4] text-[#3F3F3F] border-[#D5C5BD] hover:bg-[#E1C7BA]'
                    } ${isPro ? 'opacity-75' : ''}`}
                    style={{
                      boxShadow: expiryType === option.value 
                        ? '0 4px 12px rgba(93, 140, 201, 0.25)' 
                        : 'none',
                    }}
                  >
                    {isPro && (
                      <div className="absolute top-1 right-1">
                        <Crown className="size-3 text-[#E8927E]" />
                      </div>
                    )}
                    <option.icon className="size-5 mx-auto mb-2" />
                    <p className="text-sm">{option.label}</p>
                    {coinCostForExpiry > 0 && (
                      <p className={`text-xs mt-1 ${expiryType === option.value ? 'text-white/90' : 'text-indigo-600'}`}>
                        +{coinCostForExpiry} coin{coinCostForExpiry > 1 ? 's' : ''}
                      </p>
                    )}
                    {isPro && coinCostForExpiry === 0 && (
                      <p className="text-xs mt-1 opacity-75">{t('upload.pro')}</p>
                    )}
                  </button>
                );
              })}
            </div>
            
            {!user && (
              <div 
                className="mt-4 p-3 rounded-xl flex items-start gap-2"
                style={{ backgroundColor: '#E2EFFA', borderColor: '#D5C5BD' }}
              >
                <Info className="size-4 text-[#4A6FA5] flex-shrink-0 mt-0.5" />
                <p className="text-[#4A6FA5] text-sm">
                  {t('upload.loginForMore')}
                </p>
              </div>
            )}

            {expiryType === 'scan' && (
              <div 
                className="mt-4 p-3 rounded-xl flex items-start gap-2"
                style={{ backgroundColor: '#E2EFFA', borderColor: '#D5C5BD' }}
              >
                <Info className="size-4 text-[#4A6FA5] flex-shrink-0 mt-0.5" />
                <p className="text-[#4A6FA5] text-sm">
                  {t('upload.scanExpiryNote')}
                </p>
              </div>
            )}
          </SoftCard>

          {/* Secure Mode Selection */}
          <SoftCard>
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-[#F5E5E1] p-3 rounded-xl border border-[#D5C5BD]">
                <Shield className="size-5 text-[#E8927E]" />
              </div>
              <div>
                <h2 className="text-[#3F3F3F]">{t('upload.securityTitle')}</h2>
                <p className="text-[#5B5B5B] text-sm">{t('upload.securitySubtitle')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Standard Mode */}
              <button
                onClick={() => setSecureMode(false)}
                className={`p-5 rounded-xl border-2 transition-all text-left ${
                  !secureMode
                    ? 'bg-[#5D8CC9] text-white border-[#4A6FA5]'
                    : 'bg-[#E8DCD4] text-[#3F3F3F] border-[#D5C5BD] hover:bg-[#E1C7BA]'
                }`}
                style={{
                  boxShadow: !secureMode 
                    ? '0 4px 12px rgba(93, 140, 201, 0.25)' 
                    : 'none',
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Eye className={`size-5 ${!secureMode ? 'text-white' : 'text-[#4A6FA5]'}`} />
                  <h3 className={`${!secureMode ? 'text-white' : 'text-[#3F3F3F]'}`}>
                    {t('upload.standardMode')}
                  </h3>
                </div>
                <p className={`text-sm mb-1 ${!secureMode ? 'text-white/90' : 'text-[#3F3F3F]'}`}>
                  {t('upload.standardModeDesc')}
                </p>
                <p className={`text-xs ${!secureMode ? 'text-white/75' : 'text-[#5B5B5B]'}`}>
                  {t('upload.standardModeNote')}
                </p>
              </button>

              {/* Secure Mode */}
              <button
                onClick={() => setSecureMode(true)}
                className={`p-5 rounded-xl border-2 transition-all text-left relative ${
                  secureMode
                    ? 'bg-[#5D8CC9] text-white border-[#4A6FA5]'
                    : 'bg-[#E8DCD4] text-[#3F3F3F] border-[#D5C5BD] hover:bg-[#E1C7BA]'
                }`}
                style={{
                  boxShadow: secureMode 
                    ? '0 4px 12px rgba(93, 140, 201, 0.25)' 
                    : 'none',
                }}
              >
                {user && (
                  <div className="absolute top-2 right-2">
                    <Crown className="size-4 text-[#E8927E]" />
                  </div>
                )}
                <div className="flex items-center gap-3 mb-2">
                  <Shield className={`size-5 ${secureMode ? 'text-white' : 'text-[#E8927E]'}`} />
                  <h3 className={`${secureMode ? 'text-white' : 'text-[#3F3F3F]'}`}>
                    {t('upload.secureMode')}
                  </h3>
                </div>
                <p className={`text-sm mb-1 ${secureMode ? 'text-white/90' : 'text-[#3F3F3F]'}`}>
                  {t('upload.secureModeDesc')}
                </p>
                <p className={`text-xs ${secureMode ? 'text-white/75' : 'text-[#5B5B5B]'}`}>
                  {t('upload.secureModeNote')}
                </p>
              </button>
            </div>

            {secureMode && (
              <div 
                className="mt-4 p-3 rounded-xl flex items-start gap-2"
                style={{ backgroundColor: '#F5E5E1', borderColor: '#D5C5BD' }}
              >
                <Shield className="size-4 text-[#E8927E] flex-shrink-0 mt-0.5" />
                <p className="text-[#E8927E] text-sm" dangerouslySetInnerHTML={{ __html: t('upload.secureModeInfo') }} />
              </div>
            )}

            {!user && secureMode && (
              <div 
                className="mt-4 p-3 rounded-xl flex items-start gap-2"
                style={{ backgroundColor: '#E2EFFA', borderColor: '#D5C5BD' }}
              >
                <Info className="size-4 text-[#4A6FA5] flex-shrink-0 mt-0.5" />
                <p className="text-[#4A6FA5] text-sm">
                  {t('upload.secureModeLoginRequired')}
                </p>
              </div>
            )}
          </SoftCard>

          {user && (
            <>
              <SoftCard>
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-[#F5E5E1] p-3 rounded-xl border border-[#D5C5BD]">
                          <Shield className="size-5 text-[#E8927E]" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-[#3F3F3F]">{t('upload.advancedSettings')}</h3>
                          <p className="text-[#5B5B5B] text-sm">{t('upload.advancedSettingsSubtitle')}</p>
                        </div>
                      </div>
                      <ChevronDown className={`size-5 text-[#5B5B5B] transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="mt-6 space-y-6">
                      {/* Max Scans */}
                      <div className="flex items-center justify-between">
                        <div className="flex-1 flex items-center gap-2">
                          <div>
                            <Label className="text-[#3F3F3F]">{t('upload.maxScans')}</Label>
                            <p className="text-[#5B5B5B] text-sm mt-1">{t('upload.maxScansNote')}</p>
                          </div>
                          <Crown className="size-4 text-[#E8927E] opacity-60" />
                        </div>
                        <Input
                          type="number"
                          placeholder="∞"
                          value={maxScans}
                          onChange={(e) => setMaxScans(e.target.value)}
                          className="w-24 rounded-xl border-[#D5C5BD] bg-[#E8DCD4] text-[#3F3F3F] opacity-75"
                          min="1"
                        />
                      </div>

                      {/* Max Downloads */}
                      {files.length > 0 && (
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <Label className="text-[#3F3F3F]">{t('upload.maxDownloads')}</Label>
                            <p className="text-[#5B5B5B] text-sm mt-1">{t('upload.maxDownloadsNote')}</p>
                          </div>
                          <Input
                            type="number"
                            placeholder="∞"
                            value={maxDownloads}
                            onChange={(e) => setMaxDownloads(e.target.value)}
                            className="w-24 rounded-xl border-[#D5C5BD] bg-[#E8DCD4] text-[#3F3F3F]"
                            min="1"
                          />
                        </div>
                      )}

                      {/* View Only */}
                      {files.length > 0 && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Eye className="size-5 text-[#5B5B5B]" />
                            <div>
                              <Label className="text-[#3F3F3F]">{t('upload.viewOnly')}</Label>
                              <p className="text-[#5B5B5B] text-sm mt-1">{t('upload.viewOnlyNote')}</p>
                            </div>
                          </div>
                          <Switch
                            checked={viewOnly}
                            onCheckedChange={setViewOnly}
                          />
                        </div>
                      )}

                      {/* No Preview */}
                      {files.length > 0 && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <EyeOff className="size-5 text-[#5B5B5B]" />
                            <div>
                              <Label className="text-[#3F3F3F]">{t('upload.noPreview')}</Label>
                              <p className="text-[#5B5B5B] text-sm mt-1">{t('upload.noPreviewNote')}</p>
                            </div>
                          </div>
                          <Switch
                            checked={noPreview}
                            onCheckedChange={setNoPreview}
                          />
                        </div>
                      )}

                      {/* Password Protection */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Lock className="size-5 text-[#5B5B5B]" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Label className="text-[#3F3F3F]">{t('upload.passwordProtection')}</Label>
                                <Crown className="size-4 text-[#E8927E] opacity-60" />
                                <span className="text-xs text-indigo-600 font-medium">+1 coin</span>
                              </div>
                              <p className="text-[#5B5B5B] text-sm mt-1">{t('upload.passwordNote')}</p>
                            </div>
                          </div>
                          <Switch
                            checked={usePassword}
                            onCheckedChange={setUsePassword}
                            className="opacity-75"
                          />
                        </div>
                        
                        {usePassword && (
                          <Input
                            type="text"
                            placeholder={t('upload.passwordPlaceholder')}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="rounded-xl border-[#D5C5BD] bg-[#E8DCD4] text-[#3F3F3F] opacity-75"
                          />
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </SoftCard>

              {/* QR Style Picker */}
              <QrStylePicker
                style={qrStyle}
                onChange={setQrStyle}
                qrUrl={`${window.location.origin}/scan/preview`}
              />
            </>
          )}
        </>
      )}

      {/* Info Cards - Why OneTimeQR? (shown for everyone as upsale) - Hide when QR is shown or when Generate button is visible */}
      {!showDualQr && !hasContent() && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        {/* Card 1: Ingen delbar lenke */}
        <div 
          className="rounded-2xl p-6 border shadow-sm"
          style={{ 
            backgroundColor: '#E8DCD4',
            borderColor: '#D5C5BD'
          }}
        >
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 border"
            style={{ 
              backgroundColor: '#E1C7BA',
              borderColor: '#D5C5BD'
            }}
          >
            <EyeOff className="size-6 text-[#3F3F3F]" />
          </div>
          <h4 className="text-[#3F3F3F] mb-2">{t('upload.noShareableLink')}</h4>
          <p className="text-[#5B5B5B] text-sm leading-relaxed">
            {t('upload.noShareableLinkDesc')}
          </p>
        </div>

        {/* Card 2: Automatisk opprydding */}
        <div 
          className="rounded-2xl p-6 border shadow-sm"
          style={{ 
            backgroundColor: '#F5E5E1',
            borderColor: '#D5C5BD'
          }}
        >
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 border"
            style={{ 
              backgroundColor: '#EED4C9',
              borderColor: '#D5C5BD'
            }}
          >
            <Clock className="size-6 text-[#E8927E]" />
          </div>
          <h4 className="text-[#3F3F3F] mb-2">{t('upload.autoCleanup')}</h4>
          <p className="text-[#5B5B5B] text-sm leading-relaxed">
            {t('upload.autoCleanupDesc')}
          </p>
        </div>

        {/* Card 3: Digitalt avtrykk: 0 */}
        <div 
          className="rounded-2xl p-6 border shadow-sm"
          style={{ 
            backgroundColor: '#E2EFFA',
            borderColor: '#D5C5BD'
          }}
        >
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 border"
            style={{ 
              backgroundColor: '#D0E3F4',
              borderColor: '#D5C5BD'
            }}
          >
            <Lock className="size-6 text-[#4A6FA5]" />
          </div>
          <h4 className="text-[#3F3F3F] mb-2">{t('upload.securityFirst')}</h4>
          <p className="text-[#5B5B5B] text-sm leading-relaxed">
            {t('upload.securityFirstDesc')}
          </p>
        </div>
      </div>
      )}

      {/* Generate Button - Sticky at bottom */}
      {hasContent() && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-50" style={{ backgroundColor: '#F7F2EE' }}>
          <div className="max-w-3xl mx-auto">
            <SoftCard 
              variant="blue" 
              className="relative overflow-hidden"
            >
              {/* Terms of Use Checkbox */}
              <div className="mb-4 pb-4 border-b border-[#D5C5BD]/30">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="terms"
                    checked={acceptedTerms}
                    onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                    className="mt-0.5"
                  />
                  <Label 
                    htmlFor="terms" 
                    className="text-sm text-[#5B5B5B] leading-relaxed cursor-pointer flex-1"
                  >
                    {t('upload.acceptTermsPrefix')}{' '}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[#5D8CC9] underline hover:text-[#4A6FA5] transition-colors"
                    >
                      {t('upload.termsAndPrivacy')}
                    </a>
                    .
                  </Label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <NordicLogo className="w-12 h-12 flex-shrink-0" />
                  {coinCost > 0 && user && (
                    <div className="text-sm">
                      <p className="text-[#5B5B5B]">{t('upload.coinCost')}: <span className="font-semibold text-indigo-600">{coinCost}</span></p>
                      {coins !== null && coins < coinCost && (
                        <p className="text-red-600 text-xs mt-1">{t('upload.insufficientCoinsShort')}</p>
                      )}
                    </div>
                  )}
                  {isFreeTier && (
                    <p className="text-sm text-green-600 font-medium">{t('upload.free')}</p>
                  )}
                </div>
                
                <NordicButton
                  variant="coral"
                  size="lg"
                  onClick={handleGenerateQr}
                  disabled={isGenerating || !acceptedTerms || (user && coinCost > 0 && (coins === null || coins === undefined || coins < coinCost))}
                  className="shadow-lg min-w-[160px]"
                  style={{
                    boxShadow: '0 4px 16px rgba(78, 205, 196, 0.35)',
                  }}
                  title={isFreeTier ? t('upload.free') : coinCost > 0 ? `${t('upload.coinCost')}: ${coinCost}` : ''}
                >
                  {isGenerating ? t('upload.generating') : t('upload.generateQr')}
                </NordicButton>
              </div>
            </SoftCard>
          </div>
        </div>
      )}

      {/* Dual QR Display Modal - shown when Secure Mode is used */}
      {showDualQr && dualQrData && (
        <DualQrDisplay
          qr1Url={dualQrData.qr1}
          qr2Url={dualQrData.qr2}
          qr1LinkUrl={dualQrData.qr1Url}
          qr2LinkUrl={dualQrData.qr2Url}
          title={dualQrData.title}
          onClose={() => {
            setShowDualQr(false);
            setDualQrData(null);
          }}
        />
      )}
    </div>
  );
}