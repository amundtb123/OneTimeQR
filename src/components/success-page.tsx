import { useEffect, useState } from 'react';
import { CheckCircle, Coins, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { useAuth } from '../utils/auth-context';
import { useTranslation } from 'react-i18next';

export function SuccessPage() {
  const { user, coins, refreshCoins } = useAuth();
  const { t } = useTranslation();
  const [isRefreshing, setIsRefreshing] = useState(true);

  useEffect(() => {
    // Refresh coins when page loads
    const refresh = async () => {
      if (user) {
        await refreshCoins();
        setIsRefreshing(false);
      } else {
        setIsRefreshing(false);
      }
    };
    refresh();
  }, [user, refreshCoins]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="mb-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="size-12 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {t('success.thankYou')}
          </h1>
          <p className="text-gray-600">
            {t('success.purchaseComplete')}
          </p>
        </div>

        <div className="bg-indigo-50 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Coins className="size-6 text-indigo-600" />
            <p className="text-sm text-gray-600">{t('coins.yourCoins')}</p>
          </div>
          <p className="text-3xl font-bold text-indigo-600">
            {isRefreshing ? '...' : (coins !== null ? coins : '—')}
          </p>
        </div>

        <Button
          onClick={() => {
            // Navigate to home
            window.location.href = '/';
          }}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <ArrowLeft className="size-4 mr-2" />
          {t('success.backToHome')}
        </Button>
      </Card>
    </div>
  );
}

