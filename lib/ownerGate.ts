/**
 * Owner-gate rate limiter — shared SecureStore machinery for any destructive
 * or financially-impactful owner action that requires a password re-auth.
 *
 * Currently used by:
 *   - login.tsx → delete_business, open_paywall, manage_subscription
 *   - profile.tsx → delete_account
 *
 * The owner-gate modal re-authenticates the current user's password via
 * `supabase.auth.signInWithPassword`. Without client-side throttling, an
 * attacker with a few seconds on an unlocked phone can dictionary-attack
 * short passwords against the modal. Supabase does its own backend
 * throttling, but we want the friendly UX hit locally and a lockout that
 * survives app restart.
 *
 * Policy: after 3 failed attempts, lock for 30 seconds. After 5, lock for
 * 1 hour. State is persisted to SecureStore keyed by user id, so relaunching
 * the app does not reset the counter. On a successful unlock, the counter
 * is cleared.
 *
 * Key namespace is SHARED across all gated actions on purpose. A user who
 * burns 2 failed attempts on delete-business and then switches to the
 * delete-account button has ONE more attempt before lockout — not three more.
 * This prevents a smash-and-grab actor from fishing across multiple
 * destructive entry points to get extra guesses.
 */

import * as SecureStore from 'expo-secure-store';

const OWNER_GATE_LOCKOUT_KEY_PREFIX = 'ownerGate.lockout.v1.';
export const OWNER_GATE_LOCKOUT_STEP_1 = {
  threshold: 3,
  durationMs: 30 * 1000,
};
export const OWNER_GATE_LOCKOUT_STEP_2 = {
  threshold: 5,
  durationMs: 60 * 60 * 1000,
};

export type OwnerGateLockState = {
  failures: number;
  /** Epoch ms at which the current lockout expires. 0 = not locked. */
  lockedUntil: number;
};

function ownerGateLockKey(userId: string): string {
  return `${OWNER_GATE_LOCKOUT_KEY_PREFIX}${userId}`;
}

async function readOwnerGateLock(userId: string): Promise<OwnerGateLockState> {
  try {
    const raw = await SecureStore.getItemAsync(ownerGateLockKey(userId));
    if (!raw) return { failures: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    const failures =
      typeof parsed?.failures === 'number' && parsed.failures >= 0
        ? parsed.failures
        : 0;
    const lockedUntil =
      typeof parsed?.lockedUntil === 'number' && parsed.lockedUntil >= 0
        ? parsed.lockedUntil
        : 0;
    return { failures, lockedUntil };
  } catch {
    // SecureStore read failures are not security-critical here — fall open
    // rather than lock the user out permanently on a corrupt blob.
    return { failures: 0, lockedUntil: 0 };
  }
}

async function writeOwnerGateLock(
  userId: string,
  state: OwnerGateLockState
): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      ownerGateLockKey(userId),
      JSON.stringify(state)
    );
  } catch {
    // Best-effort persistence; an in-memory counter would still be in place
    // for the current session.
  }
}

export async function clearOwnerGateLock(userId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ownerGateLockKey(userId));
  } catch {
    // swallow
  }
}

/** Call BEFORE attempting a password verification. Returns `null` when the
 *  user may proceed, or a human-readable lockout message when they must
 *  wait. */
export async function checkOwnerGateLock(
  userId: string
): Promise<string | null> {
  const state = await readOwnerGateLock(userId);
  if (state.lockedUntil > Date.now()) {
    const secondsLeft = Math.ceil((state.lockedUntil - Date.now()) / 1000);
    if (secondsLeft > 60) {
      const minutesLeft = Math.ceil(secondsLeft / 60);
      return `Too many failed attempts. Try again in about ${minutesLeft} minute${
        minutesLeft === 1 ? '' : 's'
      }.`;
    }
    return `Too many failed attempts. Try again in ${secondsLeft} second${
      secondsLeft === 1 ? '' : 's'
    }.`;
  }
  return null;
}

/** Call AFTER a password verification failure. Increments the counter and
 *  sets a lockout window if the relevant threshold was crossed. */
export async function recordOwnerGateFailure(
  userId: string
): Promise<OwnerGateLockState> {
  const prev = await readOwnerGateLock(userId);
  const failures = prev.failures + 1;
  let lockedUntil = prev.lockedUntil;
  if (failures >= OWNER_GATE_LOCKOUT_STEP_2.threshold) {
    lockedUntil = Date.now() + OWNER_GATE_LOCKOUT_STEP_2.durationMs;
  } else if (failures >= OWNER_GATE_LOCKOUT_STEP_1.threshold) {
    lockedUntil = Date.now() + OWNER_GATE_LOCKOUT_STEP_1.durationMs;
  }
  const next = { failures, lockedUntil };
  await writeOwnerGateLock(userId, next);
  return next;
}
