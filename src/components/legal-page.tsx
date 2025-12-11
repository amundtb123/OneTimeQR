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
        <div className="bg-white rounded-2xl p-8 shadow-lg space-y-8">
          {/* Terms of Service */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#3F3F3F]">
              {isNorwegian ? 'Bruksvilkår' : 'Terms of Service'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B]">
              <p>
                {isNorwegian 
                  ? 'Ved å bruke OneTimeQR godtar du disse vilkårene. Tjenesten lar deg dele filer, tekst og URL-er via QR-koder med valgfri utløpstid og sikkerhetsfunksjoner.'
                  : 'By using OneTimeQR, you agree to these terms. The service allows you to share files, text, and URLs via QR codes with optional expiration and security features.'}
              </p>
            </div>
          </section>

          {/* Disclaimers */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#3F3F3F]">
              {isNorwegian ? 'Ansvarsfraskrivelser' : 'Disclaimers'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B]">
              <p>
                {isNorwegian
                  ? 'OneTimeQR leveres "som den er" uten garantier. Vi påtar oss ikke ansvar for tap av data eller misbruk av tjenesten.'
                  : 'OneTimeQR is provided "as is" without warranties. We are not responsible for data loss or misuse of the service.'}
              </p>
            </div>
          </section>

          {/* User-Generated Content */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#3F3F3F]">
              {isNorwegian ? 'Brukergenerert innhold og ansvar' : 'User-Generated Content and Liability'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B]">
              <p>
                {isNorwegian
                  ? 'Brukere er ansvarlige for innholdet de deler. OneTimeQR har ingen innsyn i filer eller innhold (se Safe Harbour nedenfor).'
                  : 'Users are responsible for the content they share. OneTimeQR has no access to files or content (see Safe Harbour below).'}
              </p>
            </div>
          </section>

          {/* Safe Harbour */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#3F3F3F]">
              {isNorwegian ? 'Safe Harbour / Ingen innsyn i filer' : 'Safe Harbour / No File Access'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B]">
              <p>
                {isNorwegian
                  ? 'OneTimeQR logger ikke IP-adresser. Med Secure Mode er filer kryptert end-to-end, og admin kan ikke se innholdet. Vi har ingen innsyn i delt innhold.'
                  : 'OneTimeQR does not log IP addresses. With Secure Mode, files are encrypted end-to-end, and admin cannot see content. We have no access to shared content.'}
              </p>
            </div>
          </section>

          {/* One-Time Access */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#3F3F3F]">
              {isNorwegian ? 'Valgfri engangsvisning' : 'Optional One-Time Access'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B]">
              <p>
                {isNorwegian
                  ? 'Brukere kan velge engangsvisning hvor filen slettes etter første skanning. Dette er valgfritt og påvirker ikke andre vilkår.'
                  : 'Users can choose one-time access where the file is deleted after first scan. This is optional and does not affect other terms.'}
              </p>
            </div>
          </section>

          {/* Automatic Deletion */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#3F3F3F]">
              {isNorwegian ? 'Automatisk sletting etter 10 min' : 'Automatic Deletion After 10 Minutes'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B]">
              <p>
                {isNorwegian
                  ? 'I gratis-modus slettes filer automatisk etter 10 minutter. Premium-brukere kan velge lengre utløpstider.'
                  : 'In free mode, files are automatically deleted after 10 minutes. Premium users can choose longer expiration times.'}
              </p>
            </div>
          </section>

          {/* Free Mode Requirements */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#3F3F3F]">
              {isNorwegian ? 'Gratis-modus krav' : 'Free Mode Requirements'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B]">
              <p>
                {isNorwegian
                  ? 'Gratis-modus tillater opptil 1 MB filstørrelse og 10 minutters utløpstid uten innlogging. Ingen konto nødvendig, men vilkår må godtas.'
                  : 'Free mode allows up to 1 MB file size and 10 minutes expiration without login. No account required, but terms must be accepted.'}
              </p>
            </div>
          </section>

          {/* Privacy Policy */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#3F3F3F]">
              {isNorwegian ? 'Personvernerklæring' : 'Privacy Policy'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B]">
              <h3 className="font-semibold text-[#3F3F3F]">
                {isNorwegian ? 'IP-adresser' : 'IP Addresses'}
              </h3>
              <p>
                {isNorwegian
                  ? 'OneTimeQR logger ikke IP-adresser. Vi samler ikke persondata utover det som er nødvendig for tjenesten.'
                  : 'OneTimeQR does not log IP addresses. We do not collect personal data beyond what is necessary for the service.'}
              </p>

              <h3 className="font-semibold text-[#3F3F3F] mt-4">
                {isNorwegian ? 'Stripe og betalingsinformasjon' : 'Stripe and Payment Information'}
              </h3>
              <p>
                {isNorwegian
                  ? 'Stripe håndterer all betalingsinformasjon. Vi lagrer ikke kortdata lokalt. Se Stripes personvernpolicy for mer informasjon.'
                  : 'Stripe handles all payment information. We do not store card data locally. See Stripe\'s privacy policy for more information.'}
              </p>

              <h3 className="font-semibold text-[#3F3F3F] mt-4">
                {isNorwegian ? 'Ingen innlogging på gratis modus' : 'No Login Required for Free Mode'}
              </h3>
              <p>
                {isNorwegian
                  ? 'Gratis-modus krever ingen innlogging eller konto. Premium-funksjoner krever Google-innlogging.'
                  : 'Free mode requires no login or account. Premium features require Google login.'}
              </p>

              <h3 className="font-semibold text-[#3F3F3F] mt-4">
                {isNorwegian ? 'Hva som lagres' : 'What is Stored'}
              </h3>
              <p>
                {isNorwegian
                  ? 'Vi lagrer kun metadata (filnavn, størrelse, utløpstid) og kryptert innhold hvis Secure Mode er aktivert. Med Secure Mode kan admin ikke se innholdet.'
                  : 'We only store metadata (filename, size, expiration) and encrypted content if Secure Mode is enabled. With Secure Mode, admin cannot see content.'}
              </p>

              <h3 className="font-semibold text-[#3F3F3F] mt-4">
                GDPR
              </h3>
              <p>
                {isNorwegian
                  ? 'Vi overholder GDPR. Du har rett til å få innsyn i, rette eller slette dine data. Kontakt oss for å utøve dine rettigheter.'
                  : 'We comply with GDPR. You have the right to access, correct, or delete your data. Contact us to exercise your rights.'}
              </p>
            </div>
          </section>

          {/* Acceptable Use Policy */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#3F3F3F]">
              {isNorwegian ? 'Akseptabel bruk' : 'Acceptable Use Policy'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B]">
              <h3 className="font-semibold text-[#3F3F3F]">
                {isNorwegian ? 'Forbudt innhold' : 'Prohibited Content'}
              </h3>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{isNorwegian ? 'Ulovlig innhold' : 'Illegal content'}</li>
                <li>{isNorwegian ? 'Virus eller skadelig programvare' : 'Viruses or malicious software'}</li>
                <li>{isNorwegian ? 'Opphavsrettsbeskyttet materiale uten tillatelse' : 'Copyrighted material without permission'}</li>
                <li>{isNorwegian ? 'Personangrep eller trakassering' : 'Personal attacks or harassment'}</li>
              </ul>

              <h3 className="font-semibold text-[#3F3F3F] mt-4">
                {isNorwegian ? 'Forbud mot misbruk' : 'Prohibition of Abuse'}
              </h3>
              <p>
                {isNorwegian
                  ? 'Misbruk av tjenesten, inkludert misbruk av Coins-systemet eller Stripe-betalinger, kan føre til sperring av konto.'
                  : 'Abuse of the service, including abuse of the Coins system or Stripe payments, may result in account suspension.'}
              </p>
            </div>
          </section>

          {/* Payment Terms */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#3F3F3F]">
              {isNorwegian ? 'Betalingsvilkår' : 'Payment Terms'}
            </h2>
            <div className="space-y-4 text-[#5B5B5B]">
              <h3 className="font-semibold text-[#3F3F3F]">
                {isNorwegian ? 'Coins-systemet' : 'Coins System'}
              </h3>
              <p>
                {isNorwegian
                  ? 'Coins brukes for premium-funksjoner. 50 Coins koster 29 NOK. Coins kan ikke refunderes eller overføres mellom kontoer.'
                  : 'Coins are used for premium features. 50 Coins cost 29 NOK. Coins cannot be refunded or transferred between accounts.'}
              </p>

              <h3 className="font-semibold text-[#3F3F3F] mt-4">
                {isNorwegian ? 'Ingen angrerett' : 'No Right of Withdrawal'}
              </h3>
              <p>
                {isNorwegian
                  ? 'Siden vi leverer digitale tjenester umiddelbart, gjelder ikke angrerett i henhold til forbrukerkjøpsloven. Refusjon gis kun ved teknisk feil.'
                  : 'Since we deliver digital services immediately, the right of withdrawal does not apply under consumer purchase law. Refunds are only given for technical errors.'}
              </p>

              <h3 className="font-semibold text-[#3F3F3F] mt-4">
                {isNorwegian ? 'Stripe som betalingspartner' : 'Stripe as Payment Partner'}
              </h3>
              <p>
                {isNorwegian
                  ? 'Stripe håndterer alle betalinger. Vi lagrer ikke kortdata. Se Stripes vilkår for mer informasjon.'
                  : 'Stripe handles all payments. We do not store card data. See Stripe\'s terms for more information.'}
              </p>
            </div>
          </section>

          {/* Last Updated */}
          <section className="pt-4 border-t">
            <p className="text-sm text-[#5B5B5B]">
              {isNorwegian 
                ? 'Sist oppdatert: 11. desember 2024'
                : 'Last updated: December 11, 2024'}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
