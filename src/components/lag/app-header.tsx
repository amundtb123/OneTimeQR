import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../utils/auth-context';
import { AuthButton } from '../auth-button';
import { LanguageSwitcher } from '../language-switcher';
import { CoinShop } from '../coin-shop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

type Section = 'create' | 'keyring' | null;

interface AppHeaderProps {
  section: Section; // null on pages outside the two tabs (scan, terms, …)
  keyCount: number;
  showNav: boolean;
  onNavigate: (section: 'create' | 'keyring') => void;
}

export function AppHeader({ section, keyCount, showNav, onNavigate }: AppHeaderProps) {
  const { t } = useTranslation();
  const { user, coins } = useAuth();
  const [shopOpen, setShopOpen] = useState(false);

  return (
    <header className="lg-header">
      <div className="lg-wrap lg-header-row">
        <div className="lg-header-left">
          <button type="button" className="lg-brand" onClick={() => onNavigate('create')}>
            <span className="lg-mark" aria-hidden="true"><span /><span /><span /><span /></span>
            {t('common.appName')}
          </button>
          {showNav && (
            <nav className="lg-nav" aria-label={t('common.appName')}>
              <button type="button" aria-current={section === 'create' ? 'page' : undefined} onClick={() => onNavigate('create')}>
                {t('nav.create')}
              </button>
              <button type="button" aria-current={section === 'keyring' ? 'page' : undefined} onClick={() => onNavigate('keyring')}>
                {t('nav.keyring', { count: keyCount })}
              </button>
            </nav>
          )}
        </div>
        <div className="lg-header-right">
          {showNav && user && (
            <button type="button" className="lg-coins" onClick={() => setShopOpen(true)} title={t('nav.buyCoins')}>
              {t('nav.coins', { count: coins ?? 0 })}
            </button>
          )}
          <LanguageSwitcher />
          {showNav && <AuthButton />}
        </div>
      </div>

      <Dialog open={shopOpen} onOpenChange={setShopOpen}>
        <DialogContent className="bg-white" style={{ borderRadius: 0 }}>
          <DialogHeader>
            <DialogTitle>{t('nav.buyCoins')}</DialogTitle>
          </DialogHeader>
          <CoinShop />
        </DialogContent>
      </Dialog>
    </header>
  );
}
