import { useTranslation } from 'react-i18next';

// Terms & privacy in the "Lag" look. Every statement here should match what the code does:
// limits and prices mirror create-drop.ts and the server's calculatePriceKr.
type Text = { no: string; en: string };
type Block = Text | { list: Text[] };

interface Section {
  id: string;
  title: Text;
  body: Block[];
}

const tx = (no: string, en: string): Text => ({ no, en });

const CONTACT_EMAIL = 'onetimeqr@dilldall.net';

const SECTIONS: Section[] = [
  {
    id: 'service',
    title: tx('Bruksvilkår', 'Terms of service'),
    body: [
      tx('Ved å bruke OneTimeQR godtar du disse vilkårene.', 'By using OneTimeQR, you agree to these terms.'),
      tx(
        'OneTimeQR er en teknisk tjeneste for midlertidig deling via QR-koder. Du kan knytte filer, tekst eller lenker til en nøkkel (én eller to QR-koder) og bestemme hvem som kan åpne den, hvor mange ganger og hvor lenge.',
        'OneTimeQR is a technical service for temporary sharing via QR codes. You can attach files, text or links to a key (one or two QR codes) and decide who can open it, how many times and for how long.',
      ),
      tx(
        'OneTimeQR er ikke et arkiv eller permanent lagringssystem. Ta vare på dine egne kopier.',
        'OneTimeQR is not an archive or permanent storage. Keep your own copies.',
      ),
    ],
  },
  {
    id: 'encryption',
    title: tx('Kryptering og hva vi kan se', 'Encryption and what we can see'),
    body: [
      tx(
        'Alt innhold krypteres i nettleseren din før det sendes til oss. Nøkkelen lages på enheten din og sendes aldri til serveren: den ligger i lenken etter #-tegnet, eller er delt mellom to QR-koder. Vi lagrer bare kryptert innhold og kan ikke lese det.',
        'All content is encrypted in your browser before it is sent to us. The key is made on your device and never sent to the server: it travels in the link after the # sign, or is split between two QR codes. We only store encrypted content and cannot read it.',
      ),
      tx(
        'Det betyr også at vi ikke kan gjenopprette innhold hvis lenken eller QR-kodene går tapt.',
        'This also means we cannot recover content if the link or the QR codes are lost.',
      ),
      tx('Dette lagres ukryptert, fordi tjenesten trenger det for å fungere:', 'The following is stored unencrypted, because the service needs it to work:'),
      {
        list: [
          tx('navnet du gir nøkkelen, og filnavn og filtyper', 'the name you give the key, and file names and file types'),
          tx('størrelse, regler (antall åpninger, utløpstid, åpningsdato) og telleverk', 'size, rules (number of opens, expiry, opening date) and counters'),
          tx('en hash av passordet, hvis du har valgt passord', 'a hash of the password, if you chose one'),
        ],
      },
      tx(
        'Ikke legg sensitive opplysninger i navnet på nøkkelen eller i filnavn. Kryptering er et sterkt arkitektonisk valg, men ingen garanti mot feil, svakheter i enheten din eller at noen får tak i lenken.',
        'Do not put sensitive information in the key name or in file names. Encryption is a strong architectural choice, but no guarantee against bugs, weaknesses in your device or someone getting hold of the link.',
      ),
    ],
  },
  {
    id: 'access',
    title: tx('Tilgang og regler', 'Access and rules'),
    body: [
      tx('Du velger selv reglene for hver nøkkel:', 'You choose the rules for each key:'),
      {
        list: [
          tx('Hvem: den som har lenken, den som har lenken og QR-nøkkelen, den som har lenken og passordet, eller den som har begge QR-nøklene', 'Who: whoever has the link, whoever has the link and the QR key, whoever has the link and the password, or whoever has both QR keys'),
          tx('Antall åpninger: fra 1 til 1000, eller ubegrenset', 'Number of opens: from 1 to 1000, or unlimited'),
          tx('Utløpstid: 10 minutter, 30 minutter, 1 time, 24 timer eller 7 dager', 'Expiry: 10 minutes, 30 minutes, 1 hour, 24 hours or 7 days'),
          tx('Planlagt åpning: inntil 3 måneder frem i tid. Utløpstiden regnes fra åpningsdatoen', 'Scheduled opening: up to 3 months ahead. The expiry counts from the opening date'),
          tx('Bare visning: innholdet vises, men tilbys ikke som nedlasting', 'View only: the content is shown, but not offered as a download'),
        ],
      },
      tx(
        'Dette er tekniske mekanismer som reduserer eksponering, ikke garantier. Den som åpner innholdet kan for eksempel ta skjermbilde eller kopiere det, også ved «bare visning».',
        'These are technical mechanisms that reduce exposure, not guarantees. Whoever opens the content can for example take a screenshot or copy it, also with "view only".',
      ),
    ],
  },
  {
    id: 'deletion',
    title: tx('Utløp og sletting', 'Expiry and deletion'),
    body: [
      tx(
        'Når en nøkkel har utløpt eller er åpnet så mange ganger som du valgte, slettes innholdet automatisk, vanligvis i løpet av kort tid. Du kan også slette en nøkkel selv fra nøkkelringen.',
        'When a key has expired or has been opened as many times as you chose, the content is deleted automatically, usually shortly after. You can also delete a key yourself from the key ring.',
      ),
      tx(
        'Vi gjør vårt beste for at sletting skjer til riktig tid, men kan ikke garantere det. Innhold som allerede er åpnet, lastet ned eller lagret i mottakerens nettleser er utenfor vår kontroll.',
        'We do our best to delete at the right time, but cannot guarantee it. Content that has already been opened, downloaded or saved in the recipient\'s browser is outside our control.',
      ),
    ],
  },
  {
    id: 'free',
    title: tx('Gratis og med konto', 'Free and with an account'),
    body: [
      tx('Uten innlogging kan du dele gratis, med disse grensene:', 'Without logging in you can share for free, with these limits:'),
      {
        list: [
          tx('maks 1 MB', 'up to 1 MB'),
          tx('maks 100 MB nedlasting til sammen (filstørrelse × antall åpninger)', 'up to 100 MB of downloads in all (file size × number of opens)'),
          tx('maks 10 minutter', 'up to 10 minutes'),
          tx('bare «den som har lenken» og «den som har lenken og QR-nøkkelen»', 'only "whoever has the link" and "whoever has the link and the QR key"'),
        ],
      },
      tx(
        'Logger du inn med Google, kan du lage Pluss-nøkler: inntil 20 MB, lengre utløpstid, passord, to QR-nøkler og fast åpningsdato. En Pluss-nøkkel koster 5 kr. Nye kontoer får 15 kr i startsaldo.',
        'If you log in with Google, you can make Pluss keys: up to 20 MB, longer expiry, a password, two QR keys and a set opening date. A Pluss key costs 5 kr. New accounts get 15 kr to start with.',
      ),
      tx('Nøkler med filer kan åpnes maks 1000 ganger. Eieren kan forhåndsvise dem 3 ganger uten å bruke en åpning; etter det teller også eierens åpninger.', 'Keys with files can be opened at most 1000 times. The owner can preview them 3 times without using an open; after that the owner\'s opens count too.'),
      tx('Vi kan endre disse grensene.', 'We may change these limits.'),
    ],
  },
  {
    id: 'coins',
    title: tx('Saldo og betaling', 'Balance and payment'),
    body: [
      tx('Du fyller på saldoen med 50 eller 100 kr. En Pluss-nøkkel koster 5 kr uansett hva den bruker av Pluss, og dekker 3 GB nedlasting (filstørrelse × antall åpninger). Hver GB utover koster 1,50 kr. Prisen trekkes fra saldoen når du lager nøkkelen, og vises før du lager den.', 'You top up your balance with 50 or 100 kr. A Pluss key costs 5 kr whatever Pluss features it uses, and covers 3 GB of downloads (file size × number of opens). Each GB beyond costs 1.50 kr. The price is taken from your balance when you create the key, and is shown before you create it.'),
      {
        list: [
          tx('Saldoen kan bare brukes til nøkler i OneTimeQR og kan ikke tas ut som penger', 'The balance can only be used for keys in OneTimeQR and cannot be withdrawn as money'),
          tx('Saldo refunderes ikke', 'The balance is not refunded'),
          tx('Priser og hva som er Pluss kan endres', 'Prices and what counts as Pluss may change'),
          tx('Saldoen oppdateres etter vellykket betaling, men vi garanterer ikke umiddelbar levering', 'The balance is updated after a successful payment, but we do not guarantee immediate delivery'),
        ],
      },
      tx(
        'Ved påfylling samtykker du til at leveringen starter med en gang, og at angreretten dermed bortfaller for denne digitale ytelsen.',
        'When topping up, you consent to delivery starting right away, and that the right of withdrawal therefore lapses for this digital service.',
      ),
      tx(
        'Betalinger behandles av Stripe. Vi ser eller lagrer aldri kortopplysninger, og er ikke ansvarlige for avviste kort, feil hos Stripe eller tilbakeføringer.',
        'Payments are processed by Stripe. We never see or store card details, and are not responsible for declined cards, errors at Stripe or chargebacks.',
      ),
    ],
  },
  {
    id: 'privacy',
    title: tx('Personvern', 'Privacy'),
    body: [
      tx('Vi samler inn så lite som mulig:', 'We collect as little as possible:'),
      {
        list: [
          tx('Konto: logger du inn med Google, får vi bruker-ID og e-postadressen din, og vi lagrer saldoen din', 'Account: if you log in with Google, we get your user ID and email address, and we store your balance'),
          tx('Nøkler: det som står under «Kryptering og hva vi kan se», til nøkkelen slettes', 'Keys: what is described under "Encryption and what we can see", until the key is deleted'),
          tx('Misbruksvern: for å begrense hvor mange nøkler som lages, lagrer vi en hash av IP-adressen, ikke selve adressen', 'Abuse protection: to limit how many keys are created, we store a hash of the IP address, not the address itself'),
          tx('Betaling: Stripe behandler betalingen og deler med oss om den gikk gjennom', 'Payment: Stripe processes the payment and tells us whether it went through'),
        ],
      },
      tx(
        'I nettleseren din lagres språkvalg, innlogging og nøkkeldeler du har skannet, slik at du kan åpne innholdet. Vi bruker ikke sporing eller reklamecookies.',
        'Your browser stores your language choice, your login and key parts you have scanned, so you can open the content. We use no tracking or advertising cookies.',
      ),
      tx(
        'Tjenesten driftes hos Supabase (database, lagring og innlogging) og Netlify (nettsiden). Vi selger ikke opplysninger og deler dem bare der det trengs for å drive tjenesten eller er påkrevd ved lov.',
        'The service runs on Supabase (database, storage and login) and Netlify (the website). We do not sell data and only share it where needed to run the service or where required by law.',
      ),
    ],
  },
  {
    id: 'responsibility',
    title: tx('Ditt ansvar og forbudt bruk', 'Your responsibility and prohibited use'),
    body: [
      tx(
        'Du er selv ansvarlig for innholdet du deler, reglene du velger, hvem du gir QR-kodene til og konsekvensene av delingen. Fordi innholdet er kryptert, kan vi ikke se, overvåke eller moderere det.',
        'You are responsible for the content you share, the rules you choose, who you give the QR codes to and the consequences of sharing. Because content is encrypted, we cannot see, monitor or moderate it.',
      ),
      tx('Det er ikke tillatt å dele:', 'You may not share:'),
      {
        list: [
          tx('ulovlig materiale', 'illegal material'),
          tx('skadelig programvare', 'malicious software'),
          tx('opphavsrettsbeskyttet materiale uten tillatelse', 'copyrighted material without permission'),
          tx('innhold som trakasserer, skader eller krenker andre', 'content that harasses, harms or violates others'),
          tx('innhold brukt til svindel eller misbruk', 'content used for fraud or abuse'),
        ],
      },
      tx(
        'OneTimeQR er en passiv teknisk formidler. Får vi varsel om misbruk av en bestemt lenke, kan vi slette nøkkelen og sperre kontoen som laget den.',
        'OneTimeQR is a passive technical intermediary. If we are notified of abuse of a specific link, we may delete the key and block the account that created it.',
      ),
    ],
  },
  {
    id: 'disclaimer',
    title: tx('Ansvarsfraskrivelse', 'Disclaimer'),
    body: [
      tx(
        'OneTimeQR leveres «som den er» og «som tilgjengelig», uten garanti for tilgjengelighet, lagring, sikkerhet, hastighet, kompatibilitet, korrekt sletting eller kontinuerlig drift.',
        'OneTimeQR is provided "as is" and "as available", without any guarantee of availability, storage, security, speed, compatibility, correct deletion or continuous operation.',
      ),
      tx(
        'Så langt loven tillater, er vi ikke ansvarlige for tap av data, tapt tilgang til QR-koder, innhold som slettes for tidlig eller for sent, misbruk, brukerfeil, feil i tjenesten eller lagring og caching utenfor vår kontroll. Du bruker tjenesten på eget ansvar.',
        'To the extent permitted by law, we are not liable for data loss, lost access to QR codes, content deleted too early or too late, abuse, user errors, errors in the service, or storage and caching outside our control. You use the service at your own risk.',
      ),
    ],
  },
  {
    id: 'changes',
    title: tx('Endringer og lovvalg', 'Changes and governing law'),
    body: [
      tx(
        'Vi kan endre funksjoner, priser, grenser og disse vilkårene. Fortsetter du å bruke tjenesten etter en endring, godtar du de nye vilkårene.',
        'We may change features, prices, limits and these terms. If you keep using the service after a change, you accept the new terms.',
      ),
      tx(
        'Tjenesten reguleres av norsk lov. Tvister behandles av Oslo tingrett, med mindre annet følger av ufravikelig lov.',
        'The service is governed by Norwegian law. Disputes are handled by Oslo District Court, unless mandatory law says otherwise.',
      ),
    ],
  },
  {
    id: 'contact',
    title: tx('Kontakt', 'Contact'),
    body: [
      tx(
        `Varsle om misbruk, spør om personvern eller be om innsyn eller sletting av opplysninger om deg på ${CONTACT_EMAIL}. Ved varsel om misbruk, ta med lenken det gjelder.`,
        `Report abuse, ask about privacy or request access to or deletion of your data at ${CONTACT_EMAIL}. When reporting abuse, include the link in question.`,
      ),
    ],
  },
];

