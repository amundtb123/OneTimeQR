import { useTranslation } from 'react-i18next';
import { availableLanguages, setAppLanguage } from '../i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const currentLanguage = availableLanguages.find(lang => lang.code === i18n.language) || availableLanguages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-[#D5C5BD] text-[#3F3F3F] hover:border-[#5D8CC9] transition-colors text-sm bg-white"
          aria-label={t('common.language')}
        >
          <span>{currentLanguage.label}</span>
          <ChevronDown className="size-3.5 text-[#5B5B5B]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-32 rounded-xl border-[#D5C5BD] bg-white" 
        align="end"
        style={{ boxShadow: '0 8px 24px rgba(63, 63, 63, 0.12)' }}
      >
        {availableLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setAppLanguage(lang.code)}
            className={`cursor-pointer text-[#3F3F3F] hover:bg-[#E8DCD4] rounded-lg focus:bg-[#E8DCD4] ${
              i18n.language === lang.code ? 'bg-[#E8DCD4] text-[#5D8CC9] font-medium' : ''
            }`}
          >
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}



