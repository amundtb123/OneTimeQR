// The rules of a key, as the "Lag" flow shows them: one sentence with a few choices.
// Every key is sealed: one key travels in the link or as a separate code (singleQrMode); a split key
// is shared between the link and a QR code, or two QR codes (secureMode).
import type { QrDrop } from '../../App';
import { defaultActivationDate, formatActivationDate, toLocalInputValue } from '../../utils/activation';
import type { KeyDelivery } from '../../utils/create-drop';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type Times = number | 'inf'; // How many opens; 'inf' = no limit
export type Who = 'code' | 'qr' | 'separate' | 'password' | 'two';
export type Expiry = '10m' | '30m' | '1h' | '24h' | '7d';
export type Mode = 'download' | 'view';

export interface Rules {
  times: Times;
  who: Who;
  expiry: Expiry;
  mode: Mode;
  opensAt: string | null; // datetime-local value; null = opens right away
}

export const TIMES: Times[] = [1, 5, 10, 25, 50, 'inf'];
export const MAX_TIMES = 1000;
export const WHO: Who[] = ['code', 'qr', 'separate', 'password', 'two'];

// How each choice hands out the key (password: one key in the link, plus the password)
export const KEYS_BY_WHO: Record<Who, KeyDelivery> = { code: 'link', qr: 'linkQr', separate: 'separate', password: 'link', two: 'twoQr' };
export const EXPIRY: Expiry[] = ['10m', '30m', '1h', '24h', '7d'];
export const MODE: Mode[] = ['download', 'view'];

// Without an account only the free rules can be picked
export const FREE_EXPIRY: Expiry = '10m';
export const loginOnlyWho = (who: Who) => who === 'password' || who === 'two';

export type TemplateId = 'once' | 'secret' | 'two' | 'gift' | 'many' | 'authenticity';

export interface Template {
  id: TemplateId;
  mark: string;
  tone: 'blue' | 'ink' | 'soft';
  soon?: boolean; // Shown, but not available yet
  rules: (loggedIn: boolean) => Rules;
}

export const TEMPLATES: Template[] = [
  {
    id: 'once', mark: '1×', tone: 'blue',
    rules: (loggedIn) => ({ times: 1, who: 'code', expiry: loggedIn ? '24h' : FREE_EXPIRY, mode: 'download', opensAt: null }),
  },
  {
    id: 'secret', mark: '••', tone: 'soft',
    rules: (loggedIn) => ({ times: 1, who: 'code', expiry: loggedIn ? '1h' : FREE_EXPIRY, mode: 'view', opensAt: null }),
  },
  {
    id: 'two', mark: '2', tone: 'ink',
    rules: () => ({ times: 1, who: 'two', expiry: '7d', mode: 'download', opensAt: null }),
  },
  {
    id: 'gift', mark: '★', tone: 'soft',
    rules: () => ({ times: 1, who: 'code', expiry: '24h', mode: 'download', opensAt: toLocalInputValue(defaultActivationDate()) }),
  },
  {
    id: 'many', mark: '50', tone: 'blue',
    rules: (loggedIn) => ({ times: 50, who: 'code', expiry: loggedIn ? '7d' : FREE_EXPIRY, mode: 'download', opensAt: null }),
  },
  { id: 'authenticity', mark: '✓', tone: 'ink', soon: true, rules: (l) => TEMPLATES[0].rules(l) },
];

// "1 gang", "50 ganger", "ubegrenset": prefix picks the wording (lag.rules, lag.short or lag.preview.badges)
export function timesLabel(t: Translate, times: Times, prefix: string): string {
  if (times === 'inf') return t(`${prefix}.inf`);
  if (times === 1) return t(`${prefix}.one`);
  return t(`${prefix}.n`, { count: times });
}

export const templateById = (id: TemplateId) => TEMPLATES.find((tpl) => tpl.id === id)!;

// "1 gang · den som har koden · 24 timer"
export function shortRuleLine(t: Translate, rules: Rules, language: string): string {
  const parts = [timesLabel(t, rules.times, 'lag.short.times'), t(`lag.short.who.${rules.who}`)];
  if (rules.opensAt) parts.push(t('lag.short.opens', { date: formatActivationDate(new Date(rules.opensAt), language) }));
  parts.push(t(`lag.short.expiry.${rules.expiry}`));
  if (rules.mode === 'view') parts.push(t('lag.short.viewOnly'));
  return parts.join(' · ');
}

// The same line for a key that already exists
export function dropRuleLine(t: Translate, qrDrop: QrDrop): string {
  const parts: string[] = [];
  parts.push(timesLabel(t, qrDrop.maxScans || 'inf', 'lag.short.times'));
  if (qrDrop.keyDelivery === 'linkQr') parts.push(t('lag.short.who.qr'));
  else if (qrDrop.keyDelivery === 'separate') parts.push(t('lag.short.who.separate'));
  else if (qrDrop.secureMode) parts.push(t('lag.short.who.two'));
  else if (qrDrop.password) parts.push(t('lag.short.who.password'));
  else parts.push(t('lag.short.who.code'));
  if (qrDrop.viewOnly) parts.push(t('lag.short.viewOnly'));
  return parts.join(' · ');
}
