import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
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

  const shownSalesRef = useRef<Set<string>>(new Set());
  const mapRef = useRef<MapView | null>(null);

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

      if (dist < RADAR_RADIUS_MILES) {
        shownSalesRef.current.add(biz.id);
        setFlashSale({ text: biz.flash_sale, name: biz.business_name });
        break;
      }
    }
  }, [userLocation, businesses]);

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
      >
        <UrlTile
          urlTemplate="https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />
        {filteredBusinesses.map((biz) => (
          <Marker
            key={biz.id}
            coordinate={{
              latitude: biz.latitude,
              longitude: biz.longitude,
            }}
            title={biz.business_name}
            description={biz.flash_sale ?? biz.history_fact}
            pinColor={getPinColor(biz.business_type)}
          />
        ))}
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
});
