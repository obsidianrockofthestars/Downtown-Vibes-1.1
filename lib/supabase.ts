import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL_RAW = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY_RAW = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const SUPABASE_URL = SUPABASE_URL_RAW || 'http://localhost';
const SUPABASE_ANON_KEY = SUPABASE_ANON_KEY_RAW || 'missing-anon-key';

if (!SUPABASE_URL_RAW || !SUPABASE_ANON_KEY_RAW) {
  // Important: do not throw here.
  // Expo Router needs to be able to evaluate route modules at build time.
  // Throwing during import can cause Expo Router to incorrectly report missing `default` exports.
  console.warn(
    'Supabase env vars missing — set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY'
  );
}

const isServerSideNoWindow = typeof window === 'undefined';

// On some Expo dev-server/web bundling paths, `window` isn't defined in the Node process.
// `@react-native-async-storage/async-storage` can crash in that environment if Supabase
// initializes auth immediately. Provide a safe storage implementation for those cases.
const noopStorage = {
  getItem: async (_key: string) => null as string | null,
  setItem: async (_key: string, _value: string) => {},
  removeItem: async (_key: string) => {},
};

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      // Native apps don't have `window`, so guard only for web/server-side bundling.
      storage:
        Platform.OS === 'web' && isServerSideNoWindow ? noopStorage : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
