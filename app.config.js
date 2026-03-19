module.exports = {
  expo: {
    name: 'DowntownVibes',
    slug: 'Vibeathon',
    version: '1.1.1',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'vibeathon',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#6C3AED',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.potionsandfamiliars.downtownvibes',
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'DowntownVibes uses your location to show nearby businesses and flash sale alerts.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Allow DowntownVibes to use your location in the background to send you notifications when you walk near an active flash sale.',
        UIBackgroundModes: ['location', 'fetch'],
      },
    },
    android: {
      versionCode: 4,
      adaptiveIcon: {
        backgroundColor: '#6C3AED',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '',
        },
      },
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION'],
      package: 'com.potionsandfamiliars.downtownvibes',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'DowntownVibes uses your location to show nearby businesses and flash sale alerts.',
          locationAlwaysAndWhenInUsePermission:
            'Allow DowntownVibes to use your location in the background to send you notifications when you walk near an active flash sale.',
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: '#6C3AED',
        },
      ],
    ],
    extra: {
      eas: {
        projectId: 'e27dc9d1-f0ce-45e9-b91b-fb1c2fbe32d7',
      },
    },
    experiments: {
      typedRoutes: true,
    },
  },
};
