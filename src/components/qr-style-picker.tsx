import { useState, useEffect, useRef } from 'react';
import { Palette, Image as ImageIcon, Grid3x3, Sparkles } from 'lucide-react';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { generateQrCodeData, renderQrCodeVisual, type QrCodeData } from '../utils/qr-generator';

export interface QrStyle {
  // Colors
  dotsColor: string;
  backgroundColor: string;
  gradientType: 'none' | 'linear' | 'radial';
  gradientColor1?: string;
  gradientColor2?: string;
  
  // Dot styles
  dotsType: 'rounded' | 'dots' | 'classy' | 'classy-rounded' | 'square' | 'extra-rounded';
  
  // Corner styles
  cornersSquareType: 'dot' | 'square' | 'extra-rounded';
  cornersDotType: 'dot' | 'square';
  cornersSquareColor?: string;
  cornersDotColor?: string;
  
  // Logo
  logo?: string; // base64 or URL
  logoSize: number; // 0-0.5 (percentage of QR size)
  logoMargin: number;
}

interface QrStylePickerProps {
  style: QrStyle;
  onChange: (style: QrStyle) => void;
  qrUrl: string; // The URL to encode in the QR
}

/**
 * QR Style Picker Component
 * 
 * ARCHITECTURE:
 * - QR code DATA (the encoded pattern) is generated ONCE when qrUrl changes
 * - QR code VISUAL (styling) is re-rendered when style changes
 * - This ensures the QR pattern stays consistent when only colors/styling change
 */
