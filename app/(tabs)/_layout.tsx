import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// @ts-ignore
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/context/AuthContext';
import { isDowntownFeedEnabled } from '@/lib/featureFlags';

function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [eventsTabVisible, setEventsTabVisible] = useState(false);

  // Soft-launch gate — fetch the feature_flags app_config row on mount and
  // when the auth user changes. Fail-closed (hidden) on transient errors.
  // See wiki/downtown-feed-build-plan.md (Session 7).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const allowed = await isDowntownFeedEnabled(user?.id);
      if (!cancelled) setEventsTabVisible(allowed);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6C3AED',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F3F4F6',
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 6,
          height: 56 + Math.max(insets.bottom, 6),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
        },
        headerStyle: {
          backgroundColor: '#FFFFFF',
        },
        headerTitleStyle: {
          fontWeight: '700' as const,
          color: '#1F2937',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          headerShown: false,
          tabBarIcon: ({ color, size }: any) => (
            <Ionicons name="map" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          headerShown: false,
          // href: null hides the tab from the bar without unregistering the
          // route. When the soft-launch flag flips on (Supabase dashboard
          // edit on app_config row 'feature_flags'), the tab appears for
          // the next launch — no code deploy needed.
          href: eventsTabVisible ? ('/(tabs)/events' as any) : null,
          tabBarIcon: ({ color, size }: any) => (
            <Ionicons name="newspaper-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          headerTitle: 'Account',
          tabBarIcon: ({ color, size }: any) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="login"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

export default TabLayout;
