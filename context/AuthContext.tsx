import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User, UserIdentity } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { SSOProvider, UserRole } from '@/lib/types';
import { createURL } from 'expo-linking';

// Google Sign-In is intentionally NOT imported at the top of this file.
//
// The `@react-native-google-signin/google-signin` package evaluates a
// TurboModuleRegistry.getEnforcing('RNGoogleSignin') call at module-load
// time, which throws in Expo Go (where that native module isn't bundled).
// Importing it here would crash the app on boot in Expo Go — including
// screens that have nothing to do with Google.
//
// Instead, `loadGoogleSignIn()` in `app/(tabs)/login.tsx` lazy-requires the
// module and configures it on first call. This lets the rest of the app
// (map, filters, email auth, Apple SSO) run fine in Expo Go; only the
// Google button is gated on a real build (EAS dev client or production).

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, role?: UserRole) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  /**
   * Start the OAuth flow to attach an additional identity (Apple / Google /
   * Facebook) to the currently signed-in user. Requires an active session.
   *
   * Supabase also auto-links on its own whenever a user signs in with an OAuth
   * provider whose email matches an existing *email-verified* account — so
   * `linkIdentity` is only needed when:
   *   1. The user wants to add a provider from an authenticated "Account
   *      settings" screen (explicit user intent), or
   *   2. Auto-linking was blocked because the existing email was unverified,
   *      and the UI is recovering by asking the user to sign in with their
   *      password and then link the OAuth identity manually.
   *
   * Redirect URL is wired to the app's `vibeathon://login` deep link so the
   * auth response bounces back into the app.
   */
  linkIdentity: (provider: SSOProvider) => Promise<{ error: any }>;
  /**
   * Remove a previously linked OAuth identity from the current user. Supabase
   * requires the user to have at least 2 identities linked before any single
   * one can be unlinked (prevents account lock-out). If the provider is not
   * currently linked, returns an error immediately without hitting the API.
   */
  unlinkIdentity: (provider: SSOProvider) => Promise<{ error: any }>;
  /**
   * Fetch the list of identities currently linked to the signed-in user.
   * Thin wrapper around `supabase.auth.getUserIdentities()` — surfaced on the
   * context so account-settings UI doesn't need to import `supabase` directly.
   */
  getIdentities: () => Promise<{ identities: UserIdentity[]; error: any }>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  linkIdentity: async () => ({ error: null }),
  unlinkIdentity: async () => ({ error: null }),
  getIdentities: async () => ({ identities: [], error: null }),
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On cold boot Supabase tries to refresh any cached session. If the refresh
    // token is stale/revoked (common after a DB wipe, password change from
    // another device, or just long app inactivity) it surfaces as
    // `AuthApiError: Invalid Refresh Token: Refresh Token Not Found`.
    // That's not actionable for the user — just means they need to sign in
    // again. Swallow it quietly, clear the bad cached session, and drop into
    // the logged-out UI without leaking a red error banner in the console.
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          const msg = String(error?.message ?? '').toLowerCase();
          if (
            msg.includes('refresh token') ||
            msg.includes('invalid refresh')
          ) {
            try {
              await supabase.auth.signOut();
            } catch {
              /* ignore — storage may already be clear */
            }
            setSession(null);
          } else {
            console.warn('Auth getSession error:', error);
            setSession(null);
          }
        } else {
          setSession(data.session ?? null);
        }
      } catch (err: any) {
        // Network/storage failures shouldn't wedge boot.
        console.warn('Auth boot exception:', err?.message ?? err);
        setSession(null);
      } finally {
        setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, role: UserRole = 'customer') => {
    // Ensure the redirect URL matches the `scheme` in `app.config.js`.
    // Current scheme in this repo: `vibeathon`.
    const emailRedirectTo = createURL('login', { scheme: 'vibeathon' });

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role }, emailRedirectTo },
    });
    return { error };
  };

  const signOut = async () => {
    // Best-effort: revoke Google's cached credentials so the next Google
    // sign-in prompts for account selection fresh. Lazily require the
    // module so this doesn't crash in Expo Go (where the native module
    // isn't bundled). Silent on any failure — signOut should never throw
    // to the caller.
    try {
      const mod = require('@react-native-google-signin/google-signin');
      await mod?.GoogleSignin?.signOut?.();
    } catch {
      /* expected in Expo Go; ignore elsewhere */
    }
    await supabase.auth.signOut();
  };

  const linkIdentity = async (provider: SSOProvider) => {
    // `linkIdentity` opens the provider's OAuth consent screen. The returned
    // session after redirect back into the app carries the linked identity.
    // Mobile native SSO (Apple via AuthenticationServices / Google via the
    // Google SDK) can alternatively link by calling `signInWithIdToken` while
    // an existing session is present, but `linkIdentity` is the simpler and
    // officially documented path for "I'm already signed in, add a provider."
    const redirectTo = createURL('login', { scheme: 'vibeathon' });
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo },
    });
    return { error };
  };

  const unlinkIdentity = async (provider: SSOProvider) => {
    // Supabase's unlink expects the full identity object (not just the
    // provider string), so fetch the current identities first and match by
    // provider name. This also gives us a clean "not linked" error path
    // without a round-trip to the API when the provider isn't attached.
    const { data: identitiesData, error: fetchErr } =
      await supabase.auth.getUserIdentities();
    if (fetchErr) return { error: fetchErr };
    const identities = identitiesData?.identities ?? [];
    const target = identities.find((i) => i.provider === provider);
    if (!target) {
      return {
        error: {
          message: `No ${provider} identity is linked to this account.`,
          code: 'identity_not_linked',
        },
      };
    }
    // Guard against locking the user out: Supabase only allows unlinking when
    // at least 2 identities exist. Surface a friendly error instead of the
    // raw API response so the UI can show a clear message.
    if (identities.length < 2) {
      return {
        error: {
          message:
            "You can't remove the only sign-in method on your account. Add another sign-in method first.",
          code: 'last_identity',
        },
      };
    }
    const { error } = await supabase.auth.unlinkIdentity(target);
    return { error };
  };

  const getIdentities = async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    return { identities: data?.identities ?? [], error };
  };

  const user = session?.user ?? null;
  const role = (user?.user_metadata?.role as UserRole) ?? null;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        role,
        loading,
        signIn,
        signUp,
        signOut,
        linkIdentity,
        unlinkIdentity,
        getIdentities,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