export function LegalPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'no' ? 'no' : 'en';
  const say = (text: Text) => text[lang];

  return (
    <main className="lg-wrap lg-main">
      <div className="lg-stack">
        <span className="lg-eyebrow">{lang === 'no' ? 'Sist oppdatert 27. oktober 2026' : 'Last updated 27 October 2026'}</span>
        <h1 className="lg-h1">{lang === 'no' ? 'Vilkår og personvern' : 'Terms and privacy'}</h1>
        <p className="lg-lead">
          {lang === 'no'
            ? 'Kort fortalt: innholdet ditt krypteres før det forlater enheten din, vi kan ikke lese det, og det slettes når reglene du valgte er brukt opp.'
            : 'In short: your content is encrypted before it leaves your device, we cannot read it, and it is deleted when the rules you chose are used up.'}
        </p>
      </div>

      <div className="lg-cols">
        <nav className="lg-col-side lg-sticky lg-legal-toc" aria-label={lang === 'no' ? 'Innhold' : 'Contents'}>
          <ol>
            {SECTIONS.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>
                  <span className="lg-legal-num">{String(index + 1).padStart(2, '0')}</span>
                  {say(section.title)}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="lg-col-main lg-card lg-legal">
          {SECTIONS.map((section, index) => (
            <section key={section.id} id={section.id}>
              <h2 className="lg-h2">
                <span className="lg-legal-num">{String(index + 1).padStart(2, '0')}</span>
                {say(section.title)}
              </h2>
              {section.body.map((block, i) =>
                'list' in block ? (
                  <ul key={i}>
                    {block.list.map((item, j) => <li key={j}>{say(item)}</li>)}
                  </ul>
                ) : (
                  <p key={i}>
                    {say(block).split(CONTACT_EMAIL).map((part, j) => (
                      <span key={j}>
                        {j > 0 && <a className="lg-link lg-underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>}
                        {part}
                      </span>
                    ))}
                  </p>
                ),
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
