import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { Business } from '@/lib/types';
import { haversineDistance } from '@/lib/haversine';
import { SearchBar } from '@/components/SearchBar';
import { FlashSaleBanner } from '@/components/FlashSaleBanner';

const RADAR_RADIUS_MILES = 0.25;

const CATEGORIES = ['restaurant', 'bar', 'store'] as const;

const CHIP_COLORS: Record<string, { bg: string; text: string }> = {
  restaurant: { bg: '#22C55E', text: '#FFFFFF' },
  bar: { bg: '#3B82F6', text: '#FFFFFF' },
  store: { bg: '#EF4444', text: '#FFFFFF' },
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
    default:
      return 'orange';
  }
}

export default function MapScreen() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([
    'restaurant',
    'bar',
    'store',
  ]);
  const [flashSale, setFlashSale] = useState<{
    text: string;
    name: string;
  } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

  const shownSalesRef = useRef<Set<string>>(new Set());
  const mapRef = useRef<MapView | null>(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: selectedBusiness ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [selectedBusiness]);

  // Fetch businesses from Supabase
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('is_active', true);
      if (error) console.warn('Supabase fetch error:', error.message);
      if (data) setBusinesses(data);
    })();
  }, []);

  // Watch user location
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
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

  // Radar: flash sale proximity check
  useEffect(() => {
    if (!userLocation) return;

    for (const biz of businesses) {
      if (!biz.flash_sale || shownSalesRef.current.has(biz.id)) continue;

      const dist = haversineDistance(
        userLocation.latitude,
        userLocation.longitude,
        biz.latitude,
        biz.longitude
      );

      if (dist <= RADAR_RADIUS_MILES) {
        shownSalesRef.current.add(biz.id);
        setFlashSale({ text: biz.flash_sale, name: biz.business_name });
        break;
      }
    }
  }, [userLocation, businesses]);

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

  // Unified filter: active chips + search query, all lowercase
  const filteredBusinesses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return businesses.filter((b) => {
      const type = (b.business_type ?? '').toLowerCase();
      const name = (b.business_name ?? '').toLowerCase();

      if (!activeFilters.includes(type)) return false;
      if (q) return name.includes(q) || type.includes(q);
      return true;
    });
  }, [businesses, activeFilters, searchQuery]);

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
      <View style={styles.overlay}>
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
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
        sale={flashSale}
        onDismiss={() => setFlashSale(null)}
      />

      {selectedBusiness && (
        <View style={styles.sheetWrapper} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.sheet,
              {
                transform: [
                  {
                    translateY: sheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [300, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.sheetClose}
              onPress={() => setSelectedBusiness(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.sheetCloseText}>✕</Text>
            </TouchableOpacity>

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

            {selectedBusiness.menu_link?.startsWith('http') ? (
              <TouchableOpacity
                style={styles.sheetButton}
                activeOpacity={0.8}
                onPress={() => handleOpenMenu(selectedBusiness.menu_link!)}
              >
                <Text style={styles.sheetButtonText}>View Menu</Text>
              </TouchableOpacity>
            ) : null}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  chipScroll: {
    marginTop: 108,
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
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 999,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
  },
  sheetClose: {
    position: 'absolute',
    top: 16,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6B7280',
  },
  sheetName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    paddingRight: 40,
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
