// 1.6.0 Downtown Feed Phase 1, Sessions 4-7 — Events Board.
//
// The "Events" tab — a geofiltered feed of business-side posts within the
// user's chosen radius. Top of the screen has a radius selector (preset
// chips: 1/3/5/10/25 mi, default 5) and three filter chips (Events /
// Announcements / All). Pinned posts surface at the top regardless of
// filter.
//
// Geofilter:
//   - Posts JOIN businesses; for each business we resolve its rendering
//     coords using the same hierarchy as the Map tab:
//       traveling pin (latitude/longitude when is_traveling_active=true)
//       → static pin (static_latitude/longitude)
//       → legacy lat/lon
//   - is_active=false businesses are hidden (food trucks packed up for the
//     day are excluded; their posts hide too).
//   - Distance is computed client-side via lib/haversine. No PostGIS dep.
//   - If location permission is denied, fall back to a fixed center on
//     downtown St. Joseph, MO (39.7674, -94.8467).
//
// Read-only at v1: no comments, no reactions yet (Session 6 wires hearts;
// comments stay in 1.7.0 + UGC moderation stack).
//
// See wiki/downtown-feed-spec.md and wiki/downtown-feed-build-plan.md.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Business, Post, PostType } from '@/lib/types';
import { haversineDistance } from '@/lib/haversine';
import { PostCard } from '@/components/PostCard';
import { BusinessSheet } from '@/components/BusinessSheet';

type FilterMode = 'all' | 'event' | 'announcement';

const RADIUS_OPTIONS_MI = [1, 3, 5, 10, 25] as const;
const DEFAULT_RADIUS_MI = 5;
const ST_JOSEPH_FALLBACK = { latitude: 39.7674, longitude: -94.8467 };
const POSTS_QUERY_LIMIT = 200;

type JoinedBusiness = {
  id: string;
  business_name: string | null;
  emoji_icon: string | null;
  latitude: number | null;
  longitude: number | null;
  static_latitude: number | null;
  static_longitude: number | null;
  is_active: boolean | null;
  is_traveling_active: boolean | null;
  business_type: string | null;
  flash_sale: string | null;
  description: string | null;
  history_fact: string | null;
  account_tier: string | null;
};

type RawPostRow = Post & {
  businesses: JoinedBusiness | null;
};

type PostWithDistance = Post & {
  business: JoinedBusiness;
  distanceMi: number;
};

function resolvePinCoords(
  biz: JoinedBusiness
): { latitude: number; longitude: number } | null {
  // Same hierarchy as the Map tab's marker render.
  if (biz.is_traveling_active && biz.latitude != null && biz.longitude != null) {
    return { latitude: biz.latitude, longitude: biz.longitude };
  }
  if (biz.static_latitude != null && biz.static_longitude != null) {
    return {
      latitude: biz.static_latitude,
      longitude: biz.static_longitude,
    };
  }
  if (biz.latitude != null && biz.longitude != null) {
    return { latitude: biz.latitude, longitude: biz.longitude };
  }
  return null;
}

