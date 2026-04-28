// 1.7.0 — Cyber Press info modal (the awareness + apply surface).
//
// Three internal states:
//   1. 'marketing' — pitch copy + Apply CTA + Close (default on open)
//   2. 'form'      — inputs (CyberPressApplyForm sub-component)
//   3. 'success'   — application reference + done (after RPC resolve)
//
// Spec: wiki/1-7-onboarding-and-cyber-press-spec.md (Surface 4).

import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, fontSizes, radius, space } from '@/lib/designTokens';
import { CyberPressApplyForm } from './CyberPressApplyForm';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Stage = 'marketing' | 'form' | 'success';

export function CyberPressInfoModal({ visible, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('marketing');
  const [shortRef, setShortRef] = useState<string>('');
  const insets = useSafeAreaInsets();

  const reset = () => {
    setStage('marketing');
    setShortRef('');
  };

  const handleClose = () => {
    onClose();
    // Defer reset until the modal animates out so the user doesn't see it flip back
    setTimeout(reset, 250);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerKicker}>// CYBER PRESS — CURATOR TIER</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Cyber Press info"
            hitSlop={12}
            onPress={handleClose}
            style={styles.dismiss}
          >
            <Text style={styles.dismissX}>×</Text>
          </Pressable>
        </View>

        {stage === 'marketing' && (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>CYBER{'\n'}PRESS</Text>
            <Text style={styles.subtitle}>// the curator tier</Text>

            <Text style={styles.body}>
              Cyber Press is for people who want to promote their downtown without
              owning a single business.
            </Text>

            <Section heading="You can post:">
              <Bullet>Events you're hosting or aware of</Bullet>
              <Bullet>Announcements that matter to your region</Bullet>
              <Bullet>Spotlights featuring businesses you love</Bullet>
            </Section>

            <Text style={[styles.body, styles.bodyEmphasis]}>
              Every spotlight tags a real business in our directory — local owners
              always get attribution back. No free-floating ads, no attribution
              theft.
            </Text>

            <Section heading="You can't post:">
              <Bullet>Flash sales, static map pins, vibe checks, business updates</Bullet>
              <Bullet>(those are reserved for the actual business owners)</Bullet>
            </Section>

            <View style={styles.priceBlock}>
              <Text style={styles.priceTitle}>BETA — FREE for 6 months</Text>
              <Text style={styles.priceBody}>
                After that, $4.99/month. Cancel anytime.
              </Text>
              <Text style={styles.priceFootnote}>
                We're manually approving each application during the beta so every
                curator gets a 15-min onboarding call.
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.applyBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => setStage('form')}
              >
                <Text style={styles.applyText}>APPLY NOW →</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.closeBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={handleClose}
              >
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {stage === 'form' && (
          <CyberPressApplyForm
            onBack={() => setStage('marketing')}
            onSuccess={(ref) => {
              setShortRef(ref);
              setStage('success');
            }}
          />
        )}

        {stage === 'success' && (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.successCheck}>✓</Text>
            <Text style={styles.successTitle}>APPLICATION RECEIVED</Text>
            <Text style={styles.refLine}>
              Reference: <Text style={styles.refMono}>#{shortRef}</Text>
            </Text>
            <Text style={styles.body}>
              Dylan reviews each application personally during the beta. You'll hear
              back within 7 days at the email you provided.
            </Text>
            <Text style={styles.body}>
              While you wait — if you're feeling impatient — DM us on Instagram
              @downtownvibes or reply to the confirmation email we send.
            </Text>
            <View style={styles.buttonRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.applyBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={handleClose}
              >
                <Text style={styles.applyText}>DONE</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{heading}</Text>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>›</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
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
  scroll: {
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: fontSizes.display + 6,
    color: colors.textPrimary,
    letterSpacing: 2,
    lineHeight: 50,
    marginTop: space.lg,
  },
  subtitle: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.bodySm,
    color: colors.neonCyan,
    letterSpacing: 1,
    marginBottom: space.xl,
  },
  body: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: space.lg,
  },
  bodyEmphasis: {
    color: colors.textPrimary,
    fontFamily: fonts.monoBold,
  },
  section: { marginBottom: space.lg },
  sectionHeading: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.bodySm,
    color: colors.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: space.sm,
  },
  bulletRow: { flexDirection: 'row', marginBottom: space.xs },
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
  priceBlock: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.neonCyan,
    padding: space.lg,
    marginVertical: space.lg,
  },
  priceTitle: {
    fontFamily: fonts.display,
    fontSize: fontSizes.h2,
    color: colors.neonCyan,
    letterSpacing: 1,
    marginBottom: space.xs,
  },
  priceBody: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    marginBottom: space.sm,
  },
  priceFootnote: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.lg,
  },
  applyBtn: {
    backgroundColor: colors.neonPurple,
    paddingHorizontal: space.xl,
    paddingVertical: space.md + 2,
    borderRadius: radius.pill,
    flex: 1,
    alignItems: 'center',
  },
  applyText: {
    fontFamily: fonts.display,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  closeBtn: {
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  closeText: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.body,
    color: colors.textMuted,
  },
  btnPressed: { opacity: 0.85 },
  successCheck: {
    fontFamily: fonts.display,
    fontSize: 64,
    color: colors.neonCyan,
    textAlign: 'center',
    marginTop: space.xl,
    marginBottom: space.lg,
  },
  successTitle: {
    fontFamily: fonts.display,
    fontSize: fontSizes.h1,
    color: colors.textPrimary,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: space.lg,
  },
  refLine: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: space.xl,
  },
  refMono: {
    fontFamily: fonts.monoBold,
    color: colors.neonCyan,
    letterSpacing: 1.5,
  },
});
