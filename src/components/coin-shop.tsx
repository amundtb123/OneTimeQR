import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner@2.0.3';
import { useAuth } from '../utils/auth-context';
import { createCheckoutSession } from '../utils/api-client';
import { PLUSS_PRICE_KR, SALDO_PACKAGES, saldoKr } from '../utils/create-drop';

// Tops up the balance through Stripe Checkout. The balance counts Pluss keys of PLUSS_PRICE_KR each.
export function CoinShop() {
  const { user, coins, signInWithGoogle } = useAuth();
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);

  const buy = async (pkg: string) => {
    if (!user) {
      signInWithGoogle().catch(() => toast.error(t('common.loginError')));
      return;
    }
    setBusy(pkg);
    try {
      const { url } = await createCheckoutSession(pkg);
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error(t('coins.checkoutError'));
    } catch (error: any) {
      console.error('❌ Error creating checkout session:', error?.message);
      toast.error(error?.status === 401 ? t('coins.loginRequired') : t('coins.checkoutError'));
    }
    setBusy(null);
  };

  return (
    <div className="lg-stack" style={{ gap: 14 }}>
      {user && coins !== null && (
        <div>
          <div className="lg-small lg-muted">{t('coins.balance')}</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{t('coins.kr', { kr: saldoKr(coins) })}</div>
        </div>
      )}
      <p className="lg-small lg-muted" style={{ margin: 0 }}>{t('coins.explain', { kr: PLUSS_PRICE_KR })}</p>
      <div className="lg-grid-2">
        {SALDO_PACKAGES.map((pkg) => (
          <button key={pkg.id} type="button" className="lg-btn" disabled={busy !== null} onClick={() => buy(pkg.id)} style={{ flexDirection: 'column', gap: 2 }}>
            <strong>{t('coins.topUp', { kr: pkg.kr })}</strong>
            <span className="lg-xs lg-muted">{t('coins.keys', { count: pkg.kr / PLUSS_PRICE_KR })}</span>
          </button>
        ))}
      </div>
      {!user && <p className="lg-small lg-muted" style={{ margin: 0 }}>{t('coins.loginRequired')}</p>}
    </div>
  );
}
