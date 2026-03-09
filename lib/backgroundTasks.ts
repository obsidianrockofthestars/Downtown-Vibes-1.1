import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

export const GEOFENCE_TASK = 'GEOFENCE_TASK';

TaskManager.defineTask(GEOFENCE_TASK, ({ data, error }) => {
  if (error) {
    console.warn('Geofence task error:', error.message);
    return;
  }

  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };

  if (eventType === Location.GeofencingEventType.Enter) {
    Notifications.scheduleNotificationAsync({
      content: {
        title: 'Downtown Vibes Alert!',
        body: 'You are near a spot! Open the app to check for deals.',
        data: { regionId: region.identifier },
      },
      trigger: null,
    });
  }
});
