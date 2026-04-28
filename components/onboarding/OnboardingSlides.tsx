// 1.7.0 — Reusable slide components used by BOTH WelcomeOnboardingModal
// (first-install, full 5-screen flow) and WhatsNewModal (existing-user
// update, 2-screen flow).
//
// Exports:
//   <EventsBoardSlide />  — Surface 1 / What's New screen 1
//   <CyberPressSlide />   — Surface 2 / What's New screen 2
//
// Spec: wiki/1-7-onboarding-and-cyber-press-spec.md (Surfaces 1 + 2 + 3).

import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSizes, radius, space } from '@/lib/designTokens';

interface SlideProps {
  /** 'firstInstall' uses the onboarding copy; 'update' prefixes with "NEW:" */
  mode?: 'firstInstall' | 'update';
}

interface EventsBoardSlideProps extends SlideProps {
  onContinue: () => void;
  onSkip?: () => void;
}

export function EventsBoardSlide({ mode = 'firstInstall', onContinue, onSkip }: EventsBoardSlideProps) {
  const title = mode === 'update' ? 'NEW:\nEVENTS BOARD' : 'EVENTS BOARD';
  return (
    <View style={styles.slide}>
      <View style={styles.heroBox}>
        <Image
          source={require('@/assets/images/hero-rider.png')}
          style={styles.heroImg}
          resizeMode="contain"
        />
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.kicker}>// real-time dispatches from your downtown</Text>

      <View style={styles.bullets}>
        <BulletRow text="See what's happening within 1, 3, 5, 10, or 25 miles" />
        <BulletRow text="Filter by events, announcements, vibes, hiring, or updates" />
        <BulletRow text="Heart your favorites. Wire any event to your phone's calendar." />
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
          onPress={onContinue}
        >
          <Text style={styles.primaryText}>
            {mode === 'update' ? 'NEXT →' : 'CONTINUE →'}
          </Text>
        </Pressable>
        {onSkip && (
          <Pressable onPress={onSkip} hitSlop={8} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

interface CyberPressSlideProps extends SlideProps {
  onTellMeMore: () => void;
  onSkip: () => void;
}

export function CyberPressSlide({ mode = 'firstInstall', onTellMeMore, onSkip }: CyberPressSlideProps) {
  const title = mode === 'update' ? 'NEW:\nCYBER PRESS' : 'CYBER PRESS';
  return (
    <View style={styles.slide}>
      <View style={styles.badgeBox}>
        <Text style={styles.badgeKicker}>// PRESS CREDENTIAL</Text>
        <Text style={styles.badgeName}>CYBER PRESS</Text>
        <View style={styles.badgeUnderline} />
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.kicker}>// the curator tier</Text>

      <Text style={styles.body}>
        Don't own a business but want to promote your downtown?
      </Text>
      <Text style={styles.body}>
        Tourism bloggers, event organizers, "things to do" newsletter writers —
        Cyber Press lets you post events and spotlights for businesses you love,
        without needing a pin on the map.
      </Text>
      <Text style={[styles.body, styles.bodyEmphasis]}>
        Free during the beta. $4.99/mo when paid launches.
      </Text>

      <View style={styles.buttonRow}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
          onPress={onTellMeMore}
        >
          <Text style={styles.primaryText}>TELL ME MORE →</Text>
        </Pressable>
        <Pressable onPress={onSkip} hitSlop={8} style={styles.skipBtn}>
          <Text style={styles.skipText}>
            {mode === 'update' ? 'Done' : 'Maybe later'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function BulletRow({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>›</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.lg,
    justifyContent: 'space-between',
  },
  heroBox: {
    alignItems: 'center',
    marginBottom: space.lg,
  },
  heroImg: {
    width: 180,
    height: 160,
  },
  badgeBox: {
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: colors.neonCyan,
    borderRadius: radius.paper,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    marginBottom: space.xl,
    backgroundColor: colors.surfaceBase,
  },
  badgeKicker: {
    fontFamily: fonts.pixel,
    fontSize: fontSizes.micro,
    color: colors.neonCyan,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  badgeName: {
    fontFamily: fonts.display,
    fontSize: fontSizes.h1,
    color: colors.textPrimary,
    letterSpacing: 2,
    marginVertical: 4,
    textAlign: 'center',
  },
  badgeUnderline: {
    height: 2,
    backgroundColor: colors.neonCyan,
    width: '100%',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: fontSizes.display - 4,
    color: colors.textPrimary,
    letterSpacing: 2,
    lineHeight: 44,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.bodySm,
    color: colors.neonCyan,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: space.xl,
  },
  bullets: { marginBottom: space.lg },
  bulletRow: { flexDirection: 'row', marginBottom: space.md, paddingHorizontal: space.sm },
  bulletDot: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.body,
    color: colors.neonCyan,
    width: 16,
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  body: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: space.md,
    textAlign: 'center',
  },
  bodyEmphasis: {
    color: colors.neonCyan,
    fontFamily: fonts.monoBold,
  },
  buttonRow: {
    alignItems: 'center',
    gap: space.sm,
  },
  primaryBtn: {
    backgroundColor: colors.neonPurple,
    paddingHorizontal: space.xxl,
    paddingVertical: space.md + 2,
    borderRadius: radius.pill,
    minWidth: 220,
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: fonts.display,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  skipBtn: { paddingVertical: space.sm },
  skipText: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.bodySm,
    color: colors.textMuted,
  },
  btnPressed: { opacity: 0.85 },
});
