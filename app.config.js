module.exports = {
  expo: {
    name: 'DowntownVibes',
    slug: 'Vibeathon',
    version: '1.4.5',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
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
      buildNumber: '17',
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
      versionCode: 17,
      adaptiveIcon: {
        backgroundColor: '#6C3AED',
        foregroundImage: './assets/images/icon.png',
      },
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION'],
      package: 'com.potionsandfamiliars.downtownvibes',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/icon.png',
    },
    plugins: [
      './plugins/withGradleMavenMirror',
      'expo-router',
      'expo-secure-store',
      'expo-web-browser',
      // Sign in with Apple (iOS only). This plugin adds the
      // `com.apple.developer.applesignin` entitlement during prebuild; it's
      // required by Apple's Guideline 4.8 any time the app also offers
      // third-party SSO (Google/Facebook). Android build is unaffected —
      // expo-apple-authentication is a no-op outside iOS.
      'expo-apple-authentication',
      // Sign in with Google — native SDK on both iOS and Android.
      //   - iOS: Apple requires a URL scheme matching the REVERSED iOS client
      //     ID so Google's consent sheet can callback into the app. The iOS
      //     client ID in our Google Cloud project is
      //     221850025715-ructeajgl0ud42jh6rr3le5634i7dr4i.apps.googleusercontent.com,
      //     which reversed becomes the `iosUrlScheme` below.
      //   - Android: no config here; the keystore's SHA-1 is bound to an
      //     Android OAuth client in Google Cloud Console, and the native
      //     SDK picks up the package name automatically.
      //   - Web client ID (used by Supabase for token exchange) lives in
      //     AuthContext.tsx's GoogleSignin.configure() call, not here.
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme:
            'com.googleusercontent.apps.221850025715-ructeajgl0ud42jh6rr3le5634i7dr4i',
        },
      ],
      // react-native-maps — uses the library's own Expo config plugin (1.18+).
      // Writes GMSApiKey to Info.plist on iOS and the meta-data key to
      // AndroidManifest.xml on Android, and injects the correct GoogleMaps
      // CocoaPod via post-install hook. Replaces the legacy
      // ios.config.googleMapsApiKey + android.config.googleMaps.apiKey paths
      // (Expo's legacy path references a pod name `react-native-google-maps`
      // that no longer exists in r-n-maps 1.27.2 and breaks the iOS build).
      [
        'react-native-maps',
        {
          iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '',
          androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '',
        },
      ],
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
