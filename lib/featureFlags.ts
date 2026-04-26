// 1.6.0 soft-launch — feature flag client. Fetches public.app_config row
// keyed 'feature_flags', caches in AsyncStorage for 1 hour (matches the
// versionGate.ts cache pattern), returns booleans + allowlist evaluation.
//
// Schema:
//   app_config[key='feature_flags'].value = {
//     downtownFeed: {
//       enabled: boolean,
//       allowedUserIds: string[],
//     },
//   }
//
// See wiki/downtown-feed-build-plan.md (Session 7).
//
// Fail-CLOSED on read error, in contrast to versionGate.ts which fails
// open. Reasoning: we'd rather a transient blip hide a not-yet-public
// feature than show a feature that hasn't been turned on yet.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const FLAGS_CACHE_KEY = '@dv:feature_flags_v1';
const FLAGS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type FeatureFlags = {
  downtownFeed?: {
    enabled?: boolean;
    allowedUserIds?: string[];
  };
};

type CacheEntry = {
  fetchedAt: number;
  value: FeatureFlags;
};

let inMemory: CacheEntry | null = null;

async function readCache(): Promise<CacheEntry | null> {
  if (inMemory && Date.now() - inMemory.fetchedAt < FLAGS_CACHE_TTL_MS) {
    return inMemory;
  }
  try {
    const raw = await AsyncStorage.getItem(FLAGS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (
      typeof parsed?.fetchedAt !== 'number' ||
      Date.now() - parsed.fetchedAt >= FLAGS_CACHE_TTL_MS
    ) {
      return null;
    }
    inMemory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(value: FeatureFlags) {
  const entry: CacheEntry = { fetchedAt: Date.now(), value };
  inMemory = entry;
  try {
    await AsyncStorage.setItem(FLAGS_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Non-fatal — in-memory copy still serves the rest of the session.
  }
}

export async function fetchFeatureFlags(
  options: { forceRefresh?: boolean } = {}
): Promise<FeatureFlags | null> {
  if (!options.forceRefresh) {
    const cached = await readCache();
    if (cached) return cached.value;
  }
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'feature_flags')
      .single();
    if (error || !data) {
      console.warn('feature flags fetch errored:', error);
      return null;
    }
    const value = (data.value ?? {}) as FeatureFlags;
    await writeCache(value);
    return value;
  } catch (err) {
    console.warn('feature flags fetch threw:', err);
    return null;
  }
}

export async function isDowntownFeedEnabled(
  userId?: string | null
): Promise<boolean> {
  const flags = await fetchFeatureFlags();
  if (!flags) return false; // fail-closed
  const f = flags.downtownFeed ?? {};
  if (f.enabled === true) return true;
  // If global toggle is off, check the allowlist for staged rollout.
  if (userId && Array.isArray(f.allowedUserIds)) {
    return f.allowedUserIds.includes(userId);
  }
  return false;
}

export async function clearFeatureFlagsCache(): Promise<void> {
  inMemory = null;
  try {
    await AsyncStorage.removeItem(FLAGS_CACHE_KEY);
  } catch {
    // ignore
  }
}
