// 1.6.0 Downtown Feed Phase 1, Session 3 — Owner-side post composer.
// Pushed route reachable from the owner dashboard via:
//   router.push({ pathname: '/owner/post-composer', params: { businessId } })
//
// Form fields (per wiki/downtown-feed-spec.md):
//   - post_type: dropdown — event / vibe / update / employee / announcement
//   - title: optional, max 100 chars
//   - body: required, max 500 chars (server-side CHECK enforces too)
//   - event_at: optional, only when post_type === 'event'
//
// Server-side enforcement:
//   - posts RLS INSERT requires auth.uid() = businesses.owner_id
//   - enforce_post_moderation trigger rejects profanity in title/body
//   Both surfaced inline via Alert on submit.
//
// Customer-side users (role !== 'owner', or no business) cannot reach this
// route via UI and would also be blocked at INSERT time by RLS even if they
// somehow navigated here.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { matchBlockedWord } from '@/lib/profanityFilter';
import { PostType } from '@/lib/types';

type EditMode = {
  postId: string;
  initialPostType: PostType;
  initialTitle: string;
  initialBody: string;
  initialEventAt: string | null;
};

const POST_TYPES: { key: PostType; label: string; emoji: string; help: string }[] = [
  {
    key: 'update',
    label: 'Update',
    emoji: '📣',
    help: 'New menu item, hours change, general news.',
  },
  {
    key: 'event',
    label: 'Event',
    emoji: '📅',
    help: 'Live music, trivia night, anything with a date.',
  },
  {
    key: 'announcement',
    label: 'Announcement',
    emoji: '📢',
    help: '"Closed Sunday for staff training," "moving locations."',
  },
  {
    key: 'employee',
    label: 'Employee',
    emoji: '👋',
    help: 'Introduce a new face. ("Meet Sarah, our weekend barista.")',
  },
  {
    key: 'vibe',
    label: 'Vibe',
    emoji: '✨',
    help: 'Quick mood/energy update from the shop.',
  },
];

const BODY_MAX = 500;
const TITLE_MAX = 100;

