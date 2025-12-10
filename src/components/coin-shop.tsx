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
        console.log('🔐 User not logged in, attempting sign in...');
        await signInWithGoogle();
        // Wait a bit for auth to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        toast.success(t('common.loginSuccess') || 'Logget inn! Prøv å kjøp coins igjen.');
      } catch (error: any) {
        console.error('Error signing in:', error);
        toast.error(error.message || t('common.loginError'));
      }
      return;
    }

    try {
      console.log('💳 Creating checkout session for user:', user.id);
      const { url } = await createCheckoutSession();
      if (url) {
        console.log('✅ Checkout URL received, redirecting...');
        window.location.href = url;
      } else {
        toast.error(t('coins.checkoutError'));
      }
    } catch (error: any) {
      console.error('❌ Error creating checkout session:', error);
      const errorMessage = error?.message || error?.error || t('coins.checkoutError');
      toast.error(errorMessage);
      
      // If it's an auth error, suggest logging in again
      if (error?.status === 401 || errorMessage.includes('auth') || errorMessage.includes('Authentication')) {
        toast.error(t('coins.loginRequired') + ' - Prøv å logge ut og inn igjen.');
      }
    }
  };

  return (
    <Card className="p-2.5 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-100 rounded-lg">
            <Coins className="size-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-gray-600">{t('coins.yourCoins')}</p>
            <p className="text-lg font-bold text-indigo-600">
              {user ? (coins !== null ? coins : '0') : '—'}
            </p>
          </div>
        </div>
        <Button
          onClick={handleBuyCoins}
          className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold shadow-md hover:shadow-lg transition-all"
          size="sm"
          disabled={false}
        >
          <ShoppingCart className="size-4 mr-1.5" />
          <span className="text-sm">{t('coins.buy50Coins')}</span>
        </Button>
      </div>
    </Card>
  );
}


