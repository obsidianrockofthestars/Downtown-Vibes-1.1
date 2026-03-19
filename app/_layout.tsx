import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Constants from 'expo-constants';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { isRunningInExpoGo } from '@/lib/expoGo';
import '../lib/backgroundTasks';
import { clearDismissedGeofences } from '../lib/backgroundTasks';

const RC_APPLE_KEY = process.env.EXPO_PUBLIC_RC_APPLE_KEY ?? '';
const RC_GOOGLE_KEY = process.env.EXPO_PUBLIC_RC_GOOGLE_KEY ?? '';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function RootInner() {
  const { user } = useAuth();
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    clearDismissedGeofences();

    if (isRunningInExpoGo) {
      console.log('Running in Expo Go: Skipping RevenueCat initialization.');
      return;
    }

    Purchases.setLogLevel(LOG_LEVEL.ERROR);

    const key = Platform.OS === 'ios' ? RC_APPLE_KEY : RC_GOOGLE_KEY;
    if (key) {
      Purchases.configure({ apiKey: key });
    }
  }, []);

  useEffect(() => {
    if (isRunningInExpoGo) return;

    if (user && user.id !== prevUserId.current) {
      prevUserId.current = user.id;
      Purchases.logIn(user.id).catch(() => {});
    } else if (!user && prevUserId.current) {
      prevUserId.current = null;
      Purchases.logOut().catch(() => {});
    }
  }, [user]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();

      (async () => {
        // Expo Go removed remote push support on Android (SDK 53+).
        // Avoid loading `expo-notifications` in that environment to prevent crashes.
        const isExpoGoAndroid =
          Platform.OS === 'android' && !!Constants.expoGoConfig;
        if (isExpoGoAndroid) return;

        const Notifications = await import('expo-notifications');

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
          });
        }
      })().catch((err) => {
        // Non-fatal; notifications can be disabled in some environments.
        console.warn('Notifications init failed:', err);
      });
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootInner />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

export default RootLayout;
