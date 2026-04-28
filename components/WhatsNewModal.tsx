// 1.7.0 — "What's New" modal for EXISTING USERS on first foreground after
// upgrading from any earlier version (1.4.x / 1.5.x / 1.6.x → 1.7.0).
//
// Single-fire per major version. Gated by 'lastSeenWhatsNewVersion' in
// AsyncStorage. Fresh installs do NOT see this — they see
// WelcomeOnboardingModal instead.
//
// Two slides:
//   1. Events Board retroactive context (1.6 feature)
//   2. Cyber Press forward pitch (1.7 feature)
//
// Spec: wiki/1-7-onboarding-and-cyber-press-spec.md (Surface 3).

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, fontSizes, space } from '@/lib/designTokens';
import { shouldShowWhatsNew, markWhatsNewSeen } from '@/lib/whatsNewVersion';
import { EventsBoardSlide, CyberPressSlide } from './onboarding/OnboardingSlides';
import { CyberPressInfoModal } from './CyberPressInfoModal';

export function WhatsNewModal() {
  const [visible, setVisible] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [cyberPressOpen, setCyberPressOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let alive = true;
    shouldShowWhatsNew().then((should) => {
      if (alive) setVisible(should);
    });
    return () => {
      alive = false;
    };
  }, []);

  const finish = async () => {
    await markWhatsNewSeen();
    setVisible(false);
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={finish}
      >
        <View style={[styles.root, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Text style={styles.headerKicker}>// WHAT'S NEW IN 1.7</Text>
            <Pressable hitSlop={12} onPress={finish} style={styles.dismiss}>
              <Text style={styles.dismissX}>×</Text>
            </Pressable>
          </View>

          {slideIndex === 0 && (
            <EventsBoardSlide
              mode="update"
              onContinue={() => setSlideIndex(1)}
            />
          )}
          {slideIndex === 1 && (
            <CyberPressSlide
              mode="update"
              onTellMeMore={() => setCyberPressOpen(true)}
              onSkip={finish}
            />
          )}

          <View style={styles.dotRow}>
            <Dot active={slideIndex === 0} />
            <Dot active={slideIndex === 1} />
          </View>
        </View>
      </Modal>

      <CyberPressInfoModal
        visible={cyberPressOpen}
        onClose={() => {
          setCyberPressOpen(false);
          setTimeout(finish, 300);
        }}
      />
    </>
  );
}

function Dot({ active }: { active: boolean }) {
  return <View style={[styles.dot, active && styles.dotActive]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceDeep },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLeather,
  },
  headerKicker: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    letterSpacing: 1.5,
    color: colors.neonCyan,
  },
  dismiss: { paddingHorizontal: space.sm },
  dismissX: {
    fontFamily: fonts.mono,
    fontSize: 26,
    color: colors.textMuted,
    lineHeight: 26,
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceLeather,
  },
  dotActive: {
    backgroundColor: colors.neonCyan,
    width: 24,
  },
});
