import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { NordicLogo } from './nordic-logo';

export function LegalPage({ onBack }: { onBack: () => void }) {
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
            {isNorwegian ? 'Vilkår & Personvern' : 'Terms & Privacy'}
          </h1>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          {/* Main Title */}
          <h1 className="text-3xl font-bold text-[#3F3F3F] mb-4">
            {isNorwegian ? 'Vilkår & Personvern' : 'Terms & Privacy'}
          </h1>
          <div className="border-b border-[#D5C5BD]/50 mb-8"></div>

          <div className="space-y-8">
          {/* 1. Terms of Service */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              1. {isNorwegian ? 'Bruksvilkår' : 'Terms of Service'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian 
                  ? 'Ved å bruke OneTimeQR godtar du disse vilkårene.'
                  : 'By using OneTimeQR, you agree to these terms.'}
              </p>
              <p>
                {isNorwegian
                  ? 'OneTimeQR er en teknisk tjeneste som fasiliterer midlertidig deling via QR-koder. Tjenesten lar brukere generere QR-koder og knytte innhold til dem, som filer, tekst eller lenker.'
                  : 'OneTimeQR is a technical service that facilitates temporary sharing via QR codes. The service allows users to generate QR codes and link content to them, such as files, text, or links.'}
              </p>
              <p>
                {isNorwegian
                  ? 'Brukeren kontrollerer selv innstillinger som utløpstid, tilgangsmetode, antall skanninger, passord og visuelle tilpasninger. OneTimeQR er ikke et arkiv eller permanent lagringssystem.'
                  : 'Users control their own settings such as expiry time, access method, number of scans, password, and visual customizations. OneTimeQR is not an archive or permanent storage system.'}
              </p>
              <p>
                {isNorwegian
                  ? 'OneTimeQR gjør ingen vurdering av innholdet som lastes opp.'
                  : 'OneTimeQR makes no assessment of uploaded content.'}
              </p>
            </div>
          </section>

          {/* 2. Disclaimers */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              2. {isNorwegian ? 'Ansvarsfraskrivelser' : 'Disclaimers'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'OneTimeQR leveres "som den er" og "som tilgjengelig" uten noen garanti for:'
                  : 'OneTimeQR is provided "as is" and "as available" without any guarantee for:'}
              </p>
              <ul className="space-y-2 ml-5 pl-0" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li className="pl-4">{isNorwegian ? 'tilgjengelighet' : 'availability'}</li>
                <li className="pl-4">{isNorwegian ? 'lagring' : 'storage'}</li>
                <li className="pl-4">{isNorwegian ? 'funksjonalitet' : 'functionality'}</li>
                <li className="pl-4">{isNorwegian ? 'sikkerhet' : 'security'}</li>
                <li className="pl-4">{isNorwegian ? 'hastighet' : 'speed'}</li>
                <li className="pl-4">{isNorwegian ? 'kompatibilitet' : 'compatibility'}</li>
                <li className="pl-4">{isNorwegian ? 'korrekt sletting' : 'correct deletion'}</li>
                <li className="pl-4">{isNorwegian ? 'kontinuerlig drift' : 'continuous operation'}</li>
              </ul>
              <p>
                {isNorwegian
                  ? 'Vi påtar oss ikke ansvar for:'
                  : 'We assume no responsibility for:'}
              </p>
              <ul className="space-y-2 ml-5 pl-0" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li className="pl-4">{isNorwegian ? 'tap av data' : 'data loss'}</li>
                <li className="pl-4">{isNorwegian ? 'tapt tilgang til QR-koder' : 'lost access to QR codes'}</li>
                <li className="pl-4">{isNorwegian ? 'at innhold slettes for tidlig eller for sent' : 'content being deleted too early or too late'}</li>
                <li className="pl-4">{isNorwegian ? 'misbruk av tjenesten' : 'abuse of the service'}</li>
                <li className="pl-4">{isNorwegian ? 'brukerfeil' : 'user errors'}</li>
                <li className="pl-4">{isNorwegian ? 'feil i applikasjonen' : 'application errors'}</li>
                <li className="pl-4">{isNorwegian ? 'ekstern lagring eller caching som skjer utenfor vår kontroll' : 'external storage or caching that occurs outside our control'}</li>
              </ul>
              <p>
                {isNorwegian
                  ? 'Brukeren benytter tjenesten på eget ansvar.'
                  : 'Users use the service at their own risk.'}
              </p>
            </div>
          </section>

          {/* 3. User-Generated Content */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              3. {isNorwegian ? 'Brukergenerert innhold og ansvar' : 'User-Generated Content and Liability'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'Brukeren er fullt og helt ansvarlig for:'
                  : 'The user is fully and completely responsible for:'}
              </p>
              <ul className="space-y-2 ml-5 pl-0" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li className="pl-4">{isNorwegian ? 'alt innhold de laster opp' : 'all content they upload'}</li>
                <li className="pl-4">{isNorwegian ? 'all informasjon de deler' : 'all information they share'}</li>
                <li className="pl-4">{isNorwegian ? 'alle valg av innstillinger (utløpstid, tilgangsmetode, passord, antall skanninger m.m.)' : 'all choices of settings (expiry time, access method, password, number of scans, etc.)'}</li>
                <li className="pl-4">{isNorwegian ? 'hvordan QR-koder deles eller brukes' : 'how QR codes are shared or used'}</li>
                <li className="pl-4">{isNorwegian ? 'eventuelle konsekvenser av delingen' : 'any consequences of sharing'}</li>
              </ul>
              <p>
                {isNorwegian
                  ? 'OneTimeQR overvåker ikke og kan ikke kontrollere eller moderere brukerinnhold.'
                  : 'OneTimeQR does not monitor and cannot control or moderate user content.'}
              </p>
            </div>
          </section>

          {/* 4. Content Access and Safe Harbour */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              4. {isNorwegian ? 'Tilgang til innhold og Safe Harbour' : 'Content Access and Safe Harbour'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'Innhold lagres kryptert som del av normal drift. Dekryptering skjer på mottakerens enhet. Som del av normal drift har OneTimeQR ikke tilgang til innhold i klartekst. Dette er et arkitektonisk designvalg, ikke en garanti.'
                  : 'Content is stored encrypted as part of normal operation. Decryption happens on the recipient\'s device. As part of normal operation, OneTimeQR does not have access to plaintext content. This is an architectural design choice, not a guarantee.'}
              </p>
              <p>
                {isNorwegian
                  ? 'I Secure Mode (to QR-koder) deles tilgangsnøkkelen i to deler. Dette gir ekstra kontroll, men er en teknisk mekanisme, ikke en garanti.'
                  : 'In Secure Mode (two QR codes), the access key is split into two parts. This provides additional control, but is a technical mechanism, not a guarantee.'}
              </p>
              <p>
                {isNorwegian
                  ? 'OneTimeQR er en passiv teknisk formidler. Innholdet er brukergenerert. Vi fjerner innhold kun dersom vi mottar gyldig varsel om misbruk eller ved rapportering.'
                  : 'OneTimeQR is a passive technical intermediary. Content is user-generated. We only remove content if we receive valid notice of abuse or through reporting.'}
              </p>
            </div>
          </section>

          {/* 5. Expiry and Deletion */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              5. {isNorwegian ? 'Utløpstid og sletting' : 'Expiry and Deletion'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'Brukere kan velge utløpstid for QR-koder. Dette inkluderer valg som:'
                  : 'Users can choose expiry time for QR codes. This includes options such as:'}
              </p>
              <ul className="space-y-2 ml-5 pl-0" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li className="pl-4">{isNorwegian ? '10 minutter' : '10 minutes'}</li>
                <li className="pl-4">{isNorwegian ? '30 minutter' : '30 minutes'}</li>
                <li className="pl-4">{isNorwegian ? '1 time' : '1 hour'}</li>
                <li className="pl-4">{isNorwegian ? '24 timer' : '24 hours'}</li>
                <li className="pl-4">{isNorwegian ? '7 dager' : '7 days'}</li>
                <li className="pl-4">{isNorwegian ? '"Til noen scanner"' : '"Until someone scans"'}</li>
              </ul>
              <p>
                {isNorwegian
                  ? 'OneTimeQR gjør sitt beste for å slette innhold når utløpstiden er ute. Sletting kan påvirkes av nettleser-caching, nettverkslagring, enhetsvariabilitet og andre faktorer utenfor vår direkte kontroll. Vi kan ikke garantere at sletting alltid skjer nøyaktig til avtalt tidspunkt eller at all data fjernes fra alle systemer.'
                  : 'OneTimeQR makes best-effort attempts to delete content when the expiry time is reached. Deletion may be affected by browser caching, network storage, device variability, and other factors outside our direct control. We cannot guarantee that deletion always occurs at the exact specified time or that all data is removed from all systems.'}
              </p>
            </div>
          </section>

          {/* 6. Scan Limits and Access Control */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              6. {isNorwegian ? 'Skannelimit og tilgangskontroll' : 'Scan Limits and Access Control'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'Brukere kan velge begrensninger som setter maksimalt antall skanninger (inkludert én visning). Dette er et teknisk funksjonsvalg som reduserer eksponering, ikke eliminerer risiko.'
                  : 'Users can choose limitations that set a maximum number of scans (including one view). This is a technical feature choice that reduces exposure, not eliminates risk.'}
              </p>
              <p>
                {isNorwegian
                  ? 'OneTimeQR gjør sitt beste for å håndheve disse begrensningene, men kan ikke garantere at de alltid fungerer fullt ut i alle nettlesere, nettverk, enheter eller under alle forhold. Caching, nettverkslagring og enhetsvariabilitet kan påvirke funksjonaliteten.'
                  : 'OneTimeQR makes best-effort attempts to enforce these limitations, but cannot guarantee they always work fully in all browsers, networks, devices, or under all conditions. Caching, network storage, and device variability may affect functionality.'}
              </p>
            </div>
          </section>

          {/* 7. Access and Control Features */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              7. {isNorwegian ? 'Tilgang og kontrollfunksjoner' : 'Access and Control Features'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'Tjenesten tilbyr tekniske mekanismer for tilgang og kontroll, inkludert:'
                  : 'The service offers technical mechanisms for access and control, including:'}
              </p>
              <ul className="space-y-2 ml-5 pl-0" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li className="pl-4">{isNorwegian ? 'Standard tilgang (én QR-kode)' : 'Standard access (one QR code)'}</li>
                <li className="pl-4">{isNorwegian ? 'Secure Mode (to QR-koder / delt tilgang)' : 'Secure Mode (two QR codes / split access)'}</li>
                <li className="pl-4">{isNorwegian ? 'Passordbeskyttelse' : 'Password protection'}</li>
                <li className="pl-4">{isNorwegian ? 'Begrensninger på antall skanninger' : 'Limitations on number of scans'}</li>
              </ul>
              <p>
                {isNorwegian
                  ? 'Dette er tekniske mekanismer som gir brukeren ekstra kontroll, ikke garantier. OneTimeQR garanterer ikke at disse mekanismene alltid fungerer under alle forhold eller gir absolutt beskyttelse.'
                  : 'These are technical mechanisms that provide users with additional control, not guarantees. OneTimeQR does not guarantee that these mechanisms always work under all conditions or provide absolute protection.'}
              </p>
            </div>
          </section>

          {/* 8. Optional Controls */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              8. {isNorwegian ? 'Valgfrie begrensninger' : 'Optional Controls'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'Brukeren kan justere valgfrie begrensninger, inkludert:'
                  : 'Users can adjust optional limitations, including:'}
              </p>
              <ul className="space-y-2 ml-5 pl-0" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li className="pl-4">{isNorwegian ? 'maksimalt antall skanninger' : 'maximum number of scans'}</li>
                <li className="pl-4">{isNorwegian ? 'passordkrav' : 'password requirements'}</li>
                <li className="pl-4">{isNorwegian ? 'farger og design på QR-koden' : 'colors and design of the QR code'}</li>
              </ul>
              <p>
                {isNorwegian
                  ? 'OneTimeQR har ingen ansvar for konsekvensene av disse valgene.'
                  : 'OneTimeQR has no responsibility for the consequences of these choices.'}
              </p>
            </div>
          </section>

          {/* 9. File Types, Size and Free Mode */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              9. {isNorwegian ? 'Filtyper, størrelse og gratis-modus' : 'File Types, Size and Free Mode'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'I gratis-modus kan brukere laste opp innhold begrenset av:'
                  : 'In free mode, users can upload content limited by:'}
              </p>
              <ul className="space-y-2 ml-5 pl-0" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li className="pl-4">{isNorwegian ? 'maks størrelse (per nå 1 MB)' : 'maximum size (currently 1 MB)'}</li>
                <li className="pl-4">{isNorwegian ? 'maks varighet (per nå 10 minutter)' : 'maximum duration (currently 10 minutes)'}</li>
                <li className="pl-4">{isNorwegian ? 'ingen innlogging nødvendig' : 'no login required'}</li>
              </ul>
              <p>
                {isNorwegian
                  ? 'OneTimeQR kan endre disse grensene når som helst.'
                  : 'OneTimeQR can change these limits at any time.'}
              </p>
            </div>
          </section>

          {/* 10. Payment and Coins */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              10. {isNorwegian ? 'Betaling og Coins' : 'Payment and Coins'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'OneTimeQR tilbyr betalte funksjoner gjennom "Coins".'
                  : 'OneTimeQR offers paid features through "Coins".'}
              </p>
              <ul className="space-y-2 ml-5 pl-0" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li className="pl-4">{isNorwegian ? '50 Coins koster per nå 29 NOK' : '50 Coins currently cost 29 NOK'}</li>
                <li className="pl-4">{isNorwegian ? 'Coins kan brukes til premium-funksjoner (lengre levetid, Secure Mode, passord m.m.)' : 'Coins can be used for premium features (longer lifetime, Secure Mode, password, etc.)'}</li>
                <li className="pl-4">{isNorwegian ? 'Coins er ikke valuta og kan ikke byttes inn i penger' : 'Coins are not currency and cannot be exchanged for money'}</li>
                <li className="pl-4">{isNorwegian ? 'Coins kan ikke refunderes' : 'Coins cannot be refunded'}</li>
                <li className="pl-4">{isNorwegian ? 'Coins kan endres, fjernes eller få endret verdi når som helst' : 'Coins can be changed, removed, or have their value changed at any time'}</li>
                <li className="pl-4">{isNorwegian ? 'Coins legges til etter vellykket betaling, men vi garanterer ikke umiddelbar levering' : 'Coins are added after successful payment, but we do not guarantee immediate delivery'}</li>
              </ul>
            </div>
          </section>

          {/* 11. Right of Withdrawal */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              11. {isNorwegian ? 'Angrerett' : 'Right of Withdrawal'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'Ved kjøp av Coins godtar du at tjenesten leveres umiddelbart, og at angrerett derfor ikke gjelder for digitale ytelser levert på brukerens forespørsel.'
                  : 'When purchasing Coins, you agree that the service is delivered immediately, and therefore the right of withdrawal does not apply to digital services delivered at the user\'s request.'}
              </p>
            </div>
          </section>

          {/* 12. Stripe */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              12. Stripe
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'Stripe behandler alle betalinger. OneTimeQR lagrer ikke kortinformasjon og er ikke ansvarlig for:'
                  : 'Stripe processes all payments. OneTimeQR does not store card information and is not responsible for:'}
              </p>
              <ul className="space-y-2 ml-5 pl-0" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li className="pl-4">{isNorwegian ? 'betalingstransaksjoner' : 'payment transactions'}</li>
                <li className="pl-4">{isNorwegian ? 'tekniske feil hos Stripe' : 'technical errors at Stripe'}</li>
                <li className="pl-4">{isNorwegian ? 'avviste kort' : 'rejected cards'}</li>
                <li className="pl-4">{isNorwegian ? 'tilbakeføringer (chargebacks)' : 'chargebacks'}</li>
              </ul>
            </div>
          </section>

          {/* 13. Prohibited Use */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              13. {isNorwegian ? 'Forbudt bruk' : 'Prohibited Use'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'Brukerne har ikke lov til å laste opp:'
                  : 'Users are not allowed to upload:'}
              </p>
              <ul className="space-y-2 ml-5 pl-0" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li className="pl-4">{isNorwegian ? 'ulovlig materiale' : 'illegal material'}</li>
                <li className="pl-4">{isNorwegian ? 'skadelig programvare' : 'malicious software'}</li>
                <li className="pl-4">{isNorwegian ? 'opphavsrettsbeskyttet materiale uten tillatelse' : 'copyrighted material without permission'}</li>
                <li className="pl-4">{isNorwegian ? 'innhold som trakasserer, skader eller krenker andre' : 'content that harasses, harms, or violates others'}</li>
                <li className="pl-4">{isNorwegian ? 'innhold brukt i svindel eller misbruk' : 'content used in fraud or abuse'}</li>
              </ul>
              <p>
                {isNorwegian
                  ? 'Brudd kan føre til sperring av konto eller sletting av innhold.'
                  : 'Violations may result in account suspension or content deletion.'}
              </p>
            </div>
          </section>

          {/* 14. Changes */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              14. {isNorwegian ? 'Endringer' : 'Changes'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'OneTimeQR kan endre funksjoner, priser, grenser, tilgangsfunksjoner og vilkår uten varsel. Videre bruk av tjenesten anses som aksept av nye vilkår.'
                  : 'OneTimeQR can change features, prices, limits, access features, and terms without notice. Continued use of the service is considered acceptance of new terms.'}
              </p>
            </div>
          </section>

          {/* 15. Applicable Law */}
          <section>
            <h2 className="text-2xl font-bold mb-6 text-[#3F3F3F]">
              15. {isNorwegian ? 'Gjeldende lov' : 'Applicable Law'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B] leading-relaxed text-base">
              <p>
                {isNorwegian
                  ? 'Tjenesten reguleres av norsk lov. Eventuelle tvister behandles av Oslo tingrett med mindre annet følger av ufravikelig lov.'
                  : 'The service is governed by Norwegian law. Any disputes will be handled by Oslo District Court unless otherwise required by mandatory law.'}
              </p>
            </div>
          </section>

          {/* Footer Links */}
          <div className="border-t border-[#D5C5BD]/50 pt-4 mt-8">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 text-sm">
              <a
                href="/how-it-works"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/how-it-works');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#5D8CC9] underline hover:text-[#4A6FA5] transition-colors"
              >
                {isNorwegian ? 'Hvordan det fungerer' : 'How it works'}
              </a>
            </div>
            <p className="text-sm text-[#5B5B5B] italic mt-4">
              {isNorwegian 
                ? 'Sist oppdatert: 8. januar 2026'
                : 'Last updated: January 8, 2026'}
            </p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}







