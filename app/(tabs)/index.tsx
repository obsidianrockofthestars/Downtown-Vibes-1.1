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
} from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { supabase } from '@/lib/supabase';
import { Business } from '@/lib/types';
import { haversineDistance } from '@/lib/haversine';
import { GEOFENCE_TASK } from '@/lib/backgroundTasks';
import { SearchBar } from '@/components/SearchBar';
import { FlashSaleBanner, NearbySale } from '@/components/FlashSaleBanner';

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

export default function MapScreen() {
  const insets = useSafeAreaInsets();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
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

  const shownSalesRef = useRef<Set<string>>(new Set());
  const mapRef = useRef<MapView | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['35%'], []);

  useEffect(() => {
    if (selectedBusiness) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [selectedBusiness]);

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

      await Notifications.requestPermissionsAsync();

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

  // Radar: flash sale proximity check with bounding box pre-filter
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

  // Geofencing: register the 20 nearest businesses as geofence regions
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

      {/* Search + Filter Chips overlay */}
      <View style={[styles.topContainer, { top: insets.top + 10 }]} pointerEvents="box-none">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
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
                ✕ Clear Sale Filter
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
      </View>

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

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={() => setSelectedBusiness(null)}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetView style={styles.sheetContent}>
          {selectedBusiness && (
            <>
              <Text style={styles.sheetName}>
                {selectedBusiness.business_name}
              </Text>

              {selectedBusiness.flash_sale ? (
                <Text style={styles.sheetSale}>
                  🔥 {selectedBusiness.flash_sale}
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
                <Text style={styles.sheetButtonText}>🧭 Get Directions</Text>
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
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: 'column',
    gap: 12,
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
});
