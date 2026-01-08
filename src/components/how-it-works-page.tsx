import { useTranslation } from 'react-i18next';
import { ArrowLeft, Key, Shield, Info, Mail } from 'lucide-react';
import { Button } from './ui/button';
import { NordicLogo } from './nordic-logo';

export function HowItWorksPage({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const isNorwegian = i18n.language === 'no';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5E5E1] via-[#E8DCD4] to-[#E2EFFA] pb-20">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ArrowLeft className="size-5" />
          </Button>
          <NordicLogo />
          <h1 className="text-2xl font-bold text-[#3F3F3F]">
            {isNorwegian ? 'Hvordan det fungerer' : 'How it works'}
          </h1>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          {/* Main Title */}
          <h1 className="text-3xl font-bold text-[#3F3F3F] mb-4">
            {isNorwegian ? 'Hvordan det fungerer' : 'How it works'}
          </h1>
          <div className="border-b border-[#D5C5BD]/50 mb-8"></div>

          <div className="space-y-8">
            {/* 1. What OneTimeQR is */}
            <section>
              <h2 className="text-2xl font-bold mb-4 text-[#3F3F3F]">
                {isNorwegian ? 'Hva er OneTimeQR?' : 'What is OneTimeQR?'}
              </h2>
              <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
                <p>
                  {isNorwegian
                    ? 'OneTimeQR er for midlertidig deling via QR-koder. Innholdet er ment å forsvinne etter en bestemt tid eller antall visninger.'
                    : 'OneTimeQR is for temporary sharing via QR codes. Content is meant to disappear after a set time or number of views.'}
                </p>
                <p>
                  {isNorwegian
                    ? 'Dette er ikke et arkiv eller langtidslagringssystem. Tjenesten er designet for å dele innhold som skal ha en begrenset levetid.'
                    : 'This is not an archive or long-term storage system. The service is designed for sharing content that should have a limited lifetime.'}
                </p>
              </div>
            </section>

            {/* 2. QR as the key */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Key className="size-6 text-[#4A6FA5]" />
                <h2 className="text-2xl font-bold text-[#3F3F3F]">
                  {isNorwegian ? 'QR som nøkkel' : 'QR as the key'}
                </h2>
              </div>
              <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
                <p>
                  {isNorwegian
                    ? 'QR-koden er tilgangsmekanismen. Når du deler en QR-kode, deler du nøkkelen til innholdet.'
                    : 'The QR code is the access mechanism. When you share a QR code, you share the key to the content.'}
                </p>
                <p>
                  {isNorwegian
                    ? 'For ekstra kontroll kan nøkkelen deles i to deler, hver levert via en egen QR-kode. Begge er nødvendige for å åpne innholdet.'
                    : 'For extra control, the key can be split into two parts, each delivered via a separate QR code. Both are required to open the content.'}
                </p>
              </div>
            </section>

            {/* 3. Secure Mode */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Shield className="size-6 text-[#E8927E]" />
                <h2 className="text-2xl font-bold text-[#3F3F3F]">
                  {isNorwegian ? 'Secure Mode' : 'Secure Mode'}
                </h2>
              </div>
              <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
                <p>
                  {isNorwegian
                    ? 'I Secure Mode krypteres innholdet før lagring. Tilgangsnøkkelen deles i to deler, og hver del leveres via en egen QR-kode.'
                    : 'In Secure Mode, content is encrypted before storage. The access key is split into two parts, and each part is delivered via a separate QR code.'}
                </p>
                <p>
                  {isNorwegian
                    ? 'Begge QR-kodene må scannes for å åpne innholdet. Nøklene håndteres på mottakerens enhet.'
                    : 'Both QR codes must be scanned to open the content. Keys are handled on the recipient\'s device.'}
                </p>
                <p>
                  {isNorwegian
                    ? 'Dette er et teknisk designvalg som gir ekstra kontroll, ikke en absolutt garanti.'
                    : 'This is a technical design choice that provides additional control, not an absolute guarantee.'}
                </p>
              </div>
            </section>

            {/* 4. Technical Notes */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Info className="size-6 text-[#5B5B5B]" />
                <h2 className="text-2xl font-bold text-[#3F3F3F]">
                  {isNorwegian ? 'Tekniske notater' : 'Technical notes'}
                </h2>
              </div>
              <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
                <ul className="space-y-2 ml-5 pl-0" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                  <li className="pl-4">
                    {isNorwegian
                      ? 'Kryptering og dekryptering skjer på klienten (din enhet)'
                      : 'Encryption and decryption happen on the client (your device)'}
                  </li>
                  <li className="pl-4">
                    {isNorwegian
                      ? 'QR-nøkler leveres via URL-fragmenter og sendes ikke til serveren'
                      : 'QR keys are delivered via URL fragments and are not sent to the server'}
                  </li>
                  <li className="pl-4">
                    {isNorwegian
                      ? 'Serveren lagrer kun kryptert data'
                      : 'The server stores encrypted data only'}
                  </li>
                  <li className="pl-4">
                    {isNorwegian
                      ? 'Oppførsel avhenger av nettleser og enhet'
                      : 'Behavior depends on browser and device'}
                  </li>
                </ul>
              </div>
            </section>

            {/* 5. Limitations & Reality Check */}
            <section>
              <h2 className="text-2xl font-bold mb-4 text-[#3F3F3F]">
                {isNorwegian ? 'Begrensninger og realitet' : 'Limitations & reality check'}
              </h2>
              <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
                <p>
                  {isNorwegian
                    ? 'Nettlesere fungerer forskjellig. Caching og skjermbilder kan ikke forhindres.'
                    : 'Browsers differ. Caching and screenshots cannot be prevented.'}
                </p>
                <p>
                  {isNorwegian
                    ? 'Engangsvisning og utløpstid reduserer eksponering, men eliminerer ikke risiko fullstendig.'
                    : 'Single-view and expiry reduce exposure, but do not eliminate risk completely.'}
                </p>
              </div>
            </section>

            {/* 6. Contact */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Mail className="size-6 text-[#4A6FA5]" />
                <h2 className="text-2xl font-bold text-[#3F3F3F]">
                  {isNorwegian ? 'Kontakt' : 'Contact'}
                </h2>
              </div>
              <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
                <p>
                  {isNorwegian
                    ? 'Spørsmål, tilbakemeldinger eller sikkerhetshensyn? Ta kontakt.'
                    : 'Questions, feedback, or security concerns? Reach out.'}
                </p>
                <p>
                  <a 
                    href="mailto:contact@onetimeqr.com" 
                    className="text-[#5D8CC9] underline hover:text-[#4A6FA5] transition-colors"
                  >
                    contact@onetimeqr.com
                  </a>
                </p>
              </div>
            </section>
          </div>

          {/* Footer Links */}
          <div className="border-t border-[#D5C5BD]/50 pt-4 mt-8">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 text-sm">
              <a
                href="/terms"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/terms');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#5D8CC9] underline hover:text-[#4A6FA5] transition-colors"
              >
                {isNorwegian ? 'Vilkår & Personvern' : 'Terms & Privacy'}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
