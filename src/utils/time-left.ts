import { useEffect, useState } from 'react';

type Translate = (key: string, options?: Record<string, unknown>) => string;

// "Expires in 4m 12s" etc., using the qrList translations
export function formatTimeLeft(t: Translate, expiresAt: number, now: number): string {
  const diff = expiresAt - now;
  if (diff <= 0) return t('qrList.expired');

  const totalSeconds = Math.floor(diff / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (hours >= 24) {
    return days === 1 ? t('qrList.expiresInDays', { days }) : t('qrList.expiresInDaysPlural', { days });
  }
  if (hours > 0) {
    return t('qrList.expiresInHours', { hours, minutes: minutes % 60, seconds });
  }
  return t('qrList.expiresInMinutes', { minutes, seconds });
}

// The current time, updated every second while active (for countdowns)
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);
  return now;
}
