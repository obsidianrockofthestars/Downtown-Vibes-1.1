// 1.7.0 — AsyncStorage-backed version tracker for the "What's New" modal
// (and reusable for any future first-foreground-after-update prompts).
//
// Key shape: a single AsyncStorage entry holds the most recent version the
// user has acknowledged. We compare against the current build's version and
// fire the modal when they differ.
//
// Spec: wiki/1-7-onboarding-and-cyber-press-spec.md (Surface 3).

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from './supabase';

const STORAGE_KEY = 'lastSeenWhatsNewVersion';
const ONBOARDING_KEY = 'onboardingCompleted_v1';

/**
 * "Existing user" heuristic — does this device have a supabase session?
 * If yes, they're an existing user (signed in via 1.4.x-1.6.x). If no, they
 * could be a fresh install OR a logged-out existing user (rare — usually
 * means they signed out manually). For the rare-case false positive
 * (logged-out existing user sees Welcome instead of What's New), the
 * content is essentially the same — just slightly different button labels.
 * Acceptable.
 */
async function hasExistingSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session?.user;
  } catch {
    return false;
  }
}

/**
 * The version of the currently-running binary, read from app.config.js.
 * Falls back to 'unknown' if Expo Constants can't resolve it.
 */
export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? 'unknown';
}

/**
 * Returns true the FIRST time the user foregrounds 1.7.0+ after upgrading
 * from any earlier version. Subsequent calls return false until a future
 * release bumps the binary version.
 *
 * Returns false for fresh installs (no prior stored version) — those users
 * see the WelcomeOnboardingModal instead, not the What's New modal.
 */
export async function shouldShowWhatsNew(): Promise<boolean> {
  try {
    const seenVersion = await AsyncStorage.getItem(STORAGE_KEY);
    const onboardingDone = await AsyncStorage.getItem(ONBOARDING_KEY);
    const current = currentAppVersion();

    // Already acknowledged this exact version — no fire.
    if (seenVersion === current) return false;

    // Onboarded users on a different version — show What's New.
    if (onboardingDone === 'true') return true;

    // Has seen an older What's New, now on newer — show What's New.
    if (seenVersion !== null && seenVersion !== current) return true;

    // No onboarding flag, no seen version — could be fresh install OR an
    // existing 1.4-1.6 user who never went through 1.7 onboarding.
    // Disambiguate via supabase session: existing users are authed,
    // fresh installs are not. (Fresh installs see Welcome modal instead.)
    const existing = await hasExistingSession();
    return existing;
  } catch (err) {
    console.warn('[whatsNewVersion] read failed:', err);
    return false;
  }
}

/**
 * Mark the current binary version as acknowledged. Called from the modal's
 * dismiss / done handlers. Idempotent.
 */
export async function markWhatsNewSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, currentAppVersion());
  } catch (err) {
    console.warn('[whatsNewVersion] write failed:', err);
  }
}

/**
 * Returns true if the user has never completed the welcome onboarding.
 * Fresh installs only.
 */
export async function shouldShowWelcomeOnboarding(): Promise<boolean> {
  try {
    const done = await AsyncStorage.getItem(ONBOARDING_KEY);
    if (done === 'true') return false;

    // Existing users (authed from prior versions) get What's New, not Welcome.
    const existing = await hasExistingSession();
    if (existing) return false;

    return true;
  } catch (err) {
    console.warn('[whatsNewVersion] read failed:', err);
    return false;
  }
}

/**
 * Mark the welcome onboarding as complete. Also stamps the current version
 * so the What's New modal doesn't fire immediately afterward.
 */
export async function markOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [ONBOARDING_KEY, 'true'],
      [STORAGE_KEY, currentAppVersion()],
    ]);
  } catch (err) {
    console.warn('[whatsNewVersion] write failed:', err);
  }
}

/**
 * Reset onboarding + What's New state. Useful for QA / dev / "show tutorial again"
 * action in account settings.
 */
export async function resetOnboardingState(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([ONBOARDING_KEY, STORAGE_KEY]);
  } catch (err) {
    console.warn('[whatsNewVersion] reset failed:', err);
  }
}

// Cyber Press banner dismissal — separate concern, separate key.
const CYBER_PRESS_BANNER_KEY = 'cyberPressBannerDismissed_v1';

export async function isCyberPressBannerDismissed(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(CYBER_PRESS_BANNER_KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

export async function dismissCyberPressBanner(): Promise<void> {
  try {
    await AsyncStorage.setItem(CYBER_PRESS_BANNER_KEY, 'true');
  } catch (err) {
    console.warn('[whatsNewVersion] banner dismiss write failed:', err);
  }
}
