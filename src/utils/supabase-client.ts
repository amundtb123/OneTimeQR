import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './supabase/info';

// Singleton Supabase client to avoid multiple GoTrueClient instances
export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
  {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      // Add error handling for token refresh
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      storageKey: 'sb-auth-token',
    },
    global: {
      // Add retry logic for failed requests
      fetch: (url, options = {}) => {
        return fetch(url, {
          ...options,
          // Don't retry on 401 - let auth system handle it
          retry: (retryCount, error) => {
            if (error?.status === 401) {
              return false; // Don't retry 401 errors
            }
            return retryCount < 2; // Retry other errors up to 2 times
          }
        });
      }
    }
  }
);