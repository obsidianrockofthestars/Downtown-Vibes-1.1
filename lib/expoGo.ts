import Constants from 'expo-constants';

/** True when running inside the Expo Go client (sandbox). Use to skip native SDKs that crash in Go (e.g. RevenueCat). */
export const isRunningInExpoGo = Constants.appOwnership === 'expo';
