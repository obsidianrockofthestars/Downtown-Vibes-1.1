import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://olyhirxdqcxmkgbziloj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9seWhpcnhkcWN4bWtnYnppbG9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMTY3NzYsImV4cCI6MjA4Njc5Mjc3Nn0.6hW38SSZVMZ2Ts4YiHMMqxTjZP4thO5oHLROH7TO254'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
