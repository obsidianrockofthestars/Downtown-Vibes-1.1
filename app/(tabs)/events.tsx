// 1.6.0 Downtown Feed Phase 1 — Events Board
//
// Aesthetic: Pony Express Neon (see lib/designTokens.ts and
// wiki/pony-express-neon-philosophy.md). Western frontier × cybernetic
// dispatch. Dusk sky background, hero rider above the title, neon-purple
// underline, parchment radius chips with cyan glow on active, neon-purple
// filter chips, dark post cards with leather-stitch borders.
//
// Functionality unchanged from v1:
//   - Posts JOIN businesses, geofiltered client-side via lib/haversine.
//   - Pinned posts always at top.
//   - Hearts with optimistic UI.
//   - is_active=false businesses (food trucks packed up) hidden.
//   - Location-denied → St. Joseph fallback + hint banner.
//
// Read-only at this version: no comments. Comments land in 1.7.0 alongside
// the UGC moderation stack.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import {
  colors as C,
  fonts as F,
  fontSizes as FS,
  space as S,
  radius as R,
  glow as G,
  ST_JOSEPH_COORDS,
} from '@/lib/designTokens';

type FilterMode = 'all' | 'event' | 'announcement';

const RADIUS_OPTIONS_MI = [1, 3, 5, 10, 25] as const;
const DEFAULT_RADIUS_MI = 5;
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

type RawPostRow = Post & { businesses: JoinedBusiness | null };
type PostWithDistance = Post & { business: JoinedBusiness; distanceMi: number };

function resolvePinCoords(biz: JoinedBusiness): { latitude: number; longitude: number } | null {
  if (biz.is_traveling_active && biz.latitude != null && biz.longitude != null)
    return { latitude: biz.latitude, longitude: biz.longitude };
  if (biz.static_latitude != null && biz.static_longitude != null)
    return { latitude: biz.static_latitude, longitude: biz.static_longitude };
  if (biz.latitude != null && biz.longitude != null)
    return { latitude: biz.latitude, longitude: biz.longitude };
  return null;
}

