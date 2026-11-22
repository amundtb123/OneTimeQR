// Local development without Supabase: `npm run dev:local` points the app at the Edge Function
// running on this machine (tests/edge-function/dev-server.mjs) and logs in as its dev user.
// Unset in every other build, so none of this changes how the real app behaves.
import type { Session, User } from '@supabase/supabase-js';

export const LOCAL_API: string | undefined = import.meta.env.VITE_LOCAL_API || undefined;

// Must match DEV_USER_ID and DEV_TOKEN in tests/edge-function/dev-server.mjs
const DEV_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const DEV_TOKEN = 'local-dev-token';

export const devUser = { id: DEV_USER_ID, email: 'dev@localhost', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' } as unknown as User;
export const devSession = { access_token: DEV_TOKEN, user: devUser } as unknown as Session;

export async function devCoins(): Promise<number> {
  const res = await fetch(`${LOCAL_API}/dev/coins`);
  return (await res.json()).coins;
}
