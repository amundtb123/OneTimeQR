import { useEffect, useState } from 'react';
import { CheckCircle, Coins, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { useAuth } from '../utils/auth-context';
import { useTranslation } from 'react-i18next';

export function SuccessPage() {
  const { user, coins, refreshCoins, loading: authLoading, session } = useAuth();
  const { t } = useTranslation();
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [canNavigate, setCanNavigate] = useState(false);
  const [hasStartedRefresh, setHasStartedRefresh] = useState(false);

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
  }, []);

  // Wait for auth to be ready before starting refresh
  useEffect(() => {
    // Don't start refresh until auth is loaded
    if (authLoading) {
      console.log('⏳ Waiting for auth to load...');
      return;
    }

    // If we've already started refresh, don't start again
    if (hasStartedRefresh) {
      return;
    }

    // Refresh coins when user is logged in, with retry logic
    const refresh = async () => {
      if (!user) {
        console.warn('⚠️ No user logged in on success page - waiting for login...');
        // Wait a bit more in case user is logging in
        setTimeout(() => {
          if (!user) {
            console.warn('⚠️ Still no user after wait - cannot refresh coins');
            setIsRefreshing(false);
            setCanNavigate(true);
          }
        }, 2000);
        return;
      }

      setHasStartedRefresh(true);

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
                  // Force refresh to update coins state
                  await refreshCoins();
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
  }, [user, refreshCoins, coins, authLoading, hasStartedRefresh]);

  // Also listen for auth state changes to trigger refresh when user logs in
  useEffect(() => {
    if (user && !hasStartedRefresh && !authLoading) {
      console.log('👤 User logged in, starting coin refresh...');
      setHasStartedRefresh(true);
      
      // Start refresh after a short delay
      setTimeout(async () => {
        const maxAttempts = 10;
        const delayMs = 2000;
        let attempts = 0;
        let lastCoinsValue = coins;

        const tryRefresh = async () => {
          attempts++;
          console.log(`🔄 Refreshing coins (attempt ${attempts}/${maxAttempts})...`);
          console.log(`💰 Previous coins value: ${lastCoinsValue}`);
          
          try {
            await refreshCoins();
            
            // Wait a bit for state to update
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
                    // Force refresh to update coins state
                    await refreshCoins();
                  }
                }
              } else {
                const dbCoins = profileData?.coins ?? 0;
                console.log(`💰 Database coins value: ${dbCoins}`);
                console.log(`💰 Context coins value: ${coins}`);
                
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
            
            // After first successful refresh, allow navigation
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

        // Start first attempt after delay to let webhook process
        setTimeout(tryRefresh, 3000);
      }, 500);
    }
  }, [user, hasStartedRefresh, authLoading, refreshCoins, coins]);

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

  const coinsDisplay = !user 
    ? 'Logg inn' 
    : isRefreshing 
      ? null // Will show loading message instead
      : coins !== null 
        ? coins 
        : 0; // Show 0 instead of "—"

  const isComplete = !isRefreshing && coins !== null && user;

  return (
    <div className="min-h-screen flex items-start justify-center px-4 pt-16 sm:pt-24">
      <Card className="max-w-md w-full p-8 text-center">
        {/* Waiting message at top */}
        {isRefreshing && (
          <p className="text-sm text-gray-500 mb-6">
            {t('success.waitingForCoins') || 'Venter på at coins skal oppdateres...'}
          </p>
        )}

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

        {/* Coins display - always show a number */}
        <div className="bg-indigo-50 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Coins className="size-6 text-indigo-600" />
            <p className="text-sm text-gray-600">{t('coins.yourCoins')}</p>
          </div>
          {isRefreshing ? (
            <p className="text-3xl font-bold text-indigo-600 animate-pulse">
              {coins !== null ? coins : 0}
            </p>
          ) : (
            <p className="text-3xl font-bold text-indigo-600">
              {coinsDisplay}
            </p>
          )}
          {isComplete && (
            <p className="text-sm text-indigo-600 mt-2 font-medium">
              Ny total: {coins} coins
            </p>
          )}
        </div>

        {/* OK button - only show when complete */}
        {isComplete ? (
          <Button
            onClick={handleGoHome}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3"
          >
            OK
          </Button>
        ) : (
          <Button
            disabled
            className="w-full bg-gray-300 text-gray-500 cursor-not-allowed font-semibold py-3"
          >
            {t('success.processing') || 'Behandler...'}
          </Button>
        )}
      </Card>
    </div>
  );
}


