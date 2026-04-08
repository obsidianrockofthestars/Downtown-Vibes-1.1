import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  Animated,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// @ts-ignore
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { Business } from '@/lib/types';
import { haversineDistance } from '@/lib/haversine';
import { GEOFENCE_TASK } from '@/lib/backgroundTasks';
import { FlashSaleBanner, NearbySale } from '@/components/FlashSaleBanner';
import { BusinessSheet } from '@/components/BusinessSheet';
import { FilterPanel } from '@/components/FilterPanel';

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

function formatMiles(miles: number) {
  const rounded = Math.round(miles * 10) / 10;
  return `${rounded.toFixed(1)} mi`;
}

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

function MapScreen() {
  const insets = useSafeAreaInsets();

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
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(
    null
  );

  const shownSalesRef = useRef<Set<string>>(new Set());
  const mapRef = useRef<MapView | null>(null);
  const lastGeofenceLoc = useRef<{ latitude: number; longitude: number } | null>(
    null
  );
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

  const startLocationFlow = useCallback(async () => {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      setPermissionDenied(true);
      return null;
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

    return await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 15 },
      (loc) => {
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    );
  }, []);

  const acceptAndRequestPermissions = useCallback(async () => {
    await Location.requestForegroundPermissionsAsync();
    await Location.requestBackgroundPermissionsAsync();
    setShowDisclosure(false);
  }, [startLocationFlow]);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        setShowDisclosure(true);
        return;
      }
      setShowDisclosure(false);
      sub = await startLocationFlow();
    })().catch((err) => console.warn('Location init error:', err));

    return () => {
      sub?.remove();
    };
  }, [startLocationFlow]);

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

      const prev = lastGeofenceLoc.current;
      if (prev) {
        const movedMiles = haversineDistance(
          userLocation.latitude,
          userLocation.longitude,
          prev.latitude,
          prev.longitude
        );
        if (movedMiles < 0.5) return;
      }

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
        lastGeofenceLoc.current = {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
        };
      } catch (err) {
        console.warn('Geofencing start error:', err);
      }
    })();
  }, [userLocation, businesses]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  const closestTop5WithDistance = useMemo(() => {
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
      .slice(0, 5);
  }, [baseFilteredBusinesses, userLocation]);

  const filteredBusinesses = useMemo(() => {
    if (activeSort === 'closest' && userLocation) {
      return closestTop5WithDistance.map((x) => x.business);
    }
    return baseFilteredBusinesses;
  }, [activeSort, userLocation, closestTop5WithDistance, baseFilteredBusinesses]);

  return (
    <View style={styles.container}>
      <Modal visible={showDisclosure} animationType="slide">
        <View style={styles.disclosureContainer}>
          <View style={styles.disclosureContent}>
            <Image
              source={require('@/assets/images/DowntownVibes.jpg')}
              style={styles.disclosureImage}
            />
            <Text style={styles.disclosureTitle}>Location Access Required</Text>
            <Text style={styles.disclosureText}>
              Downtown Vibes collects location data to enable calculating the
              distance to nearby businesses and showing your position on the map
              even when the app is closed or not in use.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.disclosureBtn}
            activeOpacity={0.85}
            onPress={acceptAndRequestPermissions}
            accessibilityRole="button"
            accessibilityLabel="I Understand"
          >
            <Text style={styles.disclosureBtnText}>I Understand</Text>
          </TouchableOpacity>
        </View>
      </Modal>

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
          const hasStatic =
            typeof biz.static_latitude === 'number' &&
            typeof biz.static_longitude === 'number';
          const hasTraveling =
            !!biz.is_traveling_active &&
            typeof biz.latitude === 'number' &&
            typeof biz.longitude === 'number';

          const shouldRenderLegacy = !hasStatic && !biz.is_traveling_active;

          return (
            <React.Fragment key={biz.id}>
              {/* 1) STATIC PIN */}
              {hasStatic && (
                <Marker
                  key={`${biz.id}-static`}
                  coordinate={{
                    latitude: biz.static_latitude as number,
                    longitude: biz.static_longitude as number,
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
              )}

              {/* 2) TRAVELING PIN */}
              {hasTraveling && (
                <Marker
                  key={`${biz.id}-traveling`}
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
              )}

              {/* 3) LEGACY PIN */}
              {shouldRenderLegacy && (
                <Marker
                  key={`${biz.id}-legacy`}
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
              )}
            </React.Fragment>
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

      <FilterPanel
        filtersVisible={filtersVisible}
        closeFilters={closeFilters}
        filtersAnim={filtersAnim}
        insets={insets}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activeSort={activeSort}
        setActiveSort={setActiveSort}
        userLocation={userLocation}
        closestTop5WithDistance={closestTop5WithDistance}
        formatMiles={formatMiles}
        setSelectedBusiness={setSelectedBusiness}
        saleFilterIds={saleFilterIds}
        setSaleFilterIds={setSaleFilterIds}
        activeFilters={activeFilters}
        toggleFilter={toggleFilter}
        CATEGORIES={CATEGORIES}
        CHIP_COLORS={CHIP_COLORS}
      />

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
  },
  /* Location disclosure */
  disclosureContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  disclosureContent: {
    alignItems: 'center',
    paddingTop: 24,
  },
  disclosureImage: {
    width: '100%',
    height: 240,
    borderRadius: 18,
    resizeMode: 'cover',
    marginBottom: 18,
  },
  disclosureTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  disclosureText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    textAlign: 'center',
  },
  disclosureBtn: {
    backgroundColor: '#6C3AED',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclosureBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
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
});

export default MapScreen;
