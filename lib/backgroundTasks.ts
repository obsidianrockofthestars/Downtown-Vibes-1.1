import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export const GEOFENCE_TASK = 'GEOFENCE_TASK';
const DISMISSED_KEY = 'geofence_dismissed';

export async function clearDismissedGeofences() {
  await AsyncStorage.removeItem(DISMISSED_KEY);
}

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Geofence task error:', error.message);
    return;
  }

  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };

  if (eventType !== Location.GeofencingEventType.Enter) return;
  const regionId = region?.identifier;
  if (!regionId) return;

  try {
    const isExpoGoAndroid = Platform.OS === 'android' && !!Constants.expoGoConfig;
    // Expo Go removed remote push support on Android; skip notification scheduling here.
    if (isExpoGoAndroid) return;

    const Notifications = await import('expo-notifications');

    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    const dismissed: string[] = raw ? JSON.parse(raw) : [];

    if (dismissed.includes(regionId)) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Downtown Vibes Alert!',
        body: 'You are near a spot! Open the app to check for deals.',
        data: { regionId },
      },
      trigger: null,
    });

    dismissed.push(regionId);
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  } catch (err) {
    console.warn('Geofence notification error:', err);
  }
});
