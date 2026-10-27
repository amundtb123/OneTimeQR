// Scheduled release: a QR drop can open at a later date, at most 3 months ahead.
// The server enforces the same limit (MAX_ACTIVATION_DELAY_MS in the Edge Function).

type Translate = (key: string, options?: Record<string, unknown>) => string;

const MAX_ACTIVATION_MONTHS = 3;
const MAX_ACTIVATION_DELAY_MS = 92 * 24 * 60 * 60 * 1000;

export function maxActivationDate(now = new Date()): Date {
  const max = new Date(now);
  max.setMonth(max.getMonth() + MAX_ACTIVATION_MONTHS);
  return new Date(Math.min(max.getTime(), now.getTime() + MAX_ACTIVATION_DELAY_MS));
}

// Tomorrow at the next full hour: a sensible first suggestion in the picker
export function defaultActivationDate(now = new Date()): Date {
  const date = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

export function isValidActivationDate(date: Date | null, now = new Date()): date is Date {
  return !!date && !Number.isNaN(date.getTime()) && date > now && date <= maxActivationDate(now);
}

// <input type="datetime-local"> works in local time without a time zone: "2026-11-03T14:00"
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInputValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value); // Parsed as local time
  return Number.isNaN(date.getTime()) ? null : date;
}

// "3. november kl. 14:00" / "3 November, 14:00"
export function formatActivationDate(date: Date | number, language: string): string {
  const d = new Date(date);
  return d.toLocaleString(language === 'no' ? 'nb-NO' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  });
}

// "3d 4h", "4h 12m" or "12m 5s" until the drop opens
export function formatCountdown(t: Translate, activatesAt: number, now: number): string {
  const totalSeconds = Math.max(0, Math.floor((activatesAt - now) / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const days = Math.floor(totalSeconds / 86400);
  if (days > 0) return t('activation.countdownDays', { days, hours });
  if (hours > 0) return t('activation.countdownHours', { hours, minutes });
  return t('activation.countdownMinutes', { minutes, seconds });
}
