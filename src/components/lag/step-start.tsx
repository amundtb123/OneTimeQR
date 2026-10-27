import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../utils/auth-context';
import { TEMPLATES, shortRuleLine, type TemplateId } from './rules';

export interface PastedContent {
  files?: File[];
  text?: string;
  url?: string;
}

interface StepStartProps {
  onPick: (id: TemplateId, content?: PastedContent) => void;
}

export function StepStart({ onPick }: StepStartProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // Pasting anywhere on the page starts "Share once" with what was pasted
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length > 0) {
        onPick('once', { files });
        return;
      }
      const text = e.clipboardData?.getData('text')?.trim();
      if (!text) return;
      try {
        const url = new URL(text);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          onPick('once', { url: text });
          return;
        }
      } catch {
        // Not a link: keep it as text
      }
      onPick('once', { text: text.slice(0, 200) });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPick]);

  return (
    <main className="lg-wrap lg-main">
      <div className="lg-stack">
        <div className="lg-eyebrow">{t('lag.step', { n: 1 })}</div>
        <h1 className="lg-h1">{t('lag.start.title')}</h1>
        <p className="lg-lead">{t('lag.start.lead')}</p>
      </div>

      <button
        type="button"
        className={`lg-drop${over ? ' is-over' : ''}`}
        onClick={() => fileInput.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) onPick('once', { files });
        }}
      >
        <span className="lg-row" style={{ gap: 18, flexWrap: 'nowrap' }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />
          </svg>
          <span className="lg-stack" style={{ gap: 2 }}>
            <span className="lg-drop-title">{t('lag.start.drop')}</span>
            <span className="lg-muted" style={{ fontSize: 15 }}>{t('lag.start.dropHint')}</span>
          </span>
        </span>
        <span className="lg-link" style={{ fontSize: 15 }}>{t('lag.start.orTemplate')} ↓</span>
      </button>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/*,video/*,application/pdf,.doc,.docx,.txt"
        className="lg-sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (files.length > 0) onPick('once', { files });
        }}
      />

      <div className="lg-tpls">
        {TEMPLATES.map((tpl) => (
          <button key={tpl.id} type="button" className="lg-tpl" disabled={tpl.soon} onClick={() => onPick(tpl.id)}>
            <span className={`lg-tpl-mark lg-tone-${tpl.tone}`} aria-hidden="true">{tpl.mark}</span>
            <span className="lg-tpl-body">
              <span className="lg-row" style={{ gap: 10 }}>
                <span className="lg-tpl-name">{t(`lag.templates.${tpl.id}.name`)}</span>
                <span className="lg-tag">{tpl.soon ? t('lag.start.soon') : t(`lag.templates.${tpl.id}.tag`)}</span>
              </span>
              <span className="lg-tpl-desc">{t(`lag.templates.${tpl.id}.desc`)}</span>
              {!tpl.soon && <span className="lg-tpl-rule">{shortRuleLine(t, tpl.rules(!!user), i18n.language)}</span>}
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}