export function QrStylePicker({ style, onChange, qrUrl }: QrStylePickerProps) {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Cache QR code DATA (the encoded pattern) - only regenerates when qrUrl changes
  // This is the actual QR code structure, independent of visual styling
  const [qrData, setQrData] = useState<QrCodeData | null>(null);
  const [lastQrUrl, setLastQrUrl] = useState<string>('');

  const presetColors = [
    { name: 'Indigo', value: '#4F46E5' },
    { name: 'Svart', value: '#000000' },
    { name: 'Rød', value: '#DC2626' },
    { name: 'Grønn', value: '#16A34A' },
    { name: 'Blå', value: '#2563EB' },
    { name: 'Rosa', value: '#EC4899' },
    { name: 'Orange', value: '#EA580C' },
    { name: 'Lilla', value: '#9333EA' },
  ];

  const dotStyles: Array<{ value: QrStyle['dotsType']; label: string }> = [
    { value: 'square', label: 'Firkant' },
    { value: 'dots', label: 'Prikker' },
    { value: 'rounded', label: 'Avrundet' },
    { value: 'extra-rounded', label: 'Ekstra avrundet' },
    { value: 'classy', label: 'Elegant' },
    { value: 'classy-rounded', label: 'Elegant avrundet' },
  ];

  const cornerStyles: Array<{ value: QrStyle['cornersSquareType']; label: string }> = [
    { value: 'square', label: 'Firkant' },
    { value: 'dot', label: 'Prikk' },
    { value: 'extra-rounded', label: 'Ekstra avrundet' },
  ];

  // STEP 1: Generate QR code DATA only when URL or logo presence changes
  // This effect triggers DATA REGENERATION (the actual QR pattern)
  // Note: Logo presence affects error correction level, which changes the QR structure
  useEffect(() => {
    if (!qrUrl) return;
    
    // Regenerate data if URL changed OR if logo was added/removed (affects error correction)
    const logoChanged = (qrData === null) || (!!style.logo !== (qrData.errorCorrectionLevel === 'H'));
    const urlChanged = qrUrl !== lastQrUrl;
    
    if (!urlChanged && !logoChanged) return;
    
    const generateData = async () => {
      try {
        // Generate QR code data (module grid) - this is the actual encoded pattern
        // Only happens when qrUrl changes OR logo is added/removed, NOT when styling changes
        const data = await generateQrCodeData(qrUrl, style.logo ? 'H' : 'M');
        setQrData(data);
        setLastQrUrl(qrUrl);
      } catch (error) {
        console.error('Error generating QR code data:', error);
      }
    };
    
    generateData();
  }, [qrUrl, !!style.logo]); // Regenerate when URL changes OR logo presence changes

  // STEP 2: Render QR code VISUALLY when data or styling changes
  // This effect triggers VISUAL RE-RENDERING (styling only)
  useEffect(() => {
    if (!qrData) return;
    
    const renderVisual = async () => {
      try {
        // Render existing QR data with new styling
        // This is fast - only redraws the visual appearance, doesn't regenerate data
        const dataUrl = await renderQrCodeVisual(qrData, style);
        setPreviewUrl(dataUrl);
      } catch (error) {
        console.error('Error rendering QR preview:', error);
      }
    };
    
    renderVisual();
  }, [qrData, JSON.stringify(style)]); // Re-render when data OR style changes

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onChange({ ...style, logo: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    onChange({ ...style, logo: undefined });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Sparkles className="size-5 text-indigo-600" />
        <h3 className="text-gray-900">Tilpass QR-kode</h3>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Preview */}
        <div className="bg-black rounded-xl p-8 flex items-center justify-center">
          {previewUrl && (
            <img 
              src={previewUrl} 
              alt="QR Preview" 
              className="w-full max-w-[300px]"
            />
          )}
        </div>

        {/* Style Options */}
        <div className="space-y-4">
          <Tabs defaultValue="colors">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="colors">
                <Palette className="size-4 mr-2" />
                Farger
              </TabsTrigger>
              <TabsTrigger value="logo">
                <ImageIcon className="size-4 mr-2" />
                Logo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="colors" className="space-y-4 mt-4">
              {/* Preset Colors */}
              <div>
                <Label className="mb-2 block">Hurtigvalg farger</Label>
                <div className="grid grid-cols-4 gap-2">
                  {presetColors.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => {
                        onChange({ 
                          ...style, 
                          dotsColor: color.value, 
                          gradientType: 'none' 
                        });
                      }}
                      className={`h-12 rounded-lg border-2 transition-all ${
                        style.dotsColor === color.value && style.gradientType === 'none'
                          ? 'border-indigo-600 scale-105'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Custom Color */}
              <div>
                <Label htmlFor="dotsColor" className="mb-2 block">Egendefinert farge</Label>
                <div className="flex gap-2">
                  <Input
                    id="dotsColor"
                    type="color"
                    value={style.dotsColor}
                    onChange={(e) => {
                      onChange({ 
                        ...style, 
                        dotsColor: e.target.value, 
                        gradientType: 'none' 
                      });
                    }}
                    className="w-20 h-10"
                  />
                  <Input
                    type="text"
                    value={style.dotsColor}
                    onChange={(e) => {
                      const newDotsColor = e.target.value;
                      // Only update if it's a valid hex color
                      if (/^#[0-9A-F]{6}$/i.test(newDotsColor)) {
                        onChange({ 
                          ...style, 
                          dotsColor: newDotsColor, 
                          gradientType: 'none' 
                        });
                      } else {
                        // Allow typing even if not valid yet
                        onChange({ ...style, dotsColor: newDotsColor, gradientType: 'none' });
                      }
                    }}
                    className="flex-1"
                    placeholder="#4F46E5"
                  />
                </div>
              </div>

              {/* Background Color */}
              <div>
                <Label htmlFor="bgColor" className="mb-2 block">Bakgrunnsfarge</Label>
                <div className="flex gap-2">
                  <Input
                    id="bgColor"
                    type="color"
                    value={style.backgroundColor}
                    onChange={(e) => {
                      const newBackgroundColor = e.target.value;
                      onChange({ ...style, backgroundColor: newBackgroundColor });
                    }}
                    className="w-20 h-10"
                  />
                  <Input
                    type="text"
                    value={style.backgroundColor}
                    onChange={(e) => {
                      const newBackgroundColor = e.target.value;
                      // Only update if it's a valid hex color
                      if (/^#[0-9A-F]{6}$/i.test(newBackgroundColor)) {
                        onChange({ ...style, backgroundColor: newBackgroundColor });
                      } else {
                        // Allow typing even if not valid yet
                        onChange({ ...style, backgroundColor: newBackgroundColor });
                      }
                    }}
                    className="flex-1"
                    placeholder="#FFFFFF"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="logo" className="space-y-4 mt-4">
              {/* Logo Upload */}
              <div>
                <Label className="mb-2 block">Last opp logo</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                
                {!style.logo ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <ImageIcon className="size-4 mr-2" />
                    Velg logo
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-4">
                      <img 
                        src={style.logo} 
                        alt="Logo" 
                        className="w-16 h-16 object-contain rounded"
                      />
                      <div className="flex-1">
                        <p className="text-sm text-gray-600">Logo lastet opp</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={removeLogo}
                      >
                        Fjern
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {style.logo && (
                <>
                  {/* Logo Size */}
                  <div>
                    <Label htmlFor="logoSize" className="mb-2 block">
                      Logo-størrelse: {Math.round(style.logoSize * 100)}%
                    </Label>
                    <input
                      id="logoSize"
                      type="range"
                      min="0.1"
                      max="0.4"
                      step="0.05"
                      value={style.logoSize}
                      onChange={(e) => onChange({ ...style, logoSize: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  {/* Logo Margin */}
                  <div>
                    <Label htmlFor="logoMargin" className="mb-2 block">
                      Logo-margin: {style.logoMargin}px
                    </Label>
                    <input
                      id="logoMargin"
                      type="range"
                      min="0"
                      max="20"
                      step="2"
                      value={style.logoMargin}
                      onChange={(e) => onChange({ ...style, logoMargin: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-amber-800 text-sm">
                  💡 Tips: Bruk en logo med gjennomsiktig bakgrunn for best resultat. QR-koden bruker høy feilkorreksjon når logo er lagt til.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Card>
  );
}