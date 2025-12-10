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
  const [canNavigate, setCanNavigate] = useState(false);

  useEffect(() => {
    // Clean up session_id from URL if present (Stripe redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    if (sessionId) {
      console.log('🎫 Stripe session_id detected:', sessionId);
      // Remove session_id from URL but keep the page
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }

    // Refresh coins when page loads, with retry logic
    const refresh = async () => {
      if (!user) {
        console.warn('⚠️ No user logged in on success page - cannot refresh coins');
        setIsRefreshing(false);
        setCanNavigate(true);
        return;
      }

      console.log('👤 User logged in:', user.id, user.email);
      console.log('💰 Current coins state:', coins);

      // Webhook can take a few seconds to process, so retry multiple times
      let attempts = 0;
      const maxAttempts = 10; // Increased to 10 attempts (20 seconds total)
      const delayMs = 2000; // 2 seconds between attempts
      let lastCoinsValue = coins;

      const tryRefresh = async () => {
        attempts++;
        console.log(`🔄 Refreshing coins (attempt ${attempts}/${maxAttempts})...`);
        console.log(`💰 Previous coins value: ${lastCoinsValue}`);
        
        try {
          await refreshCoins();
          
          // Wait a bit for state to update, then check again
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Force a direct database query to verify coins
          const { supabase } = await import('../utils/supabase-client');
          
          // Get current session to ensure we have auth token
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (!currentSession) {
            console.error('❌ No active session - cannot fetch coins');
            if (attempts >= 3) {
              setIsRefreshing(false);
              setCanNavigate(true);
              return;
            }
          } else {
            console.log('✅ Active session found, fetching coins...');
            
            const { data: profileData, error: profileError } = await supabase
              .from('user_profiles')
              .select('coins')
              .eq('id', user.id)
              .single();
            
            if (profileError) {
              console.error('❌ Error fetching coins directly:', profileError);
              console.error('❌ Error code:', profileError.code);
              console.error('❌ Error message:', profileError.message);
              console.error('❌ Error details:', profileError);
              
              // If it's a permission error, try to create profile
              if (profileError.code === 'PGRST116' || profileError.message?.includes('permission') || profileError.message?.includes('policy')) {
                console.log('📝 Profile might not exist or RLS issue, trying to create...');
                const { error: insertError } = await supabase
                  .from('user_profiles')
                  .insert({ id: user.id, coins: 0 });
                if (insertError) {
                  console.error('❌ Failed to create profile:', insertError);
                } else {
                  console.log('✅ Created profile with 0 coins');
                  setCoins(0);
                }
              }
            } else {
              const dbCoins = profileData?.coins ?? 0;
              console.log(`💰 Database coins value: ${dbCoins}`);
              console.log(`💰 Context coins value: ${coins}`);
              
              // Update coins state if we got a value
              if (dbCoins !== coins) {
                console.log(`🔄 Updating coins state from ${coins} to ${dbCoins}`);
                // Force update via refreshCoins which will update state
              }
              
              // If coins changed, we're done
              if (dbCoins > 0 && dbCoins !== lastCoinsValue) {
                console.log(`✅ Coins updated! New balance: ${dbCoins}`);
                setIsRefreshing(false);
                setCanNavigate(true);
                return;
              }
              
              lastCoinsValue = dbCoins;
            }
          }
          
          // After first successful refresh, allow navigation (even if coins not updated yet)
          if (attempts === 1) {
            setCanNavigate(true);
          }
        } catch (error) {
          console.error('❌ Error refreshing coins:', error);
        }

        // If we haven't reached max attempts, schedule next retry
        if (attempts < maxAttempts) {
          setTimeout(tryRefresh, delayMs);
        } else {
          setIsRefreshing(false);
          setCanNavigate(true);
          console.log('✅ Finished refreshing coins (max attempts reached)');
          console.log(`💰 Final coins value: ${coins}`);
        }
      };

      // Start first attempt after a short delay to let webhook process
      // Webhook usually takes 2-5 seconds to process
      setTimeout(tryRefresh, 3000);
    };
    
    refresh();
  }, [user, refreshCoins, coins]);

  const handleGoHome = () => {
    // Update URL and trigger navigation
    window.history.pushState({}, '', '/');
    // Trigger popstate event to update view
    window.dispatchEvent(new PopStateEvent('popstate'));
    // Also force a small delay to ensure state updates
    setTimeout(() => {
      // Fallback: full reload if navigation didn't work
      if (window.location.pathname === '/success') {
        window.location.href = '/';
      }
    }, 100);
  };

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
            {!user ? (
              <span className="text-gray-400">Logg inn</span>
            ) : isRefreshing ? (
              <span className="animate-pulse">...</span>
            ) : coins !== null ? (
              coins
            ) : (
              '—'
            )}
          </p>
          {user && coins === null && !isRefreshing && (
            <p className="text-xs text-gray-500 mt-1">
              Kunne ikke hente coins. Prøv å refreshe siden.
            </p>
          )}
        </div>

        <Button
          onClick={handleGoHome}
          disabled={!canNavigate}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="size-4 mr-2" />
          {canNavigate ? t('success.backToHome') : t('success.processing') || 'Behandler...'}
        </Button>
        
        {!canNavigate && (
          <p className="text-sm text-gray-500 mt-2">
            {t('success.waitingForCoins') || 'Venter på at coins skal oppdateres...'}
          </p>
        )}
      </Card>
    </div>
  );
}


