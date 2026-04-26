// 1.6.0 Downtown Feed Phase 1, Sessions 4-5 — single post card with
// per-type visual treatment.
//
// Renders a `Post` (joined with business_name + emoji_icon) and dispatches
// taps on the business name to the parent. Used by app/(tabs)/events.tsx.
// See wiki/downtown-feed-spec.md.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
// @ts-ignore
import Ionicons from '@expo/vector-icons/Ionicons';
import { Post, PostType } from '@/lib/types';
import { formatTimeAgo } from '@/lib/formatters';

export type PostCardProps = {
  post: Post;
  distanceMi?: number;
  hearted: boolean;
  heartCount: number;
  onTapBusiness: (businessId: string) => void;
  onToggleHeart: (postId: string) => void;
};

const TYPE_META: Record<
  PostType,
  { emoji: string; label: string; bg: string; accent: string }
> = {
  event: {
    emoji: '📅',
    label: 'Event',
    bg: '#FEF3C7',
    accent: '#92400E',
  },
  announcement: {
    emoji: '📢',
    label: 'Announcement',
    bg: '#FEE2E2',
    accent: '#991B1B',
  },
  employee: {
    emoji: '👋',
    label: 'Meet the team',
    bg: '#DBEAFE',
    accent: '#1E40AF',
  },
  vibe: {
    emoji: '✨',
    label: 'Vibe',
    bg: '#F3E8FF',
    accent: '#6B21A8',
  },
  update: {
    emoji: '📣',
    label: 'Update',
    bg: '#F3F4F6',
    accent: '#374151',
  },
};

function formatEventAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function PostCard({
  post,
  distanceMi,
  hearted,
  heartCount,
  onTapBusiness,
  onToggleHeart,
}: PostCardProps) {
  const meta = TYPE_META[post.post_type] ?? TYPE_META.update;
  const eventLine = formatEventAt(post.event_at);
  const isPinned =
    post.is_pinned &&
    (!post.pinned_until || new Date(post.pinned_until) > new Date());

  return (
    <View
      style={[
        styles.card,
        isPinned && styles.cardPinned,
        post.post_type === 'announcement' && styles.cardAnnouncement,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
          <Text style={styles.typeBadgeEmoji}>{meta.emoji}</Text>
          <Text style={[styles.typeBadgeText, { color: meta.accent }]}>
            {meta.label}
          </Text>
        </View>
        {isPinned ? (
          <View style={styles.pinBadge}>
            <Text style={styles.pinBadgeText}>📌 Pinned</Text>
          </View>
        ) : null}
      </View>

      <Pressable onPress={() => onTapBusiness(post.business_id)} hitSlop={6}>
        <Text style={styles.businessName} numberOfLines={1}>
          {post.emoji_icon ? `${post.emoji_icon} ` : ''}
          {post.business_name ?? 'Local business'}
        </Text>
      </Pressable>

      {post.title ? (
        <Text style={styles.title} numberOfLines={2}>
          {post.title}
        </Text>
      ) : null}

      {eventLine ? (
        <View style={styles.eventLineBox}>
          <Text style={styles.eventLineText}>📅 {eventLine}</Text>
        </View>
      ) : null}

      <Text style={styles.body} numberOfLines={4}>
        {post.body}
      </Text>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{formatTimeAgo(post.created_at)}</Text>
        {typeof distanceMi === 'number' ? (
          <Text style={styles.footerText}>
            {' · '}
            {distanceMi < 0.1
              ? '< 0.1 mi'
              : `${distanceMi.toFixed(distanceMi < 10 ? 1 : 0)} mi`}
          </Text>
        ) : null}
        <View style={styles.footerSpacer} />
        <Pressable
          style={styles.heartBtn}
          onPress={() => onToggleHeart(post.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={hearted ? 'heart' : 'heart-outline'}
            size={18}
            color={hearted ? '#DC2626' : '#9CA3AF'}
          />
          {heartCount > 0 ? (
            <Text
              style={[
                styles.heartCount,
                hearted && styles.heartCountActive,
              ]}
            >
              {heartCount}
            </Text>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardPinned: {
    borderColor: '#6C3AED',
    borderWidth: 1.5,
  },
  cardAnnouncement: {
    borderStyle: 'dashed',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  typeBadgeEmoji: {
    fontSize: 12,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pinBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#EDE9FE',
    borderRadius: 6,
  },
  pinBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6C3AED',
    letterSpacing: 0.3,
  },
  businessName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#6C3AED',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    lineHeight: 22,
  },
  eventLineBox: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  eventLineText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  body: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  footerSpacer: {
    flex: 1,
  },
  heartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  heartCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  heartCountActive: {
    color: '#DC2626',
  },
});
