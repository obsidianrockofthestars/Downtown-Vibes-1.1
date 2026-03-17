import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    const dismissed: string[] = raw ? JSON.parse(raw) : [];

    if (dismissed.includes(region.identifier)) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Downtown Vibes Alert!',
        body: 'You are near a spot! Open the app to check for deals.',
        data: { regionId: region.identifier },
      },
      trigger: null,
    });

    dismissed.push(region.identifier);
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  } catch (err) {
    console.warn('Geofence notification error:', err);
  }
});
