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
    }
  }
);