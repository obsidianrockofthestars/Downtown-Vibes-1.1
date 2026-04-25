/**
 * Version gating for Downtown Vibes.
 *
 * Reads `public.app_config` row `app_version` from Supabase, compares the
 * running version against per-platform thresholds, and returns a status
 * that drives the VersionGateModal UI.
 *
 * Three status levels, in order of severity:
 *   - 'ok'          — running version >= minRecommended, no modal
 *   - 'recommended' — minRequired <= running < minRecommended, soft nudge
 *   - 'required'    — running < minRequired, hard gate (blocking)
 *
 * Motivated by the 2026-04-24 launch-day incident: 1.4.4 shipped with a
 * critical blank-map bug on iOS, and we had no infrastructure to force
 * users onto the 1.4.5 hotfix beyond store auto-updates (which take
 * days to reach most of the installed base).
 *
 * Design notes:
 *   - FAIL OPEN: if the config fetch fails, we return status 'ok'. Never
 *     block the user on a transient network issue or Supabase outage.
 *   - Cached in AsyncStorage with a short TTL (1h) so repeated app opens
 *     don't hammer the DB. Fresh enough to respond to a `minRequired`
 *     bump within ~1 hour without a deploy.
 *   - Simple numeric semver comparison sufficient for our X.Y.Z scheme.
 *     Not pulling in a full semver library for two-operator math.
 *
 * Managed by: Dylan via Supabase dashboard, row `public.app_config`
 * where `key = 'app_version'`. Update `latest` on every release. Only
 * bump `minRequired` in a crisis.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type VersionGateStatus = 'ok' | 'recommended' | 'required';

export interface PlatformVersionConfig {
  latest: string;
  minRecommended: string;
  minRequired: string;
  storeUrl: string;
}

export interface VersionGateResult {
  status: VersionGateStatus;
  runningVersion: string;
  latest: string;
  storeUrl: string;
}

interface AppVersionConfig {
  ios: PlatformVersionConfig;
  android: PlatformVersionConfig;
}

// ----------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------

const CACHE_KEY = '@downtownvibes/versionConfigCache';
const DISMISSAL_KEY_PREFIX = '@downtownvibes/versionGateDismissed:';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const DISMISSAL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// ----------------------------------------------------------------------
// Semver comparison
// ----------------------------------------------------------------------

/**
 * Compare two X.Y.Z version strings numerically.
 *   compareVersions('1.4.5',  '1.4.4')  →  1   (a > b)
 *   compareVersions('1.4.5',  '1.4.5')  →  0   (equal)
 *   compareVersions('1.4.4',  '1.4.5')  → -1   (a < b)
 *   compareVersions('1.4.10', '1.4.9')  →  1   (numeric, not lexicographic)
 *
 * Non-numeric or missing segments are treated as 0 (permissive — we'd
 * rather fail open than crash on a malformed version string).
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    (v ?? '0')
      .toString()
      .split('.')
      .map((seg) => {
        const n = parseInt(seg, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const aParts = parse(a);
  const bParts = parse(b);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const ai = aParts[i] ?? 0;
    const bi = bParts[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

// ----------------------------------------------------------------------
// Running version
// ----------------------------------------------------------------------

/**
 * Return the app's marketing version string from expo-constants.
 * Falls back to '0.0.0' if somehow unavailable — compareVersions treats
 * that as older than any real version, which means a soft nudge fires
 * (rather than a hard gate) — acceptable degradation.
 */
export function getRunningVersion(): string {
  return (
    Constants.expoConfig?.version ??
    (Constants as any).manifest?.version ??
    '0.0.0'
  );
}

// ----------------------------------------------------------------------
// Config fetch + cache
// ----------------------------------------------------------------------

interface CachedConfig {
  config: AppVersionConfig;
  fetchedAt: number;
}

async function readCache(): Promise<AppVersionConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedConfig = JSON.parse(raw);
    if (
      !cached ||
      typeof cached.fetchedAt !== 'number' ||
      Date.now() - cached.fetchedAt > CACHE_TTL_MS
    ) {
      return null;
    }
    return cached.config;
  } catch {
    return null;
  }
}

async function writeCache(config: AppVersionConfig): Promise<void> {
  try {
    const payload: CachedConfig = {
      config,
      fetchedAt: Date.now(),
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Cache failures are non-fatal.
  }
}

async function fetchConfigFromSupabase(): Promise<AppVersionConfig | null> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'app_version')
      .maybeSingle();

    if (error || !data?.value) return null;

    const value = data.value as any;
    if (!value?.ios || !value?.android) return null;

    // Light schema validation — trust Supabase-side structure, but verify
    // the required fields exist before we hand them off to the gate logic.
    const validatePlatform = (p: any): PlatformVersionConfig | null => {
      if (
        !p ||
        typeof p.latest !== 'string' ||
        typeof p.minRecommended !== 'string' ||
        typeof p.minRequired !== 'string' ||
        typeof p.storeUrl !== 'string'
      ) {
        return null;
      }
      return {
        latest: p.latest,
        minRecommended: p.minRecommended,
        minRequired: p.minRequired,
        storeUrl: p.storeUrl,
      };
    };

    const ios = validatePlatform(value.ios);
    const android = validatePlatform(value.android);
    if (!ios || !android) return null;

    return { ios, android };
  } catch {
    return null;
  }
}

/**
 * Force-refresh the cache. Call this when you want to bypass the TTL,
 * e.g., if the user has pull-to-refresh'd a settings screen.
 */
export async function refreshVersionConfig(): Promise<AppVersionConfig | null> {
  const config = await fetchConfigFromSupabase();
  if (config) await writeCache(config);
  return config;
}

async function loadConfig(): Promise<AppVersionConfig | null> {
  const cached = await readCache();
  if (cached) return cached;
  return refreshVersionConfig();
}

// ----------------------------------------------------------------------
// Main evaluation
// ----------------------------------------------------------------------

/**
 * Evaluate the version gate.
 *
 * Returns null if we can't determine a status (no config, no platform
 * config, fetch failed). Callers should treat null as 'ok' for UX
 * purposes — fail open.
 */
export async function evaluateVersionGate(): Promise<VersionGateResult | null> {
  const config = await loadConfig();
  if (!config) return null;

  const platform = Platform.OS === 'ios' ? config.ios : config.android;
  if (!platform) return null;

  const runningVersion = getRunningVersion();

  let status: VersionGateStatus = 'ok';
  if (compareVersions(runningVersion, platform.minRequired) < 0) {
    status = 'required';
  } else if (compareVersions(runningVersion, platform.minRecommended) < 0) {
    status = 'recommended';
  }

  return {
    status,
    runningVersion,
    latest: platform.latest,
    storeUrl: platform.storeUrl,
  };
}

// ----------------------------------------------------------------------
// Dismissal (soft-nudge cooldown)
// ----------------------------------------------------------------------

/**
 * Mark the soft nudge for a given `latest` version as dismissed. Cooldown
 * is 24 hours. Keyed by the `latest` version string so a NEW release
 * invalidates the dismissal automatically (user gets re-nudged for the
 * new version).
 *
 * No effect on hard-required gate — that one can't be dismissed.
 */
export async function dismissVersionNudge(latestVersion: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      DISMISSAL_KEY_PREFIX + latestVersion,
      String(Date.now())
    );
  } catch {
    // Dismissal failures are non-fatal; the modal just reappears.
  }
}

/**
 * Returns true if the user dismissed the soft nudge for this version
 * within the cooldown window.
 */
export async function isVersionNudgeDismissed(
  latestVersion: string
): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(
      DISMISSAL_KEY_PREFIX + latestVersion
    );
    if (!raw) return false;
    const dismissedAt = parseInt(raw, 10);
    if (!Number.isFinite(dismissedAt)) return false;
    return Date.now() - dismissedAt < DISMISSAL_COOLDOWN_MS;
  } catch {
    return false;
  }
}
