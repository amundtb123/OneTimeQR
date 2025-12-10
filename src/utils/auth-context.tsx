import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase-client';

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
      const { data, error } = await supabase
        .from('user_profiles')
        .select('coins')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching coins:', error);
        // If profile doesn't exist, create it with 0 coins
        if (error.code === 'PGRST116') {
          const { error: insertError } = await supabase
            .from('user_profiles')
            .insert({ id: userId, coins: 0 });
          if (!insertError) {
            setCoins(0);
          }
        }
        return;
      }
      
      setCoins(data?.coins ?? 0);
    } catch (error) {
      console.error('Error fetching coins:', error);
    }
  };

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserCoins(session.user.id);
      } else {
        setCoins(null);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserCoins(session.user.id);
      } else {
        setCoins(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshCoins = async () => {
    if (user) {
      await fetchUserCoins(user.id);
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