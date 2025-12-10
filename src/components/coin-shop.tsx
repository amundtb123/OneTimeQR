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
      <Card className="p-3 bg-white border-gray-200 shadow-sm flex items-center gap-2.5 flex-shrink-0">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Coins className="size-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-600 mb-0.5 leading-tight">{t('coins.yourCoins')}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-xl font-bold text-gray-900 leading-tight">
              {user ? (coins !== null ? coins : '0') : '—'}
            </p>
            <Star className="size-3.5 text-indigo-400 fill-indigo-400" />
          </div>
        </div>
      </Card>

      {/* Buy Coins Button - SOLID BLUE with info */}
      <Button
        onClick={handleBuyCoins}
        className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold shadow-md hover:shadow-lg transition-all flex flex-col items-center justify-center px-4 py-2.5 h-auto rounded-lg border-0"
        disabled={false}
        style={{
          backgroundColor: '#2563eb',
          minWidth: '140px',
        }}
      >
        <div className="flex items-center gap-1.5">
          <Plus className="size-4" style={{ color: '#ffffff' }} />
          <span className="font-semibold text-sm" style={{ color: '#ffffff' }}>{t('coins.buyCoins') || 'Kjøp mynter'}</span>
        </div>
        <span className="text-xs font-medium mt-0.5" style={{ color: '#ffffff', opacity: 0.95 }}>50 coins • 29 kr</span>
      </Button>
    </div>
  );
}


