import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
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
import MapView, { Marker, UrlTile } from 'react-native-maps';
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
import { useAuth } from '@/context/AuthContext';

const GEOFENCE_RADIUS_METERS = 160;
const MAX_GEOFENCE_REGIONS = 20;

const RADAR_RADIUS_MILES = 0.15;
const BBOX_DEGREES = 0.0025;

const CATEGORIES = ['restaurant', 'bar', 'store', 'traveling'] as const;

const CHIP_COLORS: Record<string, { bg: string; text: string }> = {
  restaurant: { bg: '#22C55E', text: '#FFFFFF' },
  bar: { bg: '#3B82F6', text: '#FFFFFF' },
  store: { bg: '#EF4444', text: '#FFFFFF' },
  traveling: { bg: '#F97316', text: '#FFFFFF' },
};

function getPinColor(type: string): string {
  switch (type.toLowerCase()) {
    case 'restaurant':
      return 'green';
    case 'bar':
      return 'blue';
    case 'store':
    case 'retail':
      return 'red';
    case 'traveling':
      return 'orange';
    default:
      return 'violet';
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
    'store',
    'traveling',
  ]);
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

  const filteredBusinesses = useMemo(() => {
    if (saleFilterIds) {
      return businesses.filter((b) => saleFilterIds.includes(b.id));
    }

    const q = debouncedSearchQuery.trim().toLowerCase();

    return businesses.filter((b) => {
      const type = (b.business_type ?? '').toLowerCase();
      const name = (b.business_name ?? '').toLowerCase();

      if (!activeFilters.includes(type)) return false;
      if (q) return name.includes(q) || type.includes(q);
      return true;
    });
  }, [businesses, activeFilters, debouncedSearchQuery, saleFilterIds]);

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
        showsUserLocation
        showsMyLocationButton
        onPress={() => setSelectedBusiness(null)}
      >
        <UrlTile
          urlTemplate="https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />
        {filteredBusinesses.map((biz) => {
          const hasEmoji = !!biz.emoji_icon?.trim();
          return (
            <Marker
              key={biz.id}
              coordinate={{
                latitude: biz.latitude,
                longitude: biz.longitude,
              }}
              pinColor={hasEmoji ? undefined : getPinColor(biz.business_type)}
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

      {/* Top-right Filters Icon Button */}
      <TouchableOpacity
        onPress={openFilters}
        activeOpacity={0.85}
        style={[styles.filtersFab, { top: insets.top + 12 }]}
        accessibilityRole="button"
        accessibilityLabel="Open filters"
      >
        <Ionicons name="filter" size={18} color="#FFFFFF" />
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

          <Text style={styles.modalSectionLabel}>Categories</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={styles.chipScroll}
          >
            {saleFilterIds && (
              <TouchableOpacity
                onPress={() => setSaleFilterIds(null)}
                activeOpacity={0.7}
                style={[styles.chip, { backgroundColor: '#DC2626' }]}
              >
                <Text style={[styles.chipText, { color: '#FFFFFF' }]}>
                  {'\u2715'} Clear Sale Filter
                </Text>
              </TouchableOpacity>
            )}
            {CATEGORIES.map((cat) => {
              const active = activeFilters.includes(cat);
              const colors = CHIP_COLORS[cat];
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => toggleFilter(cat)}
                  activeOpacity={0.7}
                  style={[
                    styles.chip,
                    active
                      ? { backgroundColor: colors.bg }
                      : styles.chipInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active
                        ? { color: colors.text }
                        : styles.chipTextInactive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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

                {user && role === 'customer' && (
                  <TouchableOpacity
                    style={styles.vibeCheckBtn}
                    activeOpacity={0.8}
                    onPress={() => setShowVibeForm(true)}
                  >
                    <Text style={styles.vibeCheckBtnText}>
                      Leave a Vibe Check
                    </Text>
                  </TouchableOpacity>
                )}
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
    backgroundColor: '#111827',
    borderRadius: 999,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
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