export default function PostComposer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    businessId?: string;
    businessName?: string;
    // Edit mode — populated when navigating from a post-history item
    postId?: string;
    initialPostType?: string;
    initialTitle?: string;
    initialBody?: string;
    initialEventAt?: string;
  }>();

  const businessId = params.businessId ?? '';
  const businessName = params.businessName ?? 'your business';

  const editMode: EditMode | null = params.postId
    ? {
        postId: params.postId,
        initialPostType: (params.initialPostType ?? 'update') as PostType,
        initialTitle: params.initialTitle ?? '',
        initialBody: params.initialBody ?? '',
        initialEventAt: params.initialEventAt ?? null,
      }
    : null;

  const [postType, setPostType] = useState<PostType>(
    editMode?.initialPostType ?? 'update'
  );
  const [title, setTitle] = useState<string>(editMode?.initialTitle ?? '');
  const [body, setBody] = useState<string>(editMode?.initialBody ?? '');
  const [eventAt, setEventAt] = useState<Date>(
    editMode?.initialEventAt
      ? new Date(editMode.initialEventAt)
      : new Date(Date.now() + 24 * 60 * 60 * 1000)
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'date' | 'time'>('date');
  const [submitting, setSubmitting] = useState(false);

  const trimmedBody = body.trim();
  const trimmedTitle = title.trim();
  const canSubmit =
    trimmedBody.length > 0 && trimmedBody.length <= BODY_MAX && !submitting;

  const onPickerChange = (event: { type?: string }, selected?: Date) => {
    setDatePickerOpen(false);
    if (event?.type === 'set' && selected) {
      setEventAt(selected);
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'Sign in as the business owner to post.');
      return;
    }
    if (!businessId) {
      Alert.alert(
        'No business selected',
        'Open the composer from your owner dashboard.'
      );
      return;
    }
    if (!trimmedBody) {
      Alert.alert('Body required', 'Add some content before posting.');
      return;
    }
    if (trimmedBody.length > BODY_MAX) {
      Alert.alert(
        'Body too long',
        `Posts are limited to ${BODY_MAX} characters.`
      );
      return;
    }

    // Client-side profanity check — instant feedback before round-tripping
    // to the server. Server-side enforce_post_moderation is the authority.
    const blockedBody = matchBlockedWord(trimmedBody);
    if (blockedBody !== null) {
      Alert.alert(
        'Post not allowed',
        'Your post contains words that are not allowed. Please revise. If you believe this is an error, contact support@potionsandfamiliars.com.'
      );
      return;
    }
    if (trimmedTitle) {
      const blockedTitle = matchBlockedWord(trimmedTitle);
      if (blockedTitle !== null) {
        Alert.alert(
          'Title not allowed',
          'Your post title contains words that are not allowed. Please revise. If you believe this is an error, contact support@potionsandfamiliars.com.'
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        business_id: businessId,
        author_user_id: user.id,
        post_type: postType,
        title: trimmedTitle || null,
        body: trimmedBody,
        event_at: postType === 'event' ? eventAt.toISOString() : null,
      };

      const { error } = editMode
        ? await supabase
            .from('posts')
            .update({
              post_type: payload.post_type,
              title: payload.title,
              body: payload.body,
              event_at: payload.event_at,
            })
            .eq('id', editMode.postId)
        : await supabase.from('posts').insert(payload);

      if (error) {
        // Server-side moderation rejection (check_violation) or RLS denial.
        // Translate the RLS error to user-friendly copy: posts.RLS only
        // allows the business OWNER to insert/update posts for that
        // business, which is the explicit "businesses-only" guarantee.
        const lower = error.message.toLowerCase();
        const friendly = lower.includes('row-level security')
          ? 'Only the business owner can post for this business.'
          : lower.includes('check_violation') ||
              lower.includes('not allowed')
            ? 'Your post contains words that are not allowed. Please revise. If you believe this is an error, contact support@potionsandfamiliars.com.'
            : error.message;
        Alert.alert('Could not post', friendly);
        return;
      }
      Alert.alert(
        editMode ? 'Post updated' : 'Posted',
        editMode
          ? 'Your changes are live on the Downtown feed.'
          : 'Your post is live on the Downtown feed.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not post', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.headerCancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {editMode ? 'Edit Post' : 'Post to Downtown'}
        </Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.7}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {submitting ? (
            <ActivityIndicator color="#6C3AED" />
          ) : (
            <Text
              style={[
                styles.headerPost,
                !canSubmit && styles.headerPostDisabled,
              ]}
            >
              {editMode ? 'Save' : 'Post'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.businessLine}>
            Posting as <Text style={styles.businessLineBold}>{businessName}</Text>
          </Text>

          <Text style={styles.fieldLabel}>Post type</Text>
          <View style={styles.typeGrid}>
            {POST_TYPES.map((t) => {
              const active = postType === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setPostType(t.key)}
                  style={[styles.typeBtn, active && styles.typeBtnActive]}
                >
                  <Text style={styles.typeBtnEmoji}>{t.emoji}</Text>
                  <Text
                    style={[
                      styles.typeBtnLabel,
                      active && styles.typeBtnLabelActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.helpText}>
            {POST_TYPES.find((t) => t.key === postType)?.help}
          </Text>

          {postType === 'event' ? (
            <View style={styles.eventBox}>
              <Text style={styles.fieldLabel}>When</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity
                  style={styles.dateBtn}
                  activeOpacity={0.7}
                  onPress={() => {
                    setDatePickerMode('date');
                    setDatePickerOpen(true);
                  }}
                >
                  <Text style={styles.dateBtnLabel}>Date</Text>
                  <Text style={styles.dateBtnValue}>
                    {eventAt.toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dateBtn}
                  activeOpacity={0.7}
                  onPress={() => {
                    setDatePickerMode('time');
                    setDatePickerOpen(true);
                  }}
                >
                  <Text style={styles.dateBtnLabel}>Time</Text>
                  <Text style={styles.dateBtnValue}>
                    {eventAt.toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </TouchableOpacity>
              </View>
              {datePickerOpen ? (
                <DateTimePicker
                  value={eventAt}
                  mode={datePickerMode}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onPickerChange}
                />
              ) : null}
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Title (optional)</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
            placeholder='e.g. "Live music tonight"'
            placeholderTextColor="#9CA3AF"
            maxLength={TITLE_MAX}
          />

          <Text style={styles.fieldLabel}>Message</Text>
          <TextInput
            style={styles.bodyInput}
            value={body}
            onChangeText={(t) => setBody(t.slice(0, BODY_MAX))}
            placeholder="What do you want your downtown to know?"
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
            maxLength={BODY_MAX}
          />
          <Text
            style={[
              styles.charCount,
              trimmedBody.length > BODY_MAX - 50 && styles.charCountWarn,
            ]}
          >
            {trimmedBody.length} / {BODY_MAX}
          </Text>

          <Text style={styles.helpText}>
            Most successful businesses post 2–3 times a week. Quality &gt;
            quantity.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerBtn: {
    minWidth: 60,
    minHeight: 32,
    justifyContent: 'center',
  },
  headerCancel: {
    fontSize: 15,
    color: '#6B7280',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  headerPost: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6C3AED',
    textAlign: 'right',
  },
  headerPostDisabled: {
    color: '#D1D5DB',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  businessLine: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 18,
  },
  businessLineBold: {
    fontWeight: '700',
    color: '#111827',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 12,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeBtn: {
    minWidth: 90,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#6C3AED',
  },
  typeBtnEmoji: {
    fontSize: 22,
    marginBottom: 2,
  },
  typeBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  typeBtnLabelActive: {
    color: '#6C3AED',
    fontWeight: '700',
  },
  helpText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 16,
  },
  eventBox: {
    marginTop: 6,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  dateBtnLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 2,
  },
  dateBtnValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  titleInput: {
    fontSize: 15,
    color: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  bodyInput: {
    fontSize: 15,
    color: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    minHeight: 140,
  },
  charCount: {
    alignSelf: 'flex-end',
    marginTop: 6,
    fontSize: 12,
    color: '#9CA3AF',
  },
  charCountWarn: {
    color: '#DC2626',
    fontWeight: '700',
  },
});
