// 1.7.0 Option B — Image-first social sharing helper.
//
// Captures the off-screen <ShareableEventCard> view to a PNG file via
// react-native-view-shot, then invokes the OS share sheet with the image
// + a pre-formatted caption. User picks Facebook / Instagram / Messages /
// Twitter from the share sheet.
//
// Why this design:
//   - Instagram does NOT accept text-only shares — it needs an image asset.
//     Generating the card means a single share button covers all platforms.
//   - The shared card carries DV branding to every social channel — every
//     event one of our businesses cross-posts is free DV marketing.
//   - The card design (Pony Express Neon styling) is already locked in
//     lib/designTokens.ts. The shareable card extends those tokens.
//
// See wiki/log.md 2026-04-26 evening entry for the option analysis (A/B/C)
// and wiki/next-session-todo.md P2 for the spec.

import { Share, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { Post } from './types';

const DV_DEEP_LINK = 'https://downtownvibes.app';

function formatEventDateForCaption(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const TYPE_EMOJI: Record<Post['post_type'], string> = {
  event: '📅',
  announcement: '📢',
  employee: '👋',
  vibe: '✨',
  update: '📣',
};

/**
 * Build a pre-formatted caption suitable for Facebook / Twitter / Messages.
 * Instagram users typically paste this into their caption after attaching
 * the captured image — Instagram doesn't accept share-sheet captions
 * directly, but the OS clipboard is one tap away.
 */
export function buildShareCaption(post: Post, businessName: string): string {
  const lines: string[] = [];
  const emoji = TYPE_EMOJI[post.post_type] ?? '📣';

  // Headline
  if (post.title) {
    lines.push(`${emoji} ${post.title}`);
  } else {
    lines.push(`${emoji} ${businessName}`);
  }

  // Event date
  const eventLine = formatEventDateForCaption(post.event_at);
  if (eventLine) {
    lines.push(`📅 ${eventLine}`);
  }

  lines.push(''); // blank
  lines.push(post.body);
  lines.push(''); // blank
  lines.push(`— ${businessName} on Downtown Vibes`);
  lines.push(`Open in the app: ${DV_DEEP_LINK}`);

  return lines.join('\n');
}

export type ShareEventResult =
  | { ok: true; shared: boolean }
  | { ok: false; error: string };

/**
 * Capture the given view ref to a PNG file, then open the OS share sheet
 * with the image + a pre-formatted caption.
 *
 * The caller is responsible for:
 *   - Mounting the <ShareableEventCard> off-screen with this ref before
 *     calling
 *   - Allowing one render frame after mount before calling (use setTimeout
 *     ~250ms or InteractionManager.runAfterInteractions)
 */
export async function shareEventCard(opts: {
  cardRef: React.RefObject<View>;
  post: Post;
  businessName: string;
}): Promise<ShareEventResult> {
  const { cardRef, post, businessName } = opts;

  if (!cardRef.current) {
    return { ok: false, error: 'card_not_mounted' };
  }

  let uri: string;
  try {
    uri = await captureRef(cardRef as React.RefObject<View>, {
      format: 'png',
      quality: 1.0,
      result: 'tmpfile',
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'capture_failed',
    };
  }

  const caption = buildShareCaption(post, businessName);

  try {
    const result = await Share.share(
      {
        url: uri, // iOS uses this for the image
        message: caption, // Both platforms; Android attaches via shared file API
        title: post.title || `${businessName} on Downtown Vibes`,
      },
      {
        dialogTitle: 'Share to your socials',
      }
    );
    return { ok: true, shared: result.action === Share.sharedAction };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'share_failed',
    };
  }
}
