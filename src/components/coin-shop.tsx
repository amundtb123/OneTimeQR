import { Coins, ShoppingCart } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { useAuth } from '../utils/auth-context';
import { createCheckoutSession } from '../utils/api-client';
import { toast } from 'sonner@2.0.3';
import { useTranslation } from 'react-i18next';

export function CoinShop() {
  const { user, coins, signInWithGoogle } = useAuth();
  const { t } = useTranslation();

  const handleBuyCoins = async () => {
    if (!user) {
      toast.error(t('coins.loginRequired'));
      try {
        await signInWithGoogle();
      } catch (error) {
        console.error('Error signing in:', error);
      }
      return;
    }

    try {
      const { url } = await createCheckoutSession();
      if (url) {
        window.location.href = url;
      }
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      toast.error(error.message || t('coins.checkoutError'));
    }
  };

  return (
    <Card className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Coins className="size-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">{t('coins.yourCoins')}</p>
            <p className="text-2xl font-bold text-indigo-600">
              {user ? (coins !== null ? coins : '...') : '—'}
            </p>
          </div>
        </div>
        <Button
          onClick={handleBuyCoins}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md hover:shadow-lg transition-all"
          size="default"
        >
          <ShoppingCart className="size-4 mr-2" />
          <span className="font-semibold">{t('coins.buy50Coins')}</span>
        </Button>
      </div>
    </Card>
  );
}
