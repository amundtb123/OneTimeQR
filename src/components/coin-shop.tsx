import { Coins, Plus, Star } from 'lucide-react';
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
    <div className="flex items-center gap-3">
      {/* Your Coins - White card with shadow */}
      <Card className="p-4 bg-white border-gray-200 shadow-sm flex items-center gap-3 flex-1">
        <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Coins className="size-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-600 mb-0.5">{t('coins.yourCoins')}</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-gray-900">
              {user ? (coins !== null ? coins : '0') : '—'}
            </p>
            <Star className="size-4 text-indigo-400 fill-indigo-400" />
          </div>
        </div>
      </Card>

      {/* Buy Coins Button - Purple gradient */}
      <Button
        onClick={handleBuyCoins}
        className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2 px-4 py-3 h-auto rounded-lg"
        disabled={false}
      >
        <Plus className="size-5" />
        <span className="font-semibold">{t('coins.buyCoins') || 'Kjøp mynter'}</span>
      </Button>
    </div>
  );
}


