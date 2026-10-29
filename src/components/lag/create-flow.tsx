import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner@2.0.3';
import type { QrDrop } from '../../App';
import type { QrStyle } from '../qr-style-picker';
import { useAuth } from '../../utils/auth-context';
import { fromLocalInputValue, isValidActivationDate } from '../../utils/activation';
import { calculateCoinCost, createDrop, saldoKr, MAX_SIZE_LOGGED_IN, FREE_SIZE_LIMIT, LARGE_FILE_SIZE, MAX_OPENS_LARGE_FILE } from '../../utils/create-drop';
import { KEYS_BY_WHO, loginOnlyWho, templateById, type Rules, type TemplateId } from './rules';
import { STYLE_PRESETS, type StylePreset } from './key-preview';
import { StepStart, type PastedContent } from './step-start';
import { StepRules } from './step-rules';

export interface Draft {
  template: TemplateId;
  title: string;
  files: File[];
  text: string;
  urls: string[];
  rules: Rules;
  password: string;
  noPreview: boolean;
  maxDownloads: string;
  preset: StylePreset;
  style: QrStyle;
}

const emptyDraft = (loggedIn: boolean): Draft => ({
  template: 'once',
  title: '',
  files: [],
  text: '',
  urls: [],
  rules: templateById('once').rules(loggedIn),
  password: '',
  noPreview: false,
  maxDownloads: '',
  preset: 'standard',
  style: STYLE_PRESETS.standard,
});

// What stands between the draft and the server, in the order the person should fix it
export function draftCost(draft: Draft) {
  const totalFileSize = draft.files.reduce((sum, file) => sum + file.size, 0);
  const cost = calculateCoinCost({
    totalFileSize,
    expiryType: draft.rules.expiry,
    password: draft.rules.who === 'password',
    scheduled: !!draft.rules.opensAt,
    twoKeys: draft.rules.who === 'two',
  });
  const largeFile = totalFileSize > LARGE_FILE_SIZE;
  const tooManyOpens = largeFile && (draft.rules.times === 'inf' || draft.rules.times > MAX_OPENS_LARGE_FILE);
  return { cost, totalFileSize, largeFile, tooManyOpens, needsLogin: cost > 0 || loginOnlyWho(draft.rules.who) || totalFileSize > FREE_SIZE_LIMIT };
}

interface CreateFlowProps {
  onQrCreated: (qrDrop: QrDrop) => void;
}

export function CreateFlow({ onQrCreated }: CreateFlowProps) {
  const { t } = useTranslation();
  const { user, coins, refreshCoins } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(!!user));
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [creating, setCreating] = useState(false);

  // A file dropped beside the drop zone must not make the browser open it
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  const update = useCallback((changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes })), []);

  const pickTemplate = useCallback((id: TemplateId, content?: PastedContent) => {
    setDraft((d) => ({
      ...d,
      template: id,
      rules: templateById(id).rules(!!user),
      files: content?.files ? [...d.files, ...content.files] : d.files,
      text: content?.text ?? d.text,
      urls: content?.url ? [...d.urls, content.url] : d.urls,
    }));
    setStep(2);
    window.scrollTo({ top: 0 });
  }, [user]);

  const handleCreate = async () => {
    const { rules } = draft;
    if (draft.files.length === 0 && !draft.text.trim() && draft.urls.length === 0) {
      toast.error(t('lag.errors.addContent'));
      return;
    }
    if (!acceptedTerms) {
      toast.error(t('lag.errors.terms'));
      return;
    }
    const { cost, totalFileSize, tooManyOpens } = draftCost(draft);
    const maxSize = user ? MAX_SIZE_LOGGED_IN : FREE_SIZE_LIMIT;
    if (totalFileSize > maxSize) {
      toast.error(t('upload.fileSizeExceeded', { maxSize: user ? '20 MB' : '1 MB', loginPrompt: user ? '' : t('upload.loginPrompt') }));
      return;
    }
    if (tooManyOpens) {
      toast.error(t('lag.errors.tooManyOpens', { max: MAX_OPENS_LARGE_FILE }));
      return;
    }
    if (!user && (cost > 0 || loginOnlyWho(rules.who))) {
      toast.error(t('lag.preview.loginToPay'));
      return;
    }
    if (rules.who === 'password' && !draft.password) {
      toast.error(t('lag.errors.password'));
      return;
    }
    const activatesAt = rules.opensAt ? fromLocalInputValue(rules.opensAt) : null;
    if (rules.opensAt && !isValidActivationDate(activatesAt)) {
      toast.error(t('activation.invalid'));
      return;
    }
    if (cost > 0) {
      if (coins === null || coins === undefined) {
        toast.error(t('upload.loadingCoins'));
        return;
      }
      if (coins < cost) {
        toast.error(t('lag.preview.notEnough'));
        return;
      }
    }

    setCreating(true);
    try {
      const { qrDrop, coinsCharged } = await createDrop(
        {
          title: draft.title,
          files: draft.files,
          textContent: draft.text,
          urls: draft.urls,
          expiryType: rules.expiry,
          activatesAt,
          maxScans: rules.times === 'inf' ? undefined : rules.times,
          maxDownloads: draft.maxDownloads ? parseInt(draft.maxDownloads, 10) || undefined : undefined,
          viewOnly: rules.mode === 'view',
          noPreview: draft.noPreview,
          password: rules.who === 'password' ? draft.password : undefined,
          qrStyle: draft.style,
          keys: KEYS_BY_WHO[rules.who],
        },
        t('upload.sharedContent'),
      );
      if (coinsCharged > 0) {
        await refreshCoins();
        toast.success(t('lag.preview.charged', { kr: saldoKr(coinsCharged) }));
      }
      setDraft(emptyDraft(!!user));
      setAcceptedTerms(false);
      setStep(1);
      onQrCreated(qrDrop);
    } catch (error: any) {
      console.error('❌ Error creating QR drop:', error?.message);
      if (error?.status === 401) toast.error(t('upload.mustBeLoggedIn'));
      else if (error?.code === 'INSUFFICIENT_COINS') {
        await refreshCoins();
        toast.error(t('lag.preview.notEnough'));
      } else if (error?.code === 'RATE_LIMITED') toast.error(t('upload.rateLimited'));
      else if (error?.code === 'INVALID_ACTIVATION_DATE') toast.error(t('activation.invalid'));
      else if (error?.code === 'TOO_MANY_OPENS') toast.error(t('lag.errors.tooManyOpens', { max: MAX_OPENS_LARGE_FILE }));
      else toast.error(error?.message || t('upload.createQrError'));
    } finally {
      setCreating(false);
    }
  };

  if (step === 1) return <StepStart onPick={pickTemplate} />;

  return (
    <StepRules
      draft={draft}
      update={update}
      acceptedTerms={acceptedTerms}
      setAcceptedTerms={setAcceptedTerms}
      creating={creating}
      onCreate={handleCreate}
      onBack={() => setStep(1)}
    />
  );
}
