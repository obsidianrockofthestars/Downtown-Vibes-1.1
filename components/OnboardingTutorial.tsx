import React, { useRef, useState, useCallback } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ONBOARDING_SEEN_KEY = 'dv_onboarding_seen';

/* ────────────────────────────────────────────
   Slide data
   ──────────────────────────────────────────── */

interface SlideData {
  id: string;
  title: string;
  body: string;
  features?: { icon: string; label: string; description: string }[];
  // Optional "subscription tiers" explainer, rendered below the features list.
  // Used on the Business Owners slide so owners understand Single vs Dual.
  tiersBlock?: {
    heading: string;
    subheading?: string;
    tiers: { label: string; icon: string; description: string }[];
    footnote?: string;
  };
}

const SLIDES: SlideData[] = [
  {
    id: 'overview',
    title: 'Welcome to Downtown Vibes',
    body: "Your live, interactive map for what's happening downtown. Discover local businesses, chase flash sales, and vibe check the spots you visit.",
    features: [
      {
        icon: '📍',
        label: 'Live Map',
        description: 'See every participating business pinned on a real-time map.',
      },
      {
        icon: '⚡',
        label: 'Flash Sales',
        description:
          'Get notified about limited-time deals when you walk nearby.',
      },
      {
        icon: '⭐',
        label: 'Vibe Checks',
        description:
          'Leave quick reviews so the community knows which spots are worth it.',
      },
      {
        icon: '❤️',
        label: 'Favorites',
        description: 'Save the businesses you love for easy access later.',
      },
    ],
  },
  {
    id: 'customers',
    title: 'For Customers',
    body: "Free for anyone exploring downtown. Find the spots, chase the deals, share the love.",
    features: [
      {
        icon: '🗺️',
        label: 'Live business map',
        description:
          'See every participating business in real time — including live traveling pins for food trucks and pop-ups.',
      },
      {
        icon: '⚡',
        label: 'Flash sale alerts',
        description:
          'Get a notification when you walk near a limited-time deal.',
      },
      {
        icon: '⭐',
        label: 'Vibe Checks',
        description:
          'Leave quick reviews so the community knows which spots are worth it.',
      },
      {
        icon: '❤️',
        label: 'Favorites',
        description: 'Save the businesses you love for easy access later.',
      },
      {
        icon: '🆓',
        label: 'Free, always',
        description:
          'No ads, no subscription, no paywalls — just the app.',
      },
    ],
  },
  {
    id: 'owners',
    title: 'For Business Owners',
    body: "Put your business on the map in minutes. Pick the pin that fits how you operate.",
    features: [
      {
        icon: '📍',
        label: 'Drop a pin',
        description:
          "Sign up, place your pin on the map, and you're live to every customer in the area.",
      },
      {
        icon: '🚚',
        label: 'Move it or lock it',
        description:
          "Every pin can move. Tap \u201CUpdate Pin to My Current Location\u201D and your pin teleports to your exact GPS in seconds — then share the new spot with followers in the same tap. Running a fixed storefront? Lock your pin in place and forget about it.",
      },
      {
        icon: '⚡',
        label: 'Launch flash sales',
        description:
          'Fire a timed deal in seconds — nearby customers get a push notification.',
      },
      {
        icon: '⭐',
        label: 'Track your vibe',
        description:
          'See your Vibe Check ratings and what customers are saying.',
      },
      {
        icon: '❤️',
        label: "Be a neighbor too",
        description:
          'Favorite and review other spots, same as any customer.',
      },
    ],
    tiersBlock: {
      heading: 'Two subscription tiers',
      subheading: 'Pick the one that matches how you run your business.',
      tiers: [
        {
          label: 'Single Pin',
          icon: '📍',
          description:
            'One pin. Lock it to your storefront address, or move it when you move — your call.',
        },
        {
          label: 'Dual Pin',
          icon: '🚚',
          description:
            'Two pins. Great if you have a brick-and-mortar AND a mobile presence — like a bakery that also runs a truck. Lock one, move the other, or move both.',
        },
      ],
      footnote:
        "That's the only difference — Single is one pin, Dual is two. Both can move, both can lock.",
    },
  },
];

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */

interface OnboardingTutorialProps {
  visible: boolean;
  onFinish: () => void;
}

