/**
 * VersionGateModal
 *
 * Soft nudge or hard block telling the user to update the app.
 *
 * Mounted once at the app shell (see app/_layout.tsx). Fetches the version
 * config on mount + on app foreground, compares against the running binary,
 * and:
 *   - If `status === 'required'`: renders a blocking modal that cannot be
 *     dismissed. Only action is "Update Now" → opens the store.
 *   - If `status === 'recommended'`: renders a dismissable modal. Dismissal
 *     is remembered for 24 hours, but only for the current `latest` version —
 *     a new release invalidates the dismissal.
 *   - Otherwise: renders nothing.
 *
 * See lib/versionGate.ts for evaluation logic + caching behavior.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  VersionGateResult,
  dismissVersionNudge,
  evaluateVersionGate,
  isVersionNudgeDismissed,
} from '@/lib/versionGate';

const BRAND_PURPLE = '#6C3AED';

export function VersionGateModal() {
  const [result, setResult] = useState<VersionGateResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const evaluate = useCallback(async () => {
    const r = await evaluateVersionGate();
    setResult(r);
    if (r?.status === 'recommended') {
      const wasDismissed = await isVersionNudgeDismissed(r.latest);
      setDismissed(wasDismissed);
    } else {
      setDismissed(false);
    }
  }, []);

  // On mount: evaluate once.
  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  // On foreground: re-evaluate. Handles the case where Dylan flips the
  // `minRequired` flag in Supabase while a user has the app backgrounded —
  // next time they foreground, they get the gate.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void evaluate();
      }
    });
    return () => sub.remove();
  }, [evaluate]);

  if (!result) return null;
  if (result.status === 'ok') return null;
  if (result.status === 'recommended' && dismissed) return null;

  const isRequired = result.status === 'required';

  const handleUpdate = () => {
    Linking.openURL(result.storeUrl).catch(() => {
      // Non-fatal. The user can still open the store manually.
    });
  };

  const handleLater = async () => {
    await dismissVersionNudge(result.latest);
    setDismissed(true);
  };

  const title = isRequired
    ? 'Update Required'
    : 'A New Version Is Available';

  const body = isRequired
    ? `This version of Downtown Vibes is no longer supported. Please update to continue using the app.`
    : `You're on ${result.runningVersion}. The latest is ${result.latest}. We recommend updating for bug fixes and new features.`;

  const storeLabel =
    Platform.OS === 'ios' ? 'Open App Store' : 'Open Google Play';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Android hardware back button. Only dismissable in recommended mode.
        if (!isRequired) {
          void handleLater();
        }
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleUpdate}
            accessibilityRole="button"
            accessibilityLabel={storeLabel}
          >
            <Text style={styles.primaryButtonText}>{storeLabel}</Text>
          </TouchableOpacity>

          {!isRequired && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleLater}
              accessibilityRole="button"
              accessibilityLabel="Remind me later"
            >
              <Text style={styles.secondaryButtonText}>Later</Text>
            </TouchableOpacity>
          )}

          {isRequired && (
            <Text style={styles.footnote}>
              Version {result.runningVersion} → update to {result.latest}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: BRAND_PURPLE,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '500',
  },
  footnote: {
    marginTop: 12,
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
