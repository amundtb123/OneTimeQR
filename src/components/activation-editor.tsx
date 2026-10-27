import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner@2.0.3';
import type { QrDrop } from '../App';
import { setActivationDate } from '../utils/api-client';
import {
  formatActivationDate,
  formatCountdown,
  fromLocalInputValue,
  isValidActivationDate,
  maxActivationDate,
  toLocalInputValue,
} from '../utils/activation';
import { useNow } from '../utils/time-left';

interface ActivationEditorProps {
  qrDrop: QrDrop;
  // Called with the new release date (undefined = open now) and the expiry that moved along with it
  onChanged: (id: string, changes: { activatesAt?: Date; expiryDate?: Date }) => void;
}

// Shows when a scheduled drop opens, and lets the owner move the date or open it right away
export function ActivationEditor({ qrDrop, onChanged }: ActivationEditorProps) {
  const { t, i18n } = useTranslation();
  const now = useNow(true);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!qrDrop.activatesAt || qrDrop.activatesAt.getTime() <= now) return null;

  const save = async (activatesAt: Date | null) => {
    setIsSaving(true);
    try {
      const { qrDrop: updated } = await setActivationDate(qrDrop.id, activatesAt);
      onChanged(qrDrop.id, {
        activatesAt: updated.activatesAt ? new Date(updated.activatesAt) : undefined,
        expiryDate: updated.expiresAt ? new Date(updated.expiresAt) : undefined,
      });
      setIsEditing(false);
      toast.success(activatesAt ? t('activation.updated') : t('activation.released'));
    } catch (error: any) {
      toast.error(error?.code === 'INVALID_ACTIVATION_DATE' ? t('activation.invalid') : t('activation.updateError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    const date = fromLocalInputValue(inputValue);
    if (!isValidActivationDate(date)) {
      toast.error(t('activation.invalid'));
      return;
    }
    save(date);
  };

  const handleReleaseNow = () => {
    if (window.confirm(t('activation.releaseNowConfirm'))) save(null);
  };

  return (
    <div
      className="rounded-xl p-4 border"
      style={{ backgroundColor: '#E2EFFA', borderColor: '#D5C5BD' }}
    >
      <div className="flex items-start gap-3">
        <CalendarClock className="size-5 text-[#4A6FA5] flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[#3F3F3F]">
            {t('activation.opensAt', { date: formatActivationDate(qrDrop.activatesAt, i18n.language) })}
          </p>
          <p className="text-[#5B5B5B] text-sm">
            {t('activation.opensIn', { time: formatCountdown(t, qrDrop.activatesAt.getTime(), now) })}
          </p>

          {isEditing ? (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="datetime-local"
                value={inputValue}
                min={toLocalInputValue(new Date())}
                max={toLocalInputValue(maxActivationDate())}
                onChange={(e) => setInputValue(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 rounded-xl border bg-white text-[#3F3F3F]"
                style={{ borderColor: '#D5C5BD' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-[#5D8CC9] text-white text-sm disabled:opacity-60"
                >
                  {t('activation.save')}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl border text-sm text-[#3F3F3F]"
                  style={{ borderColor: '#D5C5BD' }}
                >
                  {t('activation.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setInputValue(toLocalInputValue(qrDrop.activatesAt!));
                  setIsEditing(true);
                }}
                className="px-4 py-2 rounded-xl bg-white border text-sm text-[#4A6FA5]"
                style={{ borderColor: '#D5C5BD' }}
              >
                {t('activation.edit')}
              </button>
              <button
                onClick={handleReleaseNow}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-white border text-sm text-[#E8927E] disabled:opacity-60"
                style={{ borderColor: '#D5C5BD' }}
              >
                {t('activation.releaseNow')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
