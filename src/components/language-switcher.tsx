import { useTranslation } from 'react-i18next';
import { availableLanguages, setAppLanguage } from '../i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLang = availableLanguages.find(lang => lang.code === i18n.language) || availableLanguages[0];

  return (
    <Select value={i18n.language} onValueChange={setAppLanguage}>
      <SelectTrigger className="h-8 w-auto min-w-[80px] px-2 text-xs border-[#D5C5BD] bg-white">
        <Globe className="size-3 mr-1" />
        <SelectValue>{currentLang.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {availableLanguages.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}



