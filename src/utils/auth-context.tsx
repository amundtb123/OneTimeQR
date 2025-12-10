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
      const { data, error } = await supabase
        .from('user_profiles')
        .select('coins')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('❌ Error fetching coins:', error);
        // If profile doesn't exist, create it with 0 coins
        if (error.code === 'PGRST116') {
          console.log('📝 Creating new user profile with 0 coins...');
          const { error: insertError } = await supabase
            .from('user_profiles')
            .insert({ id: userId, coins: 0 });
          if (!insertError) {
            setCoins(0);
            console.log('✅ Created profile with 0 coins');
          } else {
            console.error('❌ Error creating profile:', insertError);
          }
        }
        return;
      }
      
      const newCoins = data?.coins ?? 0;
      console.log('💰 Fetched coins:', newCoins, '(previous:', coins, ')');
      setCoins(newCoins);
    } catch (error) {
      console.error('❌ Exception fetching coins:', error);
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
        // Wait a bit for Supabase to process the callback
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Force getSession after callback processing
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('❌ Error getting session after callback:', error);
        } else if (session) {
          console.log('✅ Session found after OAuth callback');
          await updateSession(session);
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
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
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        console.log('✅ User signed in or token refreshed');
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
      }
      
      await updateSession(session);
      
      // Clean up OAuth callback URL if present
      if (event === 'SIGNED_IN') {
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
      await fetchUserCoins(user.id);
      console.log('💰 Coins refreshed, current balance:', coins);
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