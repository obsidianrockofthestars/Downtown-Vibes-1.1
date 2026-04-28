// 1.7.0 — Welcome onboarding modal for FRESH INSTALLS only.
//
// Fires once per device, then never again (gated by AsyncStorage flag
// 'onboardingCompleted_v1' in lib/whatsNewVersion.ts). Existing users on
// upgrade see WhatsNewModal instead, which has different copy.
//
// Currently shows 2 slides (EventsBoardSlide + CyberPressSlide). When/if
// upstream onboarding screens 1-3 (welcome / SSO / permissions) get wired,
// they slot in BEFORE these two — change the slot count + render order
// below. The slide files themselves don't need to change.
//
// Spec: wiki/1-7-onboarding-and-cyber-press-spec.md (Surfaces 1 + 2).

import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/lib/designTokens';
import {
  shouldShowWelcomeOnboarding,
  markOnboardingComplete,
} from '@/lib/whatsNewVersion';
import { EventsBoardSlide, CyberPressSlide } from './onboarding/OnboardingSlides';
import { CyberPressInfoModal } from './CyberPressInfoModal';

export function WelcomeOnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [cyberPressOpen, setCyberPressOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let alive = true;
    shouldShowWelcomeOnboarding().then((should) => {
      if (alive) setVisible(should);
    });
    return () => {
      alive = false;
    };
  }, []);

  const finish = async () => {
    await markOnboardingComplete();
    setVisible(false);
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={finish}
      >
        <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {slideIndex === 0 && (
            <EventsBoardSlide
              mode="firstInstall"
              onContinue={() => setSlideIndex(1)}
              onSkip={finish}
            />
          )}
          {slideIndex === 1 && (
            <CyberPressSlide
              mode="firstInstall"
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
          // After closing the info modal, advance the user out of onboarding.
          // They've engaged enough to learn — don't trap them in welcome flow.
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
  root: {
    flex: 1,
    backgroundColor: colors.surfaceDeep,
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
