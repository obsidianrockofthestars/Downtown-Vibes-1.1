import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  Linking,
  Alert,
  Platform,
  Modal,
  Pressable,
  Animated,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
// @ts-ignore
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { Business, VibeCheck } from '@/lib/types';
import { haversineDistance } from '@/lib/haversine';
import { GEOFENCE_TASK } from '@/lib/backgroundTasks';
import { SearchBar } from '@/components/SearchBar';
import { FlashSaleBanner, NearbySale } from '@/components/FlashSaleBanner';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

const GEOFENCE_RADIUS_METERS = 160;
const MAX_GEOFENCE_REGIONS = 20;

const RADAR_RADIUS_MILES = 0.15;
const BBOX_DEGREES = 0.0025;

const CATEGORIES = ['restaurant', 'bar', 'retail', 'traveling'] as const;

const CHIP_COLORS: Record<string, { bg: string; text: string }> = {
  restaurant: { bg: '#22C55E', text: '#FFFFFF' },
  bar: { bg: '#3B82F6', text: '#FFFFFF' },
  retail: { bg: '#EF4444', text: '#FFFFFF' },
  traveling: { bg: '#F97316', text: '#FFFFFF' },
};

function getPinImage(type: string) {
  const t = type.toLowerCase();
  switch (t) {
    case 'restaurant':
      return require('@/assets/pins/pin-restaurant.png');
    case 'bar':
      return require('@/assets/pins/pin-bar.png');
    case 'store':
    case 'retail':
      return require('@/assets/pins/pin-store.png');
    case 'traveling':
      return require('@/assets/pins/pin-default.png');
    default:
      return require('@/assets/pins/pin-default.png');
  }
}

function renderStars(rating: number): string {
  const full = Math.round(rating);
  return '\u2605'.repeat(full) + '\u2606'.repeat(5 - full);
}

function formatTimeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000
  );
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function MapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, role } = useAuth();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([
    'restaurant',
    'bar',
    'retail',
    'traveling',
  ]);
  const [activeSort, setActiveSort] = useState<'default' | 'closest'>('default');
  const [nearbySales, setNearbySales] = useState<NearbySale[]>([]);
  const [saleFilterIds, setSaleFilterIds] = useState<string[] | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(
    null
  );

  // Vibe Checks state
  const [vibeChecks, setVibeChecks] = useState<VibeCheck[]>([]);
  const [vibeLoading, setVibeLoading] = useState(false);
  const [showVibeForm, setShowVibeForm] = useState(false);
  const [vibeRating, setVibeRating] = useState(0);
  const [vibeComment, setVibeComment] = useState('');
  const [vibeSubmitting, setVibeSubmitting] = useState(false);

  // Favorites state
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [favoriteRowId, setFavoriteRowId] = useState<string | null>(null);

  const shownSalesRef = useRef<Set<string>>(new Set());
  const mapRef = useRef<MapView | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['50%', '90%'], []);
  const filtersAnim = useRef(new Animated.Value(0)).current;

  const openFilters = useCallback(() => {
    setFiltersVisible(true);
    Animated.timing(filtersAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [filtersAnim]);

  const closeFilters = useCallback(() => {
    Animated.timing(filtersAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setFiltersVisible(false);
    });
  }, [filtersAnim]);

  useEffect(() => {
    if (selectedBusiness) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [selectedBusiness]);

  // Fetch vibe checks when a business is selected
  useEffect(() => {
    if (!selectedBusiness) {
      setVibeChecks([]);
      setShowVibeForm(false);
      setVibeRating(0);
      setVibeComment('');
      return;
    }

    setVibeLoading(true);
    supabase
      .from('vibe_checks')
      .select('*')
      .eq('business_id', selectedBusiness.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) console.warn('Vibe checks fetch error:', error.message);
        setVibeChecks((data as VibeCheck[]) ?? []);
        setVibeLoading(false);
      });
  }, [selectedBusiness]);

  // Check if current user has favorited this business
  useEffect(() => {
    if (!selectedBusiness || !user || role !== 'customer') {
      setIsFavorited(false);
      setFavoriteRowId(null);
      return;
    }
    supabase
      .from('user_favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_id', selectedBusiness.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('Favorite check error:', error.message);
        setIsFavorited(!!data);
        setFavoriteRowId(data?.id ?? null);
      });
  }, [selectedBusiness, user, role]);

  const handleSubmitVibeCheck = async () => {
    if (!user || !selectedBusiness || vibeRating === 0) return;

    setVibeSubmitting(true);
    const { error } = await supabase.from('vibe_checks').insert({
      business_id: selectedBusiness.id,
      user_id: user.id,
      rating: vibeRating,
      comment: vibeComment.trim() || null,
    });
    setVibeSubmitting(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setVibeRating(0);
    setVibeComment('');
    setShowVibeForm(false);

    const { data: refreshed } = await supabase
      .from('vibe_checks')
      .select('*')
      .eq('business_id', selectedBusiness.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setVibeChecks((refreshed as VibeCheck[]) ?? []);
  };

  useEffect(() => {
    const fetchBusinesses = async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('is_active', true);
      if (error) console.warn('Supabase fetch error:', error.message);
      if (data) setBusinesses(data);
    };

    fetchBusinesses();

    const channel = supabase
      .channel('business-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'businesses' },
        () => fetchBusinesses()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') {
        setPermissionDenied(true);
        return;
      }

      const { status: bg } = await Location.requestBackgroundPermissionsAsync();
      if (bg !== 'granted') {
        console.warn('Background location denied — geofencing disabled');
      }

      // Expo Go removed Android remote push support (SDK 53+).
      // Avoid importing `expo-notifications` in that environment.
      const isExpoGoAndroid = Platform.OS === 'android' && !!Constants.expoGoConfig;
      if (!isExpoGoAndroid) {
        const Notifications = await import('expo-notifications');
        await Notifications.requestPermissionsAsync();
      }

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 15 },
        (loc) => {
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      );
    })();

    return () => {
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (!userLocation) return;

    const found: NearbySale[] = [];

    for (const biz of businesses) {
      if (!biz.flash_sale || shownSalesRef.current.has(biz.id)) continue;

      const dLat = Math.abs(biz.latitude - userLocation.latitude);
      const dLon = Math.abs(biz.longitude - userLocation.longitude);
      if (dLat > BBOX_DEGREES || dLon > BBOX_DEGREES) continue;

      const dist = haversineDistance(
        userLocation.latitude,
        userLocation.longitude,
        biz.latitude,
        biz.longitude
      );

      if (dist <= RADAR_RADIUS_MILES) {
        shownSalesRef.current.add(biz.id);
        found.push({
          id: biz.id,
          text: biz.flash_sale,
          name: biz.business_name,
        });
      }
    }

    if (found.length > 0) {
      setNearbySales((prev) => [...prev, ...found]);
    }
  }, [userLocation, businesses]);

  useEffect(() => {
    if (!userLocation || businesses.length === 0) return;

    (async () => {
      const bgGranted = await Location.getBackgroundPermissionsAsync();
      if (bgGranted.status !== 'granted') return;

      const sorted = [...businesses]
        .map((biz) => ({
          biz,
          dist: haversineDistance(
            userLocation.latitude,
            userLocation.longitude,
            biz.latitude,
            biz.longitude
          ),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, MAX_GEOFENCE_REGIONS);

      const regions: Location.LocationRegion[] = sorted.map(({ biz }) => ({
        identifier: biz.business_name,
        latitude: biz.latitude,
        longitude: biz.longitude,
        radius: GEOFENCE_RADIUS_METERS,
        notifyOnEnter: true,
        notifyOnExit: false,
      }));

      try {
        await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
      } catch (err) {
        console.warn('Geofencing start error:', err);
      }
    })();
  }, [userLocation, businesses]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleOpenMenu = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open this link.');
      }
    } catch {
      Alert.alert('Error', 'Invalid URL.');
    }
  }, []);

  const toggleFilter = useCallback((category: string) => {
    setActiveFilters((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  }, []);

  const handleDismissBanner = useCallback(() => {
    setNearbySales([]);
    setSaleFilterIds(null);
  }, []);

  const handleShowSales = useCallback(() => {
    const ids = nearbySales.map((s) => s.id);
    setSaleFilterIds(ids);
  }, [nearbySales]);

  const handleRecenter = useCallback(() => {
    if (!userLocation) return;
    mapRef.current?.animateToRegion(
      {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      500
    );
  }, [userLocation]);

  const handleToggleFavorite = useCallback(async () => {
    if (!user || role !== 'customer') {
      Alert.alert(
        'Sign in to favorite',
        'You need a free account to favorite!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Account', onPress: () => router.push('/(tabs)/account') },
        ]
      );
      return;
    }
    if (!selectedBusiness || favoriteLoading) return;

    setFavoriteLoading(true);
    try {
      if (isFavorited && favoriteRowId) {
        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('id', favoriteRowId);
        if (error) {
          console.error('Unfavorite error:', error);
          Alert.alert('Error', error.message);
          return;
        }
        setIsFavorited(false);
        setFavoriteRowId(null);
      } else {
        const { data, error } = await supabase
          .from('user_favorites')
          .insert({
            user_id: user.id,
            business_id: selectedBusiness.id,
          })
          .select('id')
          .single();
        if (error) {
          console.error('Favorite insert error:', error);
          Alert.alert('Error', error.message);
          return;
        }
        if (data?.id) {
          setIsFavorited(true);
          setFavoriteRowId(data.id);
        }
      }
    } finally {
      setFavoriteLoading(false);
    }
  }, [
    user,
    role,
    selectedBusiness,
    isFavorited,
    favoriteRowId,
    favoriteLoading,
  ]);

  const baseFilteredBusinesses = useMemo(() => {
    if (saleFilterIds) {
      return businesses.filter((b) => saleFilterIds.includes(b.id));
    }

    const q = debouncedSearchQuery.trim().toLowerCase();
    return businesses.filter((b) => {
      const type = (b.business_type ?? '').toLowerCase();
      const name = (b.business_name ?? '').toLowerCase();

      const matchesActiveCategory = activeFilters.some((active) => {
        // UX requirement: retail should match both `retail` and legacy `store`.
        if (active === 'retail') return type === 'retail' || type === 'store';
        return type === active;
      });

      if (!matchesActiveCategory) return false;
      if (q) return name.includes(q) || type.includes(q);
      return true;
    });
  }, [businesses, activeFilters, debouncedSearchQuery, saleFilterIds]);

  const closestTop3WithDistance = useMemo(() => {
    if (!userLocation) return [];

    return baseFilteredBusinesses
      .map((b) => ({
        business: b,
        dist: haversineDistance(
          userLocation.latitude,
          userLocation.longitude,
          b.latitude,
          b.longitude
        ),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);
  }, [baseFilteredBusinesses, userLocation]);

  const filteredBusinesses = useMemo(() => {
    if (activeSort === 'closest' && userLocation) {
      return closestTop3WithDistance.map((x) => x.business);
    }
    return baseFilteredBusinesses;
  }, [activeSort, userLocation, closestTop3WithDistance, baseFilteredBusinesses]);

  const formatMiles = (miles: number) => {
    const rounded = Math.round(miles * 10) / 10;
    return `${rounded.toFixed(1)} mi`;
  };

  const avgRating = useMemo(() => {
    if (vibeChecks.length === 0) return 0;
    return vibeChecks.reduce((sum, v) => sum + v.rating, 0) / vibeChecks.length;
  }, [vibeChecks]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: 39.7684,
          longitude: -94.8466,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        provider="google"
        showsUserLocation
        showsMyLocationButton
        onPress={() => setSelectedBusiness(null)}
      >
        {/* Map press only dismisses bottom sheet; markers handle their own onPress */}
        {filteredBusinesses.map((biz) => {
          const hasEmoji = !!biz.emoji_icon?.trim();
          return (
            <Marker
              key={biz.id}
              coordinate={{
                latitude: biz.latitude,
                longitude: biz.longitude,
              }}
              image={hasEmoji ? undefined : getPinImage(biz.business_type)}
              onPress={(e) => {
                e.stopPropagation();
                setSelectedBusiness(biz);
              }}
            >
              {hasEmoji && (
                <View style={styles.emojiBadge}>
                  <Text style={styles.emojiBadgeText}>{biz.emoji_icon}</Text>
                </View>
              )}
            </Marker>
          );
        })}
      </MapView>

      {/* Top-right Menu (filters) pill button */}
      <TouchableOpacity
        onPress={openFilters}
        activeOpacity={0.85}
        style={[styles.filtersFab, { top: insets.top + 12 }]}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <Ionicons name="filter" size={18} color="#FFFFFF" />
        <Text style={styles.filtersFabText}>Menu</Text>
      </TouchableOpacity>

      {/* Dedicated Recenter button */}
      <TouchableOpacity
        onPress={handleRecenter}
        activeOpacity={0.85}
        style={[
          styles.recenterFab,
          { bottom: Math.max(insets.bottom, 12) + 12 },
        ]}
        disabled={!userLocation}
        accessibilityRole="button"
        accessibilityLabel="Recenter map to your location"
      >
        <Text style={styles.recenterFabText}>{'\u2316'}</Text>
      </TouchableOpacity>

      {/* Filters side panel */}
      <Modal
        visible={filtersVisible}
        animationType="none"
        transparent
        onRequestClose={closeFilters}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeFilters} />

        <Animated.View
          style={[
            styles.sidePanel,
            {
              paddingTop: insets.top + 10,
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [
                {
                  translateX: filtersAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [420, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.sidePanelHeader}>
            <Text style={styles.modalTitle}>Filters</Text>
            <TouchableOpacity
              onPress={closeFilters}
              activeOpacity={0.8}
              style={styles.iconCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Close filters"
            >
              <Ionicons name="close" size={20} color="#111827" />
            </TouchableOpacity>
          </View>

          <SearchBar value={searchQuery} onChange={setSearchQuery} />

          <Text style={styles.modalSectionLabel}>Sort By</Text>
          <View style={styles.sortBtnRow}>
            <TouchableOpacity
              onPress={() => setActiveSort('default')}
              activeOpacity={0.8}
              style={[styles.sortBtn, activeSort === 'default' && styles.sortBtnActive]}
              accessibilityRole="button"
              accessibilityLabel="Sort default"
            >
              <Text
                style={[
                  styles.sortBtnText,
                  activeSort === 'default' && styles.sortBtnTextActive,
                ]}
              >
                Default
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveSort('closest')}
              activeOpacity={0.8}
              disabled={!userLocation}
              style={[styles.sortBtn, activeSort === 'closest' && styles.sortBtnActive, !userLocation && styles.sortBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Sort closest"
            >
              <Text
                style={[
                  styles.sortBtnText,
                  activeSort === 'closest' && styles.sortBtnTextActive,
                ]}
              >
                Closest
              </Text>
            </TouchableOpacity>
          </View>

          {activeSort === 'closest' && userLocation && (
            <View style={styles.closestList}>
              {closestTop3WithDistance.length === 0 ? (
                <Text style={styles.closestEmptyText}>No nearby pins found.</Text>
              ) : (
                closestTop3WithDistance.map(({ business, dist }) => (
                  <View key={business.id} style={styles.closestRow}>
                    <View style={styles.closestRowText}>
                      <Text style={styles.closestName} numberOfLines={1}>
                        {business.business_name}
                      </Text>
                      <Text style={styles.closestDistance}>
                        {formatMiles(dist)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.closestViewBtn}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedBusiness(business);
                        closeFilters();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${business.business_name}`}
                    >
                      <Text style={styles.closestViewBtnText}>View</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          <Text style={styles.modalSectionLabel}>Categories</Text>

          {saleFilterIds && (
            <TouchableOpacity
              onPress={() => setSaleFilterIds(null)}
              activeOpacity={0.8}
              style={styles.clearSaleFilterBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear sale filter"
            >
              <Text style={styles.clearSaleFilterText}>
                {'\u2715'} Clear Sale Filter
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => {
              const active = activeFilters.includes(cat);
              const colors = CHIP_COLORS[cat];
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => toggleFilter(cat)}
                  activeOpacity={0.8}
                  style={[
                    styles.categoryBox,
                    active && { backgroundColor: colors.bg, borderColor: colors.bg },
                    !active && styles.categoryBoxInactive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter ${cat}`}
                >
                  <Text
                    style={[
                      styles.categoryBoxText,
                      active && { color: colors.text },
                      !active && styles.categoryBoxTextInactive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </Modal>

      {permissionDenied && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            Location access denied — radar disabled
          </Text>
        </View>
      )}

      <FlashSaleBanner
        sales={nearbySales}
        onDismiss={handleDismissBanner}
        onShowSales={handleShowSales}
      />

      {/* Business Details Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={() => setSelectedBusiness(null)}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <Image
          source={require('@/assets/images/watermark.png')}
          style={[
            StyleSheet.absoluteFillObject,
            { opacity: 0.05, resizeMode: 'cover', zIndex: 0 },
          ]}
          {...({ pointerEvents: 'none' } as any)}
        />
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          {selectedBusiness && (
            <>
              <Text style={styles.sheetName}>
                {selectedBusiness.business_name}
              </Text>

              {selectedBusiness.flash_sale ? (
                <Text style={styles.sheetSale}>
                  {'\uD83D\uDD25'} {selectedBusiness.flash_sale}
                </Text>
              ) : null}

              {selectedBusiness.history_fact ? (
                <Text style={styles.sheetFact}>
                  {selectedBusiness.history_fact}
                </Text>
              ) : (
                <Text style={styles.sheetType}>
                  {selectedBusiness.business_type}
                </Text>
              )}

              <TouchableOpacity
                style={styles.favoriteButton}
                activeOpacity={0.8}
                onPress={handleToggleFavorite}
                disabled={favoriteLoading}
              >
                {favoriteLoading ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Ionicons
                    name={isFavorited ? 'heart' : 'heart-outline'}
                    size={22}
                    color={isFavorited ? '#DC2626' : '#6B7280'}
                  />
                )}
                <Text
                  style={[
                    styles.favoriteButtonText,
                    isFavorited && styles.favoriteButtonTextActive,
                  ]}
                >
                  {isFavorited ? 'Favorited' : 'Favorite'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.directionsButton}
                activeOpacity={0.8}
                onPress={() => {
                  const label = encodeURIComponent(selectedBusiness.business_name);
                  const lat = selectedBusiness.latitude;
                  const lng = selectedBusiness.longitude;
                  const url =
                    Platform.OS === 'ios'
                      ? `maps:0,0?q=${label}@${lat},${lng}`
                      : `geo:0,0?q=${lat},${lng}(${label})`;
                  Linking.openURL(url).catch(() =>
                    Alert.alert('Error', 'Could not open maps.')
                  );
                }}
              >
                <Text style={styles.sheetButtonText}>
                  {'\uD83E\uDDED'} Get Directions
                </Text>
              </TouchableOpacity>

              {selectedBusiness.menu_link?.startsWith('http') ? (
                <TouchableOpacity
                  style={styles.sheetButton}
                  activeOpacity={0.8}
                  onPress={() => handleOpenMenu(selectedBusiness.menu_link!)}
                >
                  <Text style={styles.sheetButtonText}>View Menu</Text>
                </TouchableOpacity>
              ) : null}

              {/* ── Vibe Checks Section ── */}
              <View style={styles.vibeSection}>
                <View style={styles.vibeHeader}>
                  <Text style={styles.vibeSectionTitle}>Vibe Checks</Text>
                  {vibeChecks.length > 0 && (
                    <Text style={styles.vibeAvg}>
                      {renderStars(avgRating)} ({avgRating.toFixed(1)})
                    </Text>
                  )}
                </View>

                {vibeLoading ? (
                  <ActivityIndicator
                    size="small"
                    color="#6C3AED"
                    style={{ marginVertical: 12 }}
                  />
                ) : vibeChecks.length === 0 ? (
                  <Text style={styles.vibeEmpty}>
                    No vibe checks yet. Be the first!
                  </Text>
                ) : (
                  vibeChecks.map((vc) => (
                    <View key={vc.id} style={styles.vibeCard}>
                      <View style={styles.vibeCardHeader}>
                        <Text style={styles.vibeStars}>
                          {renderStars(vc.rating)}
                        </Text>
                        <Text style={styles.vibeDate}>
                          {formatTimeAgo(vc.created_at)}
                        </Text>
                      </View>
                      {vc.comment ? (
                        <Text style={styles.vibeComment}>{vc.comment}</Text>
                      ) : null}
                    </View>
                  ))
                )}

                <TouchableOpacity
                  style={styles.vibeCheckBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (!user || role !== 'customer') {
                      Alert.alert(
                        'Sign in to leave a Vibe Check',
                        'You need a free account to leave a Vibe Check!',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Go to Account',
                            onPress: () =>
                              router.push('/(tabs)/account'),
                          },
                        ]
                      );
                      return;
                    }
                    setShowVibeForm(true);
                  }}
                >
                  <Text style={styles.vibeCheckBtnText}>
                    Leave a Vibe Check
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Vibe Check Submit Modal */}
      <Modal
        visible={showVibeForm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVibeForm(false)}
      >
        <Pressable
          style={styles.vibeFormBackdrop}
          onPress={() => setShowVibeForm(false)}
        />
        <View style={styles.vibeFormCard}>
          <Text style={styles.vibeFormTitle}>Leave a Vibe Check</Text>
          <Text style={styles.vibeFormBizName} numberOfLines={1}>
            {selectedBusiness?.business_name}
          </Text>

          <View style={styles.starPickerRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setVibeRating(star)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.starPickerStar,
                    star <= vibeRating && styles.starPickerStarActive,
                  ]}
                >
                  {star <= vibeRating ? '\u2605' : '\u2606'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.vibeFormInput}
            value={vibeComment}
            onChangeText={setVibeComment}
            placeholder="What's the vibe? (optional)"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={280}
          />

          <TouchableOpacity
            style={[
              styles.vibeFormSubmit,
              (!vibeRating || vibeSubmitting) && styles.vibeFormSubmitDisabled,
            ]}
            onPress={handleSubmitVibeCheck}
            disabled={!vibeRating || vibeSubmitting}
            activeOpacity={0.8}
          >
            {vibeSubmitting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.vibeFormSubmitText}>Submit Vibe Check</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.vibeFormCancelBtn}
            onPress={() => setShowVibeForm(false)}
          >
            <Text style={styles.vibeFormCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chipScroll: {
    paddingLeft: 12,
  },
  chipRow: {
    gap: 8,
    paddingRight: 20,
  },
  chipRowAlign: {
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  chipSelfStart: {
    alignSelf: 'flex-start',
  },
  chipInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  chipTextInactive: {
    color: '#6B7280',
  },
  filtersFab: {
    position: 'absolute',
    right: 12,
    zIndex: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    width: 'auto',
    backgroundColor: '#111827',
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  filtersFabText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
  /* Sort By */
  sortBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
  },
  sortBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortBtnActive: {
    backgroundColor: '#6C3AED',
    borderColor: '#6C3AED',
  },
  sortBtnDisabled: {
    opacity: 0.6,
  },
  sortBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  sortBtnTextActive: {
    color: '#FFFFFF',
  },

  /* Closest list */
  closestList: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14,
  },
  closestEmptyText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 13,
  },
  closestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closestRowText: {
    flex: 1,
    paddingRight: 12,
  },
  closestName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  closestDistance: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 2,
  },
  closestViewBtn: {
    backgroundColor: '#6C3AED',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closestViewBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },

  /* Categories grid */
  clearSaleFilterBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  clearSaleFilterText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryBox: {
    width: '48%',
    height: 50,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  categoryBoxInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
  },
  categoryBoxText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  categoryBoxTextInactive: {
    color: '#6B7280',
  },
  recenterFab: {
    position: 'absolute',
    right: 12,
    zIndex: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  recenterFabText: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sidePanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '60%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: -6, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 22,
  },
  sidePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  iconCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSectionLabel: {
    marginTop: 12,
    marginBottom: 8,
    color: '#374151',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  permissionBanner: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  permissionText: {
    color: '#92400E',
    fontWeight: '600',
    fontSize: 13,
  },
  emojiBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#6C3AED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  emojiBadgeText: {
    fontSize: 22,
    lineHeight: 28,
  },
  sheetBackground: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetHandle: {
    backgroundColor: '#D1D5DB',
    width: 40,
  },
  sheetContent: {
    paddingHorizontal: 24,
    paddingBottom: 36,
    position: 'relative',
    zIndex: 1,
  },
  sheetName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  sheetSale: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 4,
  },
  sheetFact: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 12,
  },
  sheetType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'capitalize',
    marginBottom: 12,
  },
  favoriteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  favoriteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  favoriteButtonTextActive: {
    color: '#DC2626',
  },
  directionsButton: {
    marginTop: 8,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetButton: {
    marginTop: 8,
    backgroundColor: '#6C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  /* Vibe Checks */
  vibeSection: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
  },
  vibeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  vibeSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  vibeAvg: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
  },
  vibeEmpty: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 12,
  },
  vibeCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  vibeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  vibeStars: {
    fontSize: 13,
    color: '#F59E0B',
  },
  vibeDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  vibeComment: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
    marginTop: 2,
  },
  vibeCheckBtn: {
    marginTop: 10,
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  vibeCheckBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  /* Vibe Check Form Modal */
  vibeFormBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  vibeFormCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: '25%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 20,
  },
  vibeFormTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  vibeFormBizName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6C3AED',
    marginBottom: 16,
  },
  starPickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  starPickerStar: {
    fontSize: 34,
    color: '#D1D5DB',
  },
  starPickerStarActive: {
    color: '#F59E0B',
  },
  vibeFormInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  vibeFormSubmit: {
    backgroundColor: '#6C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  vibeFormSubmitDisabled: {
    opacity: 0.5,
  },
  vibeFormSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  vibeFormCancelBtn: {
    alignItems: 'center',
    marginTop: 12,
  },
  vibeFormCancelText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default MapScreen;
