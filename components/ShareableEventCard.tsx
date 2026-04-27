// 1.7.0 Option B — Image-first social sharing.
//
// Renders a post as a fixed-size 1080×1080 Instagram-square card with
// Pony Express Neon styling. Captured via react-native-view-shot to a
// PNG file URI, then handed to the OS share sheet.
//
// This component is designed to render OFF-SCREEN (positioned at top:
// -10000) so the user never sees it directly — the captured PNG is what
// they share to Facebook / Instagram / wherever.
//
// Design intent: every shared event is free DV marketing because the card
// carries the brand mark + "open in Downtown Vibes" CTA. Owners get a
// beautiful asset, customers see the brand on their socials.

import React, { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Post } from '@/lib/types';
import {
  colors as C,
  fonts as F,
  fontSizes as FS,
} from '@/lib/designTokens';

export const SHARE_CARD_SIZE = 1080;

export type ShareableEventCardProps = {
  post: Post;
  businessName: string;
  businessEmoji?: string | null;
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

const TYPE_BADGE: Record<Post['post_type'], { label: string; emoji: string }> = {
  event:        { label: 'EVENT',         emoji: '★' },
  announcement: { label: 'ANNOUNCEMENT',  emoji: '✦' },
  employee:     { label: 'MEET THE TEAM', emoji: '◇' },
  vibe:         { label: 'VIBE',          emoji: '◈' },
  update:       { label: 'UPDATE',        emoji: '▣' },
};

export const ShareableEventCard = forwardRef<View, ShareableEventCardProps>(
  function ShareableEventCard({ post, businessName, businessEmoji }, ref) {
    const meta = TYPE_BADGE[post.post_type] ?? TYPE_BADGE.update;
    const eventLine = formatEventAt(post.event_at);
    const truncatedBody =
      post.body.length > 220 ? post.body.slice(0, 217) + '…' : post.body;

    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        {/* HERO — dusk sky + cyborg rider */}
        <View style={styles.hero}>
          <Image
            source={require('@/assets/images/hero-rider.png')}
            style={styles.heroRider}
            resizeMode="contain"
          />
        </View>

        {/* Type badge */}
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>
            {meta.emoji}  {meta.label}
          </Text>
        </View>

        {/* Business name */}
        <Text style={styles.businessName} numberOfLines={1}>
          {businessEmoji ? `${businessEmoji} ` : ''}
          {businessName.toUpperCase()}
        </Text>

        {/* Title */}
        {post.title ? (
          <Text style={styles.title} numberOfLines={2}>
            {post.title}
          </Text>
        ) : null}

        {/* Parchment event placard */}
        {eventLine && post.event_at ? (
          <View style={styles.placard}>
            <View style={[styles.brassPin, { top: 10, left: 10 }]} />
            <View style={[styles.brassPin, { top: 10, right: 10 }]} />
            <View style={[styles.brassPin, { bottom: 10, left: 10 }]} />
            <View style={[styles.brassPin, { bottom: 10, right: 10 }]} />
            <Text style={styles.placardDate}>
              {eventLine.toUpperCase()}
            </Text>
          </View>
        ) : null}

        {/* Body */}
        <Text style={styles.body} numberOfLines={4}>
          {truncatedBody}
        </Text>

        {/* Branding footer */}
        <View style={styles.footer}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.brandIcon}
            resizeMode="contain"
          />
          <View style={styles.brandTextCol}>
            <Text style={styles.brandName}>Downtown Vibes</Text>
            <Text style={styles.brandSub}>
              Open in app to see more · downtownvibes.pages.dev
            </Text>
          </View>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_SIZE,
    height: SHARE_CARD_SIZE,
    backgroundColor: C.surfaceDeep,
    paddingHorizontal: 64,
    paddingTop: 40,
    paddingBottom: 56,
    overflow: 'hidden',
  },
  hero: {
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRider: {
    width: 320,
    height: 280,
    transform: [{ rotate: '-7deg' }],
  },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: C.surfacePaper,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 16,
  },
  typeBadgeText: {
    fontFamily: F.display,
    fontSize: 22,
    color: C.textOnPaper,
    letterSpacing: 2,
  },
  businessName: {
    fontFamily: F.display,
    fontSize: 56,
    color: C.neonCyan,
    letterSpacing: 2,
    marginBottom: 12,
  },
  title: {
    fontFamily: F.body,
    fontSize: 38,
    fontWeight: '700',
    color: C.textPrimary,
    lineHeight: 46,
    marginBottom: 18,
  },
  placard: {
    backgroundColor: C.surfacePaper,
    paddingVertical: 22,
    paddingHorizontal: 28,
    borderRadius: 6,
    marginBottom: 18,
    position: 'relative',
  },
  brassPin: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.dustTan,
  },
  placardDate: {
    fontFamily: F.display,
    fontSize: 30,
    color: C.textOnPaper,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  body: {
    fontFamily: F.body,
    fontSize: 26,
    color: C.textMuted,
    lineHeight: 36,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 24,
    borderTopWidth: 2,
    borderTopColor: C.surfaceLeather,
  },
  brandIcon: {
    width: 70,
    height: 70,
    borderRadius: 14,
    marginRight: 18,
  },
  brandTextCol: {
    flex: 1,
  },
  brandName: {
    fontFamily: F.display,
    fontSize: 30,
    color: C.textPrimary,
    letterSpacing: 0.6,
  },
  brandSub: {
    fontFamily: F.mono,
    fontSize: 18,
    color: C.textMuted,
    marginTop: 4,
    letterSpacing: 0.3,
  },
});