export function OnboardingTutorial({ visible, onFinish }: OnboardingTutorialProps) {
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleFinish = useCallback(() => {
    AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true').catch(() => {});
    setActiveIndex(0);
    onFinish();
  }, [onFinish]);

  const handleSkip = handleFinish;

  const handleNext = useCallback(() => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      handleFinish();
    }
  }, [activeIndex, handleFinish]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const isLastSlide = activeIndex === SLIDES.length - 1;

  const renderSlide = useCallback(
    ({ item }: { item: SlideData }) => (
      // Each slide gets its own vertical ScrollView so taller content
      // (especially the Business Owners slide with features + tiersBlock)
      // can scroll within the page instead of overflowing the screen.
      // Horizontal swipe between slides is still handled by the outer FlatList.
      <ScrollView
        style={styles.slide}
        contentContainerStyle={styles.slideContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title & body */}
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideBody}>{item.body}</Text>

        {/* Feature list */}
        {item.features && (
          <View style={styles.featureList}>
            {item.features.map((f) => (
              <View key={f.label} style={styles.featureRow}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <View style={styles.featureText}>
                  <Text style={styles.featureLabel}>{f.label}</Text>
                  <Text style={styles.featureDesc}>{f.description}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Subscription-tier explainer (Business Owners slide) */}
        {item.tiersBlock && (
          <View style={styles.tiersBlock}>
            <Text style={styles.tiersHeading}>{item.tiersBlock.heading}</Text>
            {item.tiersBlock.subheading ? (
              <Text style={styles.tiersSubheading}>
                {item.tiersBlock.subheading}
              </Text>
            ) : null}
            {item.tiersBlock.tiers.map((tier) => (
              <View key={tier.label} style={styles.tierCard}>
                <Text style={styles.tierIcon}>{tier.icon}</Text>
                <View style={styles.tierTextWrap}>
                  <Text style={styles.tierLabel}>{tier.label}</Text>
                  <Text style={styles.tierDescription}>{tier.description}</Text>
                </View>
              </View>
            ))}
            {item.tiersBlock.footnote ? (
              <Text style={styles.tiersFootnote}>
                {item.tiersBlock.footnote}
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    ),
    []
  );

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        {/* Skip button */}
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkip}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        {/* Swipeable pages */}
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          keyExtractor={(item) => item.id}
          renderItem={renderSlide}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
        />

        {/* Bottom controls: dots + button */}
        <View style={styles.footer}>
          <View style={styles.dotsRow}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === activeIndex && styles.dotActive]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.nextBtn}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>
              {isLastSlide ? "Let's Go!" : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ────────────────────────────────────────────
   Styles
   ──────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  skipBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },

  /* Slide — outer (ScrollView frame, one page of the horizontal pager) */
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  /* Slide — inner content container (padding lives here so the ScrollView
     itself stays full-width and the horizontal pager measures correctly) */
  slideContent: {
    paddingHorizontal: 28,
    paddingTop: 100,
    paddingBottom: 160,
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  slideBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 28,
  },

  /* Feature list */
  featureList: {
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  featureIcon: {
    fontSize: 26,
    marginRight: 14,
    marginTop: 2,
  },
  featureText: {
    flex: 1,
  },
  featureLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
  },

  /* Tier explainer (Single Pin vs Dual Pin) */
  tiersBlock: {
    marginTop: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },
  tiersHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F2937',
  },
  tiersSubheading: {
    fontSize: 12.5,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 10,
    lineHeight: 17,
  },
  tierCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginTop: 8,
  },
  tierIcon: {
    fontSize: 22,
    marginRight: 10,
    marginTop: 1,
  },
  tierTextWrap: {
    flex: 1,
  },
  tierLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 2,
  },
  tierDescription: {
    fontSize: 12.5,
    lineHeight: 17,
    color: '#4B5563',
  },
  tiersFootnote: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 10,
    fontStyle: 'italic',
    lineHeight: 16,
  },

  /* Footer */
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 50,
    paddingTop: 16,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  dotsRow: {
    flexDirection: 'row',
    marginBottom: 18,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  dotActive: {
    backgroundColor: '#6C3AED',
    width: 24,
  },
  nextBtn: {
    backgroundColor: '#6C3AED',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    minWidth: 200,
    alignItems: 'center',
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
