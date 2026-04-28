// 1.7.0 — Cyber Press awareness banner.
//
// Renders at the top of app/(tabs)/events.tsx. Always visible until the user
// dismisses it (sets cyberPressBannerDismissed_v1 in AsyncStorage). Tapping
// the banner body opens the CyberPressInfoModal. Dismiss "X" suppresses the
// banner on this device until next major version.
//
// Spec: wiki/1-7-onboarding-and-cyber-press-spec.md (Surface 4 entry point #1).

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSizes, radius, space } from '@/lib/designTokens';
import {
  isCyberPressBannerDismissed,
  dismissCyberPressBanner,
} from '@/lib/whatsNewVersion';

interface Props {
  onPress: () => void;
}

export function CyberPressBanner({ onPress }: Props) {
  const [hidden, setHidden] = useState(true); // start hidden, reveal after AsyncStorage check

  useEffect(() => {
    let alive = true;
    isCyberPressBannerDismissed().then((dismissed) => {
      if (alive) setHidden(dismissed);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleDismiss = async () => {
    setHidden(true);
    await dismissCyberPressBanner();
  };

  if (hidden) return null;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Learn about the Cyber Press curator tier"
        onPress={onPress}
        style={({ pressed }) => [styles.body, pressed && styles.bodyPressed]}
      >
        <Text style={styles.kicker}>// CYBER PRESS</Text>
        <Text style={styles.title}>Curate events for your downtown</Text>
        <Text style={styles.cta}>Tap to learn more →</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss Cyber Press banner"
        hitSlop={8}
        onPress={handleDismiss}
        style={styles.dismiss}
      >
        <Text style={styles.dismissX}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: space.lg,
    marginTop: space.md,
    marginBottom: space.sm,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.neonCyan,
    backgroundColor: colors.surfaceBase,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  bodyPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    letterSpacing: 1.5,
    color: colors.neonCyan,
    marginBottom: 2,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: fontSizes.h2,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  cta: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.caption,
    color: colors.neonCyan,
    marginTop: 4,
  },
  dismiss: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.surfaceLeather,
  },
  dismissX: {
    fontFamily: fonts.mono,
    fontSize: 22,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
