import { useTranslation } from 'react-i18next';
import { availableLanguages, setAppLanguage } from '../i18n';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <div className="flex items-center gap-1 text-sm">
      {availableLanguages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setAppLanguage(lang.code)}
          className={`px-2 py-1 rounded-md border transition-colors ${
            i18n.language === lang.code
              ? 'border-[#5D8CC9] text-[#5D8CC9] bg-white'
              : 'border-[#D5C5BD] text-[#3F3F3F] hover:border-[#5D8CC9]'
          }`}
          aria-pressed={i18n.language === lang.code}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}



