// 1.6.0 Downtown Feed — Post card with Pony Express Neon styling.
// Tokens from lib/designTokens.ts. See wiki/pony-express-neon-philosophy.md.

import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
// @ts-ignore
import Ionicons from '@expo/vector-icons/Ionicons';
import { Post, PostType } from '@/lib/types';
import { formatTimeAgo } from '@/lib/formatters';
import { addEventToCalendar } from '@/lib/addToCalendar';
import {
  colors as C,
  fonts as F,
  fontSizes as FS,
  space as S,
  radius as R,
  glow as G,
} from '@/lib/designTokens';

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
  { emoji: string; label: string; bg: string; accent: string; onAccent: string }
> = {
  event:        { emoji: '★', label: 'EVENT',         bg: C.surfacePaper, accent: '#92400E', onAccent: C.surfacePaper },
  announcement: { emoji: '✦', label: 'ANNOUNCEMENT',  bg: 'transparent',  accent: C.neonMagenta, onAccent: C.neonMagenta },
  employee:     { emoji: '◇', label: 'MEET THE TEAM', bg: 'transparent',  accent: C.neonCyan, onAccent: C.neonCyan },
  vibe:         { emoji: '◈', label: 'VIBE',          bg: 'transparent',  accent: C.neonPurpleHi, onAccent: C.neonPurpleHi },
  update:       { emoji: '▣', label: 'UPDATE',        bg: 'transparent',  accent: C.dustTan, onAccent: C.dustTan },
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
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  const isEventBadgeOnPaper = post.post_type === 'event';

  return (
    <View
      style={[
        styles.card,
        isPinned && styles.cardPinned,
        post.post_type === 'announcement' && styles.cardAnnouncement,
      ]}
    >
      {/* Header row — type badge (left) + DISPATCH sash for pinned (right) */}
      <View style={styles.headerRow}>
        <View
          style={[
            styles.typeBadge,
            isEventBadgeOnPaper
              ? { backgroundColor: meta.bg }
              : { borderColor: meta.accent, borderWidth: 1.5, backgroundColor: 'transparent' },
          ]}
        >
          <Text
            style={[
              styles.typeBadgeEmoji,
              { color: isEventBadgeOnPaper ? meta.accent : meta.accent },
            ]}
          >
            {meta.emoji}
          </Text>
          <Text
            style={[
              styles.typeBadgeText,
              { color: isEventBadgeOnPaper ? C.textOnPaper : meta.accent },
            ]}
          >
            {meta.label}
          </Text>
        </View>
        {isPinned ? (
          <View style={[styles.pinSash, G.magenta]}>
            <Text style={styles.pinSashText}>DISPATCH</Text>
          </View>
        ) : null}
      </View>

      {/* Business name — neon cyan slab */}
      <Pressable onPress={() => onTapBusiness(post.business_id)} hitSlop={6}>
        <Text style={styles.businessName} numberOfLines={1}>
          {post.emoji_icon ? `${post.emoji_icon} ` : ''}
          {(post.business_name ?? 'LOCAL BUSINESS').toUpperCase()}
        </Text>
      </Pressable>

      {post.title ? (
        <Text style={styles.title} numberOfLines={2}>
          {post.title}
        </Text>
      ) : null}

      {/* Parchment placard for event time */}
      {eventLine && post.event_at ? (
        <View style={[styles.eventPlacard, G.cyan]}>
          {/* brass pin corners */}
          <View style={[styles.brassPin, { top: 6, left: 6 }]} />
          <View style={[styles.brassPin, { top: 6, right: 6 }]} />
          <View style={[styles.brassPin, { bottom: 6, left: 6 }]} />
          <View style={[styles.brassPin, { bottom: 6, right: 6 }]} />

          <Text style={styles.eventPlacardDate}>
            {eventLine.toUpperCase()}
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.wireBtn,
              pressed && styles.wireBtnPressed,
            ]}
            disabled={addingToCalendar}
            onPress={async () => {
              if (!post.event_at) return;
              setAddingToCalendar(true);
              const result = await addEventToCalendar({
                title: post.title || post.business_name || 'Downtown event',
                startDate: new Date(post.event_at),
                notes: post.body,
                durationMinutes: 120,
              });
              setAddingToCalendar(false);
              if (result.ok && result.saved) {
                Alert.alert('Added to your calendar');
              } else if (!result.ok && result.reason === 'error') {
                Alert.alert("Couldn't add event", result.error ?? 'Please try again.');
              }
            }}
          >
            <Text style={styles.wireBtnText}>
              {addingToCalendar ? '+ ADDING…' : '+ WIRE TO YOUR CALENDAR ▸'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.body} numberOfLines={4}>
        {post.body}
      </Text>

      {/* Saddle stitch divider */}
      <View style={styles.saddleStitch}>
        <View style={styles.saddleLine} />
      </View>

      {/* Footer — timestamp · distance · heart */}
      <View style={styles.footerRow}>
        <Text style={styles.footerTime}>{formatTimeAgo(post.created_at)}</Text>
        {typeof distanceMi === 'number' ? (
          <>
            <Text style={styles.footerDot}>·</Text>
            <Text style={styles.footerDistance}>
              {distanceMi < 0.1
                ? '< 0.1 mi'
                : `${distanceMi.toFixed(distanceMi < 10 ? 1 : 0)} mi`}
            </Text>
          </>
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
            color={hearted ? C.sunsetCoral : C.textMuted}
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
    backgroundColor: C.surfaceBase,
    borderRadius: R.card,
    paddingVertical: S.lg,
    paddingHorizontal: S.lg,
    marginHorizontal: S.lg,
    marginBottom: S.md,
    borderWidth: 1,
    borderColor: '#3A2530',
    overflow: 'hidden',
  },
  cardPinned: {
    borderColor: C.neonPurpleHi,
    borderWidth: 1.5,
    ...G.purple,
  },
  cardAnnouncement: {
    borderStyle: 'dashed',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.sm,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: 4,
    borderRadius: R.pill,
    gap: 4,
  },
  typeBadgeEmoji: {
    fontSize: 12,
    fontWeight: '700',
  },
  typeBadgeText: {
    fontFamily: F.display,
    fontSize: FS.caption,
    letterSpacing: 1.2,
  },
  pinSash: {
    paddingHorizontal: S.md,
    paddingVertical: 4,
    backgroundColor: C.neonMagenta,
    borderRadius: R.stamp,
  },
  pinSashText: {
    fontFamily: F.display,
    fontSize: FS.caption,
    color: C.textPrimary,
    letterSpacing: 1.5,
  },

  businessName: {
    fontFamily: F.display,
    fontSize: FS.h2,
    color: C.neonCyan,
    letterSpacing: 1,
    marginTop: 4,
  },
  title: {
    fontFamily: F.body,
    fontSize: FS.body,
    fontWeight: '700',
    color: C.textPrimary,
    marginTop: 4,
    lineHeight: 22,
  },

  // Parchment placard for event date
  eventPlacard: {
    backgroundColor: C.surfacePaper,
    paddingVertical: S.md,
    paddingHorizontal: S.lg,
    borderRadius: R.paper,
    marginTop: S.md,
    marginBottom: S.sm,
    position: 'relative',
  },
  brassPin: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.dustTan,
  },
  eventPlacardDate: {
    fontFamily: F.display,
    fontSize: FS.bodySm,
    color: C.textOnPaper,
    letterSpacing: 1.5,
    marginBottom: S.sm,
    textAlign: 'center',
  },
  wireBtn: {
    backgroundColor: C.surfaceDeep,
    borderWidth: 1.5,
    borderColor: C.neonCyan,
    paddingVertical: S.sm,
    paddingHorizontal: S.md,
    borderRadius: R.stamp,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  wireBtnPressed: {
    backgroundColor: '#0A1F22',
  },
  wireBtnText: {
    fontFamily: F.pixel,
    fontSize: 11,
    color: C.neonCyan,
    letterSpacing: 1,
  },

  body: {
    fontFamily: F.body,
    fontSize: FS.bodySm,
    color: C.textMuted,
    lineHeight: 19,
    marginTop: S.sm,
  },

  saddleStitch: {
    marginTop: S.md,
    paddingTop: S.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saddleLine: {
    flex: 1,
    height: 2,
    backgroundColor: C.surfaceLeather,
    opacity: 0.4,
  },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: S.sm,
  },
  footerTime: {
    fontFamily: F.mono,
    fontSize: FS.caption,
    color: C.textMuted,
  },
  footerDot: {
    fontFamily: F.mono,
    fontSize: FS.caption,
    color: C.textMuted,
    marginHorizontal: S.xs,
  },
  footerDistance: {
    fontFamily: F.mono,
    fontSize: FS.caption,
    color: C.neonCyan,
    fontWeight: '600',
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
    fontFamily: F.mono,
    fontSize: FS.bodySm,
    fontWeight: '700',
    color: C.textMuted,
  },
  heartCountActive: {
    color: C.sunsetCoral,
  },
});
