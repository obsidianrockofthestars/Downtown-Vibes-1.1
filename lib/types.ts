export interface Business {
  id: string;
  place_id: string | null;
  google_place_id?: string | null;
  owner_id: string;
  business_name: string;
  history_fact?: string | null;
  flash_sale: string | null;
  emoji_icon: string | null;
  is_active: boolean;
  latitude: number;
  longitude: number;
  static_latitude?: number | null;
  static_longitude?: number | null;
  is_traveling_active?: boolean;
  account_tier?: 'single' | 'dual';
  business_type: string;
  menu_link: string | null;
  website: string | null;
  description: string | null;
  is_pin_locked?: boolean | null;
  pin_lock_password?: string | null;
}

export interface VibeCheck {
  id: string;
  created_at: string;
  business_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
}

// 1.6.0 Downtown Feed — business-side post.
// See wiki/downtown-feed-spec.md and wiki/downtown-feed-build-plan.md.
// `business_id` is text to match the actual `businesses.id` type (not uuid).
export type PostType =
  | 'event'
  | 'vibe'
  | 'update'
  | 'employee'
  | 'announcement';

export interface Post {
  id: string;
  business_id: string;
  author_user_id: string | null;
  post_type: PostType;
  title: string | null;
  body: string;
  photo_url: string | null;
  event_at: string | null;
  is_pinned: boolean;
  pinned_until: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  hidden_for_moderation: boolean;
  // Joined business fields (not always present — depends on the SELECT)
  business_name?: string;
  emoji_icon?: string | null;
}

export interface PostReaction {
  post_id: string;
  user_id: string;
  reaction: 'heart';
  created_at: string;
}

export type UserRole = 'owner' | 'customer';

// Third-party SSO providers we support. Keep this list in sync with the
// provider-enabled list in the Supabase dashboard (Authentication → Providers)
// and the client-side Apple/Google/Facebook SDKs in Tracks 2.3/2.4/2.7.
//
// Note: `linkIdentity`/`unlinkIdentity` in `AuthContext` accept this union so
// SSO screens can pass provider names directly without string-literal drift.
export type SSOProvider = 'apple' | 'google' | 'facebook';

// Detect the Supabase auto-link collision. Happens when a user signs in with
// an OAuth provider whose email matches an existing account that has NOT been
// email-verified — Supabase refuses to auto-link (prevents pre-account
// takeover) and returns an error. When this fires, the client should prompt
// the user to sign in with their existing password first, then call
// `linkIdentity(provider)` to attach the OAuth identity to the confirmed
// session.
//
// Source: https://supabase.com/docs/guides/auth/auth-identity-linking
export function isAutoLinkCollisionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { message?: unknown; status?: unknown; code?: unknown };
  const msg = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  const code = typeof err.code === 'string' ? err.code.toLowerCase() : '';
  // Supabase surfaces this as a 422 / 400 with a message along the lines of
  // "user already registered" or "identity is already linked to another user".
  return (
    msg.includes('already registered') ||
    msg.includes('already linked to another user') ||
    msg.includes('identity is already linked') ||
    msg.includes('email address is already in use') ||
    code === 'identity_already_exists' ||
    code === 'email_exists'
  );
}
