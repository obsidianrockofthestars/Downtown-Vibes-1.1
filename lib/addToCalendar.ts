// 1.6.0 follow-up — "Add to Calendar" helper for event-type posts.
//
// Wraps `expo-calendar`'s native event creation UI. Same pattern Facebook
// Events uses: tap the button on an event card → native calendar app
// opens with title/time/notes/location prefilled → user confirms → event
// lands in their calendar.
//
// Permission flow:
//   - On first call, requests calendar permission
//   - If denied, surfaces a friendly Alert pointing to Settings
//   - If granted, presents the native event-creation UI
//
// Default duration: 2 hours (most casual events). Schema only stores
// event_at (start time); end is inferred. Future: add event_end_at column
// + composer field if creators routinely want to be precise. See
// wiki/redemption-mechanic-spec.md for the parallel "ship the boring
// version first" rationale.

import { Alert, Linking } from 'react-native';
import * as Calendar from 'expo-calendar';

export type AddToCalendarOptions = {
  title: string;
  startDate: Date;
  /** Defaults to 120 (2 hours) when undefined. */
  durationMinutes?: number;
  /** Optional notes — typically the post body. */
  notes?: string;
  /** Optional location string — typically the business address. */
  location?: string;
};

export type AddToCalendarResult =
  | { ok: true; saved: boolean }
  | { ok: false; reason: 'permission_denied' | 'cancelled' | 'error'; error?: string };

export async function addEventToCalendar(
  opts: AddToCalendarOptions
): Promise<AddToCalendarResult> {
  let permission: Calendar.PermissionResponse;
  try {
    permission = await Calendar.requestCalendarPermissionsAsync();
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      error: err instanceof Error ? err.message : 'permission_check_failed',
    };
  }

  if (permission.status !== 'granted') {
    Alert.alert(
      'Calendar permission needed',
      'Allow calendar access in Settings to save events.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            Linking.openSettings().catch(() => {});
          },
        },
      ]
    );
    return { ok: false, reason: 'permission_denied' };
  }

  const durationMs = (opts.durationMinutes ?? 120) * 60 * 1000;
  const endDate = new Date(opts.startDate.getTime() + durationMs);

  try {
    // createEventInCalendarAsync presents the native UI on iOS + Android.
    // User edits any field, hits Add or Cancel; we get { action } back.
    const result = await Calendar.createEventInCalendarAsync({
      title: opts.title,
      startDate: opts.startDate,
      endDate,
      notes: opts.notes,
      location: opts.location,
    });

    // result.action: 'saved' | 'canceled' (varies by Expo SDK version,
    // but the truthy "saved" path is consistent).
    const action = (result as { action?: string } | null | undefined)?.action;
    return { ok: true, saved: action === 'saved' };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      error: err instanceof Error ? err.message : 'create_failed',
    };
  }
}
