import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase-client';
import { updateCachedToken } from './api-client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  coins: number | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshCoins: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [coins, setCoins] = useState<number | null>(null);

  const fetchUserCoins = async (userId: string) => {
    try {
      console.log('💰 Fetching coins for user:', userId);
      
      // Ensure we have a valid session with timeout
      let currentSession = null;
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session timeout')), 3000)
        );
        const result = await Promise.race([sessionPromise, timeoutPromise]) as any;
        if (result?.data?.session) {
          currentSession = result.data.session;
        } else if (result?.error) {
          throw result.error;
        }
      } catch (sessionErr: any) {
        console.warn('⚠️ Session fetch timeout or error, using existing session:', sessionErr?.message);
        // Use existing session from state if available
        if (session) {
          currentSession = session;
          console.log('✅ Using existing session from state');
        } else {
          console.error('❌ No valid session available for fetching coins');
          return;
        }
      }
      
      if (!currentSession) {
        console.error('❌ No valid session for fetching coins');
        return;
      }
      console.log('✅ Session valid, proceeding with coin fetch');
      
      console.log('📡 Making Supabase query to user_profiles...');
      const { data, error } = await supabase
        .from('user_profiles')
        .select('coins')
        .eq('id', userId)
        .single();
      
      console.log('📡 Query completed. Data:', data, 'Error:', error);
      
      if (error) {
        console.error('❌ Error fetching coins:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        
        // If profile doesn't exist, create it; the database gives it the start balance
        if (error.code === 'PGRST116') {
          console.log('📝 Creating new user profile...');
          const { data: created, error: insertError } = await supabase
            .from('user_profiles')
            .insert({ id: userId })
            .select('coins')
            .single();
          if (!insertError) {
            setCoins(created?.coins ?? 0);
            console.log('✅ Created profile');
          } else {
            console.error('❌ Error creating profile:', insertError);
            console.error('❌ Insert error details:', JSON.stringify(insertError, null, 2));
          }
        }
        return;
      }
      
      const newCoins = data?.coins ?? 0;
      console.log('💰 Fetched coins successfully:', newCoins, '(previous:', coins, ')');
      console.log('💰 Full profile data:', JSON.stringify(data, null, 2));
      setCoins(newCoins);
    } catch (error) {
      console.error('❌ Exception fetching coins:', error);
      console.error('❌ Exception details:', JSON.stringify(error, null, 2));
    }
  };

  useEffect(() => {
    // Helper to update session and cache token
    const updateSession = async (session: Session | null) => {
      console.log('🔄 Updating session:', session ? `User: ${session.user.email}` : 'No session');
      setSession(session);
      setUser(session?.user ?? null);
      
      // Update cached token for API calls
      if (session?.access_token) {
        const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000;
        updateCachedToken(session.access_token, expiresAt);
        console.log('✅ Cached access token updated');
      } else {
        updateCachedToken(null, 0);
        console.log('⚠️ No access token in session');
      }
      
      if (session?.user) {
        await fetchUserCoins(session.user.id);
      } else {
        setCoins(null);
      }
    };

    // Check for OAuth callback in URL first
    const checkOAuthCallback = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const searchParams = new URLSearchParams(window.location.search);
      
      const hasAccessToken = hashParams.has('access_token') || searchParams.has('access_token');
      const hasCode = hashParams.has('code') || searchParams.has('code');
      
      if (hasAccessToken || hasCode) {
        console.log('🔐 OAuth callback detected in URL, waiting for Supabase to process...');
        
        // With PKCE flow, Supabase needs to exchange the code for a session
        // detectSessionInUrl: true should handle this, but we need to wait for it
        // Use a Promise that resolves when onAuthStateChange fires with SIGNED_IN
        return new Promise<void>((resolve) => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.warn('⚠️ OAuth callback timeout - trying getSession anyway');
              supabase.auth.getSession().then(({ data: { session }, error }) => {
                if (!error && session) {
                  updateSession(session);
                  window.history.replaceState({}, document.title, window.location.pathname);
                }
                resolve();
              });
            }
          }, 5000); // 5 second timeout
          
          // Listen for auth state change - this should fire when Supabase processes the callback
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session && !resolved) {
              resolved = true;
              clearTimeout(timeout);
              console.log('✅ SIGNED_IN event received after OAuth callback!');
              await updateSession(session);
              window.history.replaceState({}, document.title, window.location.pathname);
              subscription.unsubscribe();
              resolve();
            } else if (event === 'TOKEN_REFRESHED' && session && !resolved) {
              resolved = true;
              clearTimeout(timeout);
              console.log('✅ TOKEN_REFRESHED event received');
              await updateSession(session);
              window.history.replaceState({}, document.title, window.location.pathname);
              subscription.unsubscribe();
              resolve();
            }
          });
        });
      }
    };

    // Initial session check
    const initializeAuth = async () => {
      await checkOAuthCallback();
      
      // Then check for existing session
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('❌ Error getting initial session:', error);
        }
        await updateSession(session);
      } catch (error) {
        console.error('❌ Failed to get initial session:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes (including OAuth callbacks)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔔 Auth state changed:', event, session ? `User: ${session.user?.email}` : 'No session');
      
      // Handle token refresh errors gracefully
      if (event === 'TOKEN_REFRESHED') {
        if (session) {
          console.log('✅ Token refreshed successfully');
          await updateSession(session);
        } else {
          console.warn('⚠️ TOKEN_REFRESHED event but no session - token refresh may have failed');
          // Try to get session manually
          try {
            const { data: { session: newSession }, error } = await supabase.auth.getSession();
            if (error) {
              console.error('❌ Error getting session after token refresh:', error);
              // If refresh failed, user might need to sign in again
              if (error.message?.includes('refresh token') || error.message?.includes('Invalid refresh token')) {
                console.warn('⚠️ Refresh token invalid - clearing session, user may need to sign in again');
                await updateSession(null);
              }
            } else if (newSession) {
              console.log('✅ Recovered session after token refresh');
              await updateSession(newSession);
            } else {
              console.warn('⚠️ No session available after token refresh');
              await updateSession(null);
            }
          } catch (err) {
            console.error('❌ Exception getting session after token refresh:', err);
            await updateSession(null);
          }
        }
      } else if (event === 'SIGNED_IN') {
        console.log('✅ User signed in');
        await updateSession(session);
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
        await updateSession(null);
      } else if (event === 'INITIAL_SESSION') {
        await updateSession(session);
      }
      
      // Clean up OAuth callback URL if present
      if (event === 'SIGNED_IN' && session) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const searchParams = new URLSearchParams(window.location.search);
        if (hashParams.has('access_token') || searchParams.has('access_token') || 
            hashParams.has('code') || searchParams.has('code')) {
          setTimeout(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
          }, 100);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshCoins = async () => {
    if (user) {
      console.log('💰 Refreshing coins for user:', user.id);
      
      // Ensure we have a valid session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        console.error('❌ No active session for refreshCoins');
        return;
      }
      
      await fetchUserCoins(user.id);
      
      // Force a re-render by checking coins again after a short delay
      setTimeout(async () => {
        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('coins')
            .eq('id', user.id)
            .single();
          
          if (error) {
            console.error('❌ Error in refreshCoins timeout:', error);
            if (error.code === 'PGRST116') {
              // Profile doesn't exist, create it
              const { data: created, error: insertError } = await supabase
                .from('user_profiles')
                .insert({ id: user.id })
                .select('coins')
                .single();
              if (!insertError) {
                setCoins(created?.coins ?? 0);
                console.log('✅ Created profile in refreshCoins');
              }
            }
          } else if (data) {
            console.log('💰 Final coins balance:', data.coins);
            setCoins(data.coins ?? 0);
          }
        } catch (err) {
          console.error('❌ Exception in refreshCoins timeout:', err);
        }
      }, 500);
    } else {
      console.warn('⚠️ Cannot refresh coins: no user logged in');
    }
  };

  const signInWithGoogle = async () => {
    console.log('🔐 Starting Google OAuth sign in...');
    console.log('🔗 Redirect URL will be:', `${window.location.origin}/`);
    
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          skipBrowserRedirect: false,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      
      if (error) {
        console.error('❌ Error signing in with Google:', error);
        throw error;
      }
      
      console.log('✅ OAuth redirect initiated:', data);
      // Note: User will be redirected to Google, then back to the app
    } catch (error) {
      console.error('❌ Sign in failed:', error);
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, coins, signInWithGoogle, signOut, refreshCoins }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}