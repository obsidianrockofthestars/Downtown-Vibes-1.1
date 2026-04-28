// 1.7.0 — Cyber Press application form (sub-component of CyberPressInfoModal).
//
// Renders the four input fields (email, display name, bio, optional social
// handle) + Submit button. Calls applyForCyberPress() on submit, swaps to
// success state on resolve, surfaces server errors inline on reject.
//
// Spec: wiki/1-7-onboarding-and-cyber-press-spec.md (Surface 4 — apply-form state).

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fonts, fontSizes, radius, space } from '@/lib/designTokens';
import { applyForCyberPress } from '@/lib/cyberPressApi';

interface Props {
  /** Called with the short reference (e.g. "A1B2C3D4") on successful submit. */
  onSuccess: (shortRef: string) => void;
  /** Called when the user taps Back to return to the marketing copy. */
  onBack: () => void;
}

export function CyberPressApplyForm({ onSuccess, onBack }: Props) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await applyForCyberPress({
        email,
        displayName,
        bio,
        socialHandle: socialHandle.trim() || undefined,
      });
      onSuccess(result.shortRef);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again in a minute.');
      setSubmitting(false);
    }
  };

  const bioCharsLeft = 20 - bio.trim().length;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>APPLY</Text>
        <Text style={styles.intro}>
          We review every application personally during the beta. You'll hear back
          within 7 days at the email below.
        </Text>

        <Field label="Email">
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSteel}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!submitting}
          />
        </Field>

        <Field label="Display name" hint='e.g. "Tourism KC", "St. Joe Foodie"'>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your curator name"
            placeholderTextColor={colors.textSteel}
            autoCapitalize="words"
            editable={!submitting}
          />
        </Field>

        <Field
          label="Bio"
          hint={
            bioCharsLeft > 0
              ? `${bioCharsLeft} more character${bioCharsLeft === 1 ? '' : 's'} required`
              : 'Looking good.'
          }
        >
          <TextInput
            style={[styles.input, styles.textarea]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us about your audience and what you'd post about."
            placeholderTextColor={colors.textSteel}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!submitting}
          />
        </Field>

        <Field label="Social handle (optional)" hint="Twitter, Instagram, TikTok, etc.">
          <TextInput
            style={styles.input}
            value={socialHandle}
            onChangeText={setSocialHandle}
            placeholder="@yourhandle"
            placeholderTextColor={colors.textSteel}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
          />
        </Field>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}
            onPress={onBack}
            disabled={submitting}
          >
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              (pressed || submitting) && styles.btnPressed,
              submitting && styles.btnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.submitText}>SUBMIT →</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}
function Field({ label, hint, children }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: space.lg, paddingBottom: space.xxl },
  heading: {
    fontFamily: fonts.display,
    fontSize: fontSizes.display - 8,
    color: colors.neonCyan,
    letterSpacing: 2,
    marginBottom: space.sm,
  },
  intro: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.bodySm,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: space.xl,
  },
  field: { marginBottom: space.lg },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: space.xs,
  },
  input: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.paper,
    borderWidth: 1,
    borderColor: colors.surfaceLeather,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  textarea: { minHeight: 96 },
  hint: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  errorBox: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.stateDanger,
    borderWidth: 1,
    borderRadius: radius.paper,
    padding: space.md,
    marginBottom: space.lg,
  },
  errorText: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.bodySm,
    color: colors.stateDanger,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.lg,
  },
  backBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  backText: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.body,
    color: colors.textMuted,
  },
  submitBtn: {
    backgroundColor: colors.neonPurple,
    paddingHorizontal: space.xl,
    paddingVertical: space.md + 2,
    borderRadius: radius.pill,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontFamily: fonts.display,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.6 },
});
