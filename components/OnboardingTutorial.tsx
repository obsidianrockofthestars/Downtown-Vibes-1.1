import React, { useRef, useState, useCallback } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
  columns?: {
    left: { heading: string; icon: string; items: string[] };
    right: { heading: string; icon: string; items: string[] };
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
    id: 'roles',
    title: 'Two Ways to Use the App',
    body: 'Whether you\'re exploring downtown or running a business, Downtown Vibes has you covered.',
    columns: {
      left: {
        heading: 'Customers',
        icon: '🧭',
        items: [
          'Browse the live business map',
          'Leave Vibe Checks (reviews)',
          'Favorite businesses you love',
          'Get flash sale alerts nearby',
          'Free to use — always',
        ],
      },
      right: {
        heading: 'Business Owners',
        icon: '🏪',
        items: [
          'Drop a pin for your business',
          'Launch flash sales in seconds',
          'See your Vibe Check ratings',
          'Favorite & review other spots',
          'Premium pins via subscription',
        ],
      },
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
      <View style={styles.slide}>
        {/* Title & body */}
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideBody}>{item.body}</Text>

        {/* Feature list (overview slide) */}
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

        {/* Two-column role breakdown (roles slide) */}
        {item.columns && (
          <View style={styles.columnsRow}>
            {/* Left column */}
            <View style={styles.column}>
              <Text style={styles.columnIcon}>{item.columns.left.icon}</Text>
              <Text style={styles.columnHeading}>{item.columns.left.heading}</Text>
              {item.columns.left.items.map((text, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{text}</Text>
                </View>
              ))}
            </View>

            {/* Divider */}
            <View style={styles.columnDivider} />

            {/* Right column */}
            <View style={styles.column}>
              <Text style={styles.columnIcon}>{item.columns.right.icon}</Text>
              <Text style={styles.columnHeading}>{item.columns.right.heading}</Text>
              {item.columns.right.items.map((text, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
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

  /* Slide */
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 100,
    paddingBottom: 140,
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

  /* Columns */
  columnsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  columnIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  columnHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#6C3AED',
    marginBottom: 10,
    textAlign: 'center',
  },
  columnDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingRight: 4,
  },
  bulletDot: {
    fontSize: 13,
    color: '#6C3AED',
    marginRight: 6,
    marginTop: 1,
  },
  bulletText: {
    fontSize: 12.5,
    lineHeight: 17,
    color: '#374151',
    flex: 1,
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
