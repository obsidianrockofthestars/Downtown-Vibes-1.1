module.exports = {
  expo: {
    name: 'DowntownVibes',
    slug: 'Vibeathon',
    version: '1.3.4',
    orientation: 'portrait',
    icon: './assets/images/icon.png.png',
    scheme: 'vibeathon',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/images/DowntownVibes.jpg',
      resizeMode: 'cover',
      backgroundColor: '#6C3AED',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.potionsandfamiliars.downtownvibes',
      buildNumber: '11',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          'DowntownVibes uses your location to show nearby businesses and flash sale alerts.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Allow DowntownVibes to use your location in the background to send you notifications when you walk near an active flash sale.',
        UIBackgroundModes: ['location', 'fetch'],
      },
    },
    android: {
      versionCode: 11,
      adaptiveIcon: {
        backgroundColor: '#6C3AED',
        foregroundImage: './assets/images/icon.png.png',
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
      favicon: './assets/images/icon.png.png',
    },
    plugins: [
      './plugins/withGradleMavenMirror',
      'expo-router',
      'expo-secure-store',
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
          icon: './assets/images/icon.png.png',
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