export default function EventsBoard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [origin, setOrigin] = useState<{ latitude: number; longitude: number }>({
    latitude: ST_JOSEPH_COORDS.latitude,
    longitude: ST_JOSEPH_COORDS.longitude,
  });
  const [usingFallbackOrigin, setUsingFallbackOrigin] = useState(true);
  const [radiusMi, setRadiusMi] = useState<number>(DEFAULT_RADIUS_MI);
  const [filter, setFilter] = useState<FilterMode>('all');

  const [posts, setPosts] = useState<PostWithDistance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

  const [heartCounts, setHeartCounts] = useState<Record<string, number>>({});
  const [userHearts, setUserHearts] = useState<Set<string>>(new Set());

  // Resolve origin
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
            setOrigin({
              latitude: ST_JOSEPH_COORDS.latitude,
              longitude: ST_JOSEPH_COORDS.longitude,
            });
            setUsingFallbackOrigin(true);
          }
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setOrigin({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        setUsingFallbackOrigin(false);
      } catch {
        if (!cancelled) {
          setOrigin({
            latitude: ST_JOSEPH_COORDS.latitude,
            longitude: ST_JOSEPH_COORDS.longitude,
          });
          setUsingFallbackOrigin(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          origin.latitude, origin.longitude,
          coords.latitude, coords.longitude
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

      // Heart counts + user-hearted set
      const postIds = enriched.map((p) => p.id);
      if (postIds.length > 0) {
        try {
          const { data: rxnRows, error: rxnErr } = await supabase
            .from('post_reactions')
            .select('post_id, user_id')
            .in('post_id', postIds);
          if (!rxnErr && rxnRows) {
            const counts: Record<string, number> = {};
            const mineSet = new Set<string>();
            for (const r of rxnRows as Array<{ post_id: string; user_id: string }>) {
              counts[r.post_id] = (counts[r.post_id] ?? 0) + 1;
              if (user && r.user_id === user.id) mineSet.add(r.post_id);
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

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      await fetchPosts();
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [fetchPosts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  }, [fetchPosts]);

  const visiblePosts = useMemo(() => {
    const matchesType = (t: PostType) => filter === 'all' ? true : t === filter;
    const within = posts.filter((p) => p.distanceMi <= radiusMi && matchesType(p.post_type));
    within.sort((a, b) => {
      if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return within;
  }, [posts, radiusMi, filter]);

  const handleToggleHeart = useCallback(
    async (postId: string) => {
      if (!user) {
        Alert.alert(
          'Sign in to react',
          'Create a free account to heart posts you like.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Account', onPress: () => router.push('/(tabs)/account') },
          ]
        );
        return;
      }
      const wasHearted = userHearts.has(postId);
      setUserHearts((prev) => {
        const next = new Set(prev);
        if (wasHearted) next.delete(postId); else next.add(postId);
        return next;
      });
      setHeartCounts((prev) => ({
        ...prev,
        [postId]: Math.max(0, (prev[postId] ?? 0) + (wasHearted ? -1 : 1)),
      }));
      const { error } = wasHearted
        ? await supabase.from('post_reactions').delete()
            .eq('post_id', postId).eq('user_id', user.id).eq('reaction', 'heart')
        : await supabase.from('post_reactions').insert({
            post_id: postId, user_id: user.id, reaction: 'heart',
          });
      if (error) {
        setUserHearts((prev) => {
          const next = new Set(prev);
          if (wasHearted) next.add(postId); else next.delete(postId);
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
        is_traveling_active: match.business.is_traveling_active ?? undefined,
        account_tier: (match.business.account_tier as 'single' | 'dual' | undefined) ?? undefined,
        business_type: match.business.business_type ?? '',
        menu_link: null, website: null,
        description: match.business.description ?? null,
        history_fact: match.business.history_fact ?? null,
      };
      setSelectedBusiness(biz);
    },
    [posts]
  );

  // Header rendered inside FlatList so it scrolls with content
  const renderHeader = () => (
    <View>
      {/* HERO — rider over dusk sky */}
      <View style={styles.heroBlock}>
        <Image
          source={require('@/assets/images/hero-rider.png')}
          style={styles.heroRider}
          resizeMode="contain"
        />
        <View style={styles.heroCoords}>
          <Text style={styles.heroCoordsText}>{ST_JOSEPH_COORDS.displayLat}</Text>
          <Text style={styles.heroCoordsText}>{ST_JOSEPH_COORDS.displayLon}</Text>
        </View>
      </View>

      {/* TITLE */}
      <View style={styles.titleBlock}>
        <Text style={styles.title}>EVENTS BOARD</Text>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitleSlash}>{'//'}</Text>
          <Text style={styles.subtitleText}>
            {usingFallbackOrigin
              ? 'using downtown St. Joe — enable Location for posts near you'
              : `dispatches within ${radiusMi} mi of you`}
          </Text>
        </View>
        <View style={styles.titleUnderline} />
      </View>

      {/* RADIUS */}
      <View style={styles.controlBlock}>
        <Text style={styles.controlLabel}>RADIUS</Text>
        <View style={styles.chipRow}>
          {RADIUS_OPTIONS_MI.map((mi) => {
            const active = mi === radiusMi;
            return (
              <Pressable
                key={mi}
                onPress={() => setRadiusMi(mi)}
                style={[
                  styles.radiusChip,
                  active ? styles.radiusChipActive : styles.radiusChipInactive,
                ]}
              >
                <Text
                  style={[
                    styles.radiusChipText,
                    active ? styles.radiusChipTextActive : styles.radiusChipTextInactive,
                  ]}
                >
                  {mi} mi
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* FILTER */}
        <View style={styles.filterRow}>
          {(
            [
              { k: 'event' as const, label: 'EVENTS' },
              { k: 'announcement' as const, label: 'ANNOUNCEMENTS' },
              { k: 'all' as const, label: 'ALL' },
            ]
          ).map(({ k, label }) => {
            const active = filter === k;
            return (
              <Pressable
                key={k}
                onPress={() => setFilter(k)}
                style={[
                  styles.filterChip,
                  active ? styles.filterChipActive : styles.filterChipInactive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active ? styles.filterChipTextActive : styles.filterChipTextInactive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {loading ? (
        <View style={styles.centeredFill}>
          {renderHeader()}
          <ActivityIndicator size="large" color={C.neonPurpleHi} style={{ marginTop: S.xxl }} />
        </View>
      ) : (
        <FlatList
          data={visiblePosts}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={C.neonPurpleHi}
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
          ListEmptyComponent={() =>
            errorMessage ? (
              <View style={styles.emptyState}>
                <Text style={styles.errorTitle}>Couldn&apos;t load the board</Text>
                <Text style={styles.emptyBody}>{errorMessage}</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  No dispatches on the wire tonight.
                </Text>
                <Text style={styles.emptyBody}>
                  {posts.length === 0
                    ? "Your downtown is quiet. Check back soon."
                    : `Nothing within ${radiusMi} mi for the "${
                        filter === 'all' ? 'All' : filter
                      }" filter. Try a wider radius.`}
                </Text>
              </View>
            )
          }
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
    backgroundColor: C.surfaceDeep,
  },

  // Hero
  heroBlock: {
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  heroRider: {
    width: 280,
    height: 240,
    transform: [{ rotate: '-7deg' }],
  },
  heroCoords: {
    position: 'absolute',
    top: 16,
    right: 20,
    alignItems: 'flex-end',
  },
  heroCoordsText: {
    fontFamily: F.mono,
    fontSize: FS.micro,
    color: C.textMuted,
    letterSpacing: 0.5,
  },

  // Title
  titleBlock: {
    paddingHorizontal: S.xl,
    paddingTop: S.sm,
    paddingBottom: S.lg,
  },
  title: {
    fontFamily: F.display,
    fontSize: FS.display,
    color: C.textPrimary,
    letterSpacing: 2,
    lineHeight: FS.display * 1.05,
    ...G.purple,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: S.sm,
    gap: S.sm,
  },
  subtitleSlash: {
    fontFamily: F.monoBold,
    fontSize: FS.bodySm,
    color: C.neonCyan,
  },
  subtitleText: {
    flex: 1,
    fontFamily: F.mono,
    fontSize: FS.bodySm,
    color: C.textMuted,
    letterSpacing: 0.3,
  },
  titleUnderline: {
    width: 120,
    height: 4,
    backgroundColor: C.neonPurpleHi,
    borderRadius: 2,
    marginTop: S.md,
    ...G.purple,
  },

  // Controls
  controlBlock: {
    paddingHorizontal: S.xl,
    paddingBottom: S.lg,
  },
  controlLabel: {
    fontFamily: F.mono,
    fontSize: FS.micro,
    color: C.textMuted,
    letterSpacing: 1.5,
    marginBottom: S.sm,
  },
  chipRow: {
    flexDirection: 'row',
    gap: S.xs,
    marginBottom: S.md,
  },
  radiusChip: {
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    borderRadius: R.paper,
    borderWidth: 2,
    minWidth: 60,
    alignItems: 'center',
  },
  radiusChipActive: {
    backgroundColor: C.surfacePaper,
    borderColor: C.neonCyan,
    ...G.cyan,
  },
  radiusChipInactive: {
    backgroundColor: C.surfaceBase,
    borderColor: C.surfaceLeather,
  },
  radiusChipText: {
    fontFamily: F.display,
    fontSize: FS.bodySm,
    letterSpacing: 0.5,
  },
  radiusChipTextActive: {
    color: C.textOnPaper,
  },
  radiusChipTextInactive: {
    color: C.textPrimary,
  },

  // Filter
  filterRow: {
    flexDirection: 'row',
    gap: S.xs,
    marginTop: S.xs,
  },
  filterChip: {
    flex: 1,
    paddingVertical: S.sm,
    paddingHorizontal: S.sm,
    borderRadius: R.paper,
    borderWidth: 1,
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: C.neonPurpleHi,
    borderColor: C.neonPurpleHi,
    ...G.purple,
  },
  filterChipInactive: {
    backgroundColor: C.surfaceBase,
    borderColor: C.surfaceLeather,
  },
  filterChipText: {
    fontFamily: F.display,
    fontSize: FS.bodySm,
    letterSpacing: 1,
  },
  filterChipTextActive: {
    color: C.textPrimary,
  },
  filterChipTextInactive: {
    color: C.textMuted,
  },

  // List
  listContent: {
    paddingBottom: 60,
  },
  centeredFill: {
    flex: 1,
  },

  // Empty / error
  emptyState: {
    paddingHorizontal: S.xl,
    paddingTop: S.xxl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: F.display,
    fontSize: FS.h1,
    color: C.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: S.sm,
  },
  emptyBody: {
    fontFamily: F.mono,
    fontSize: FS.bodySm,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorTitle: {
    fontFamily: F.display,
    fontSize: FS.h1,
    color: C.stateDanger,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: S.sm,
  },
});
