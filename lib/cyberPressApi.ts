// 1.7.0 — RPC client for the Cyber Press curator application flow.
//
// Backend reference: Supabase migration `cyber_press_apply_rpc` deployed
// 2026-04-27 (see wiki/path-c-web-v1.md). The RPC is granted to anon +
// authenticated, validates inputs server-side, and rate-limits to one
// pending application per email.

import { supabase } from './supabase';

export interface CyberPressApplicationInput {
  email: string;
  displayName: string;
  bio: string;
  socialHandle?: string | undefined;
}

export interface CyberPressApplicationResult {
  applicationId: string;
  /** First 8 chars of the uuid — used as a friendly reference code in success UI */
  shortRef: string;
}

/**
 * Submit a Cyber Press curator application. Returns the application uuid
 * (and a short reference) on success.
 *
 * Throws an Error with a user-friendly message on validation or server failure.
 * Callers should display `err.message` directly in the form's error state.
 */
export async function applyForCyberPress(
  input: CyberPressApplicationInput,
): Promise<CyberPressApplicationResult> {
  // Client-side validation — server is the truth, but instant feedback for UX.
  const email = input.email.trim();
  const displayName = input.displayName.trim();
  const bio = input.bio.trim();
  const socialHandle = input.socialHandle?.trim() || undefined;

  if (!email) throw new Error('Please enter a valid email address.');
  if (!isValidEmail(email)) throw new Error('That email address looks off — double-check it.');
  if (!displayName) throw new Error("Pick a display name — this is what curators show up as on the feed.");
  if (bio.length < 20) throw new Error('Tell us a little more about yourself — at least 20 characters.');

  const { data, error } = await supabase.rpc('apply_for_cyber_press', {
    p_email: email,
    p_display_name: displayName,
    p_bio: bio,
    p_social_handle: socialHandle ?? null,
  });

  if (error) {
    // The RPC raises with friendly messages; surface them as-is.
    // PostgREST wraps RAISE EXCEPTION messages in error.message.
    const msg = error.message ?? '';
    if (msg.includes('already have a pending application')) {
      throw new Error(
        "You already have a pending application — we'll be in touch within 7 days. " +
          'If you submitted this by mistake or want to update your bio, reply to your confirmation email.',
      );
    }
    if (msg.includes('Email is required')) throw new Error('Please enter a valid email address.');
    if (msg.includes('Display name is required'))
      throw new Error("Pick a display name — this is what curators show up as on the feed.");
    if (msg.includes('at least 20 characters'))
      throw new Error('Tell us a little more about yourself — at least 20 characters.');
    // Network / RLS / unknown — generic fallback
    console.warn('[cyberPressApi] applyForCyberPress error:', error);
    throw new Error(
      "Couldn't submit your application. Check your connection and try again in a minute.",
    );
  }

  if (!data || typeof data !== 'string') {
    throw new Error('Unexpected response from server — try again in a minute.');
  }

  return {
    applicationId: data,
    shortRef: data.slice(0, 8).toUpperCase(),
  };
}

function isValidEmail(s: string): boolean {
  // RFC 5322 lite — good enough for client UX. Server has its own validation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
