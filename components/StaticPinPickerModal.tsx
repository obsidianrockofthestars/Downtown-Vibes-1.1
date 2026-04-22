import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Region } from 'react-native-maps';
import * as Location from 'expo-location';

interface Props {
  visible: boolean;
  businessName: string;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  onCancel: () => void;
  onConfirm: (latitude: number, longitude: number) => Promise<void>;
}

// Fallback center: downtown St. Joseph, MO — only used if no initial coords
// and we cannot resolve current GPS on open.
const FALLBACK_REGION: Region = {
  latitude: 39.7684,
  longitude: -94.8467,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export function StaticPinPickerModal({
  visible,
  businessName,
  initialLatitude,
  initialLongitude,
  onCancel,
  onConfirm,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const [saving, setSaving] = useState(false);
  const [centeringOnMe, setCenteringOnMe] = useState(false);

  // Each time the modal opens, reset the region tracker. The MapView
  // re-mounts because of the `key` prop, so its initialRegion is fresh.
  useEffect(() => {
    if (visible) {
      const seeded: Region = {
        latitude:
          typeof initialLatitude === 'number'
            ? initialLatitude
            : FALLBACK_REGION.latitude,
        longitude:
          typeof initialLongitude === 'number'
            ? initialLongitude
            : FALLBACK_REGION.longitude,
        latitudeDelta: 0.003,
        longitudeDelta: 0.003,
      };
      setCurrentRegion(seeded);
      setSaving(false);
      setCenteringOnMe(false);
    }
  }, [visible, initialLatitude, initialLongitude]);

  const initialRegion: Region =
    typeof initialLatitude === 'number' &&
    typeof initialLongitude === 'number'
      ? {
          latitude: initialLatitude,
          longitude: initialLongitude,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        }
      : FALLBACK_REGION;

  const handleCenterOnMe = async () => {
    try {
      setCenteringOnMe(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to center on your location.'
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      mapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        },
        400
      );
    } catch {
      Alert.alert('Error', 'Could not acquire GPS position.');
    } finally {
      setCenteringOnMe(false);
    }
  };

  const handleConfirm = async () => {
    if (!currentRegion) return;
    setSaving(true);
    try {
      await onConfirm(currentRegion.latitude, currentRegion.longitude);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        if (!saving) onCancel();
      }}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (!saving) onCancel();
            }}
            disabled={saving}
            style={styles.headerSideBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.headerCancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Set Location
          </Text>
          <View style={styles.headerSideBtn} />
        </View>

        <View style={styles.instructionsBlock}>
          <Text style={styles.instructionsTitle}>
            {businessName ? `Place the pin for ${businessName}` : 'Place your pin'}
          </Text>
          <Text style={styles.instructionsText}>
            Drag the map so the crosshair sits on your storefront&apos;s front
            door. This is where your pin starts — you can move it or lock it
            anytime from your dashboard.
          </Text>
        </View>

        <View style={styles.mapWrapper}>
          <MapView
            ref={mapRef}
            key={visible ? 'open' : 'closed'}
            provider="google"
            style={styles.map}
            initialRegion={initialRegion}
            onRegionChangeComplete={setCurrentRegion}
            showsUserLocation
            showsMyLocationButton={false}
            loadingEnabled
          />

          {/* Fixed center crosshair — the map moves beneath it */}
          <View pointerEvents="none" style={styles.crosshairContainer}>
            <View style={styles.crosshairPinShadow} />
            <Text style={styles.crosshairPin}>📍</Text>
          </View>

          <TouchableOpacity
            style={styles.centerOnMeBtn}
            onPress={handleCenterOnMe}
            disabled={centeringOnMe}
            activeOpacity={0.85}
          >
            {centeringOnMe ? (
              <ActivityIndicator color="#6C3AED" size="small" />
            ) : (
              <Text style={styles.centerOnMeBtnText}>📍 Center on Me</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          {currentRegion ? (
            <Text style={styles.coordsLabel}>
              {currentRegion.latitude.toFixed(6)},{' '}
              {currentRegion.longitude.toFixed(6)}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.confirmBtn, saving && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={saving || !currentRegion}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.confirmBtnText}>Set Location Here</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  headerSideBtn: {
    minWidth: 72,
    paddingVertical: 6,
  },
  headerCancelText: {
    color: '#6C3AED',
    fontWeight: '600',
    fontSize: 15,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  instructionsBlock: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  instructionsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  instructionsText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  crosshairContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Subtle shadow disc directly below the pin so owners can see where
  // the exact coordinate anchor point sits.
  crosshairPinShadow: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
    // The emoji pin sits ~20px above its text baseline. The shadow disc is
    // the true anchor — centered on the screen, representing the coordinate
    // that will be saved.
    top: '50%',
    marginTop: -6,
  },
  crosshairPin: {
    fontSize: 44,
    // Nudge the emoji up so its tip sits on the shadow disc below.
    marginTop: -32,
  },
  centerOnMeBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 40,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOnMeBtnText: {
    color: '#6C3AED',
    fontWeight: '700',
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 32 : 18,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  coordsLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 10,
    fontVariant: ['tabular-nums'],
  },
  confirmBtn: {
    width: '100%',
    backgroundColor: '#6C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
});

export default StaticPinPickerModal;