export default function EventsBoard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [origin, setOrigin] = useState<{
    latitude: number;
    longitude: number;
  }>(ST_JOSEPH_FALLBACK);
  const [usingFallbackOrigin, setUsingFallbackOrigin] = useState(true);
  const [radiusMi, setRadiusMi] = useState<number>(DEFAULT_RADIUS_MI);
  const [filter, setFilter] = useState<FilterMode>('all');

  const [posts, setPosts] = useState<PostWithDistance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(
    null
  );

  // Heart reactions — counts (post_id → count) and the set of post_ids the
  // current user has hearted. Both fetched alongside the posts feed and
  // updated optimistically on tap. See wiki/downtown-feed-build-plan.md
  // Session 6.
  const [heartCounts, setHeartCounts] = useState<Record<string, number>>({});
  const [userHearts, setUserHearts] = useState<Set<string>>(new Set());

  // Resolve origin once on mount; degrade gracefully if denied.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        let canRead = status === 'granted';
        if (!canRead) {
          const req = await Location.requestForegroundPermissionsAsync();
          canRead = req.status === 'granted';
        }
        if (!canRead) {
          if (!cancelled) {
            setOrigin(ST_JOSEPH_FALLBACK);
            setUsingFallbackOrigin(true);
          }
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setOrigin({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        setUsingFallbackOrigin(false);
      } catch {
        if (!cancelled) {
          setOrigin(ST_JOSEPH_FALLBACK);
          setUsingFallbackOrigin(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Single fetch — pulls visible posts with joined business; client filters
  // by radius + post_type. Volume is small enough that client filtering is
  // fine for Phase 1; switch to PostGIS + ST_DWithin if volume grows.
  const fetchPosts = useCallback(async () => {
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(
          `id, business_id, author_user_id, post_type, title, body,
           photo_url, event_at, is_pinned, pinned_until, created_at,
           updated_at, deleted_at, hidden_for_moderation,
           businesses (
             id, business_name, emoji_icon, latitude, longitude,
             static_latitude, static_longitude, is_active,
             is_traveling_active, business_type, flash_sale, description,
             history_fact, account_tier
           )`
        )
        .is('deleted_at', null)
        .eq('hidden_for_moderation', false)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(POSTS_QUERY_LIMIT);
      if (error) {
        setErrorMessage(error.message);
        setPosts([]);
        return;
      }
      const rows = (data ?? []) as unknown as RawPostRow[];
      const enriched: PostWithDistance[] = [];
      for (const row of rows) {
        const biz = row.businesses;
        if (!biz) continue;
        if (biz.is_active === false) continue;
        const coords = resolvePinCoords(biz);
        if (!coords) continue;
        const distanceMi = haversineDistance(
          origin.latitude,
          origin.longitude,
          coords.latitude,
          coords.longitude
        );
        enriched.push({
          ...row,
          business: biz,
          distanceMi,
          business_name: biz.business_name ?? undefined,
          emoji_icon: biz.emoji_icon ?? undefined,
        });
      }
      setPosts(enriched);

      // Heart counts + user-hearted set, refreshed alongside the posts.
      const postIds = enriched.map((p) => p.id);
      if (postIds.length > 0) {
        try {
          const { data: reactionRows, error: rxnErr } = await supabase
            .from('post_reactions')
            .select('post_id, user_id')
            .in('post_id', postIds);
          if (!rxnErr && reactionRows) {
            const counts: Record<string, number> = {};
            const mineSet = new Set<string>();
            for (const row of reactionRows as Array<{
              post_id: string;
              user_id: string;
            }>) {
              counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
              if (user && row.user_id === user.id) {
                mineSet.add(row.post_id);
              }
            }
            setHeartCounts(counts);
            setUserHearts(mineSet);
          }
        } catch (err) {
          console.warn('post_reactions fetch threw:', err);
        }
      } else {
        setHeartCounts({});
        setUserHearts(new Set());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMessage(msg);
      setPosts([]);
    }
  }, [origin, user]);

  // Initial fetch + refetch when origin changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      await fetchPosts();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchPosts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  }, [fetchPosts]);

  // Apply radius + type filter, with pinned posts always at top.
  const visiblePosts = useMemo(() => {
    const matchesType = (t: PostType): boolean => {
      if (filter === 'all') return true;
      return t === filter;
    };
    const within = posts.filter(
      (p) => p.distanceMi <= radiusMi && matchesType(p.post_type)
    );
    // Pinned first (already pre-sorted server-side, but re-stabilize after
    // client-side filtering by radius/type).
    within.sort((a, b) => {
      if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return within;
  }, [posts, radiusMi, filter]);

  // Heart toggle with optimistic UI. Anon users hit a sign-in alert.
  // Server errors revert local state.
  const handleToggleHeart = useCallback(
    async (postId: string) => {
      if (!user) {
        Alert.alert(
          'Sign in to react',
          'Create a free account to heart posts you like.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Go to Account',
              onPress: () => router.push('/(tabs)/account'),
            },
          ]
        );
        return;
      }
      const wasHearted = userHearts.has(postId);
      // Optimistic
      setUserHearts((prev) => {
        const next = new Set(prev);
        if (wasHearted) next.delete(postId);
        else next.add(postId);
        return next;
      });
      setHeartCounts((prev) => ({
        ...prev,
        [postId]: Math.max(0, (prev[postId] ?? 0) + (wasHearted ? -1 : 1)),
      }));

      const { error } = wasHearted
        ? await supabase
            .from('post_reactions')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', user.id)
            .eq('reaction', 'heart')
        : await supabase
            .from('post_reactions')
            .insert({ post_id: postId, user_id: user.id, reaction: 'heart' });

      if (error) {
        // Revert
        setUserHearts((prev) => {
          const next = new Set(prev);
          if (wasHearted) next.add(postId);
          else next.delete(postId);
          return next;
        });
        setHeartCounts((prev) => ({
          ...prev,
          [postId]: Math.max(0, (prev[postId] ?? 0) + (wasHearted ? 1 : -1)),
        }));
        Alert.alert("Couldn't update reaction", error.message);
      }
    },
    [user, userHearts, router]
  );

  const handleTapBusiness = useCallback(
    (businessId: string) => {
      const match = posts.find((p) => p.business_id === businessId);
      if (!match) return;
      // BusinessSheet expects a Business shape — coerce from joined row.
      const biz: Business = {
        id: match.business.id,
        place_id: null,
        owner_id: '',
        business_name: match.business.business_name ?? '',
        flash_sale: match.business.flash_sale ?? null,
        emoji_icon: match.business.emoji_icon ?? null,
        is_active: match.business.is_active ?? true,
        latitude: match.business.latitude ?? 0,
        longitude: match.business.longitude ?? 0,
        static_latitude: match.business.static_latitude ?? null,
        static_longitude: match.business.static_longitude ?? null,
        is_traveling_active:
          match.business.is_traveling_active ?? undefined,
        account_tier:
          (match.business.account_tier as 'single' | 'dual' | undefined) ??
          undefined,
        business_type: match.business.business_type ?? '',
        menu_link: null,
        website: null,
        description: match.business.description ?? null,
        history_fact: match.business.history_fact ?? null,
      };
      setSelectedBusiness(biz);
    },
    [posts]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Events Board</Text>
        <Text style={styles.headerSubtitle}>
          {usingFallbackOrigin
            ? 'Using downtown St. Joe — enable Location for posts near you.'
            : `Posts within ${radiusMi} mi of you`}
        </Text>
      </View>

      <View style={styles.controlBlock}>
        <Text style={styles.controlLabel}>Radius</Text>
        <View style={styles.chipRow}>
          {RADIUS_OPTIONS_MI.map((mi) => {
            const active = mi === radiusMi;
            return (
              <Pressable
                key={mi}
                onPress={() => setRadiusMi(mi)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {mi} mi
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.filterRow}>
          {(
            [
              { k: 'event', label: '📅 Events' },
              { k: 'announcement', label: '📢 Announcements' },
              { k: 'all', label: '✨ All' },
            ] as const
          ).map(({ k, label }) => {
            const active = filter === k;
            return (
              <Pressable
                key={k}
                onPress={() => setFilter(k as FilterMode)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={styles.centeredFill}>
          <ActivityIndicator size="large" color="#6C3AED" />
        </View>
      ) : errorMessage ? (
        <View style={styles.centeredFill}>
          <Text style={styles.errorTitle}>Couldn&apos;t load the board</Text>
          <Text style={styles.errorBody}>{errorMessage}</Text>
        </View>
      ) : visiblePosts.length === 0 ? (
        <View style={styles.centeredFill}>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>
            {posts.length === 0
              ? 'Your downtown is brewing something. Check back soon.'
              : `No posts within ${radiusMi} mi for the “${
                  filter === 'all' ? 'All' : filter
                }” filter. Try a wider radius or a different filter.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visiblePosts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#6C3AED"
            />
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              distanceMi={item.distanceMi}
              hearted={userHearts.has(item.id)}
              heartCount={heartCounts[item.id] ?? 0}
              onTapBusiness={handleTapBusiness}
              onToggleHeart={handleToggleHeart}
            />
          )}
        />
      )}

      <BusinessSheet
        selectedBusiness={selectedBusiness}
        onDismiss={() => setSelectedBusiness(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  controlBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#6C3AED',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  chipTextActive: {
    color: '#6C3AED',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: '#6C3AED',
    borderColor: '#6C3AED',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centeredFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DC2626',
    marginBottom: 6,
  },
  errorBody: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
