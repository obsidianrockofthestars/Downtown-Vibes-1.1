import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export interface NearbySale {
  id: string;
  text: string;
  name: string;
}

interface FlashSaleBannerProps {
  sales: NearbySale[];
  onDismiss: () => void;
  onShowSales?: () => void;
}

export function FlashSaleBanner({
  sales,
  onDismiss,
  onShowSales,
}: FlashSaleBannerProps) {
  const translateY = useRef(new Animated.Value(-120)).current;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const dismiss = useCallback(() => {
    Animated.timing(translateY, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onDismissRef.current());
  }, [translateY]);

  useEffect(() => {
    if (sales.length > 0) {
      // Stop any in-progress animation before starting a new one
      translateY.stopAnimation(() => {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 10,
        }).start();
      });

      const timer = setTimeout(dismiss, 8000);
      return () => clearTimeout(timer);
    } else {
      translateY.stopAnimation();
      translateY.setValue(-120);
    }
  }, [sales, dismiss, translateY]);

  if (sales.length === 0) return null;

  const isSingle = sales.length === 1;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
    >
      <TouchableOpacity
        style={styles.content}
        activeOpacity={0.85}
        onPress={isSingle ? dismiss : onShowSales}
      >
        <Text style={styles.icon}>🔥</Text>
        <View style={styles.textWrap}>
          {isSingle ? (
            <>
              <Text style={styles.title} numberOfLines={1}>
                Hey, sale here!
              </Text>
              <Text style={styles.bizName} numberOfLines={1}>
                {sales[0].name}
              </Text>
              <Text style={styles.details} numberOfLines={2}>
                {sales[0].text}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title} numberOfLines={1}>
                {sales.length} Sales Near You!
              </Text>
              <Text style={styles.details} numberOfLines={1}>
                Tap to see them on the map
              </Text>
            </>
          )}
        </View>
        <TouchableOpacity onPress={dismiss} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingTop: 54,
    paddingHorizontal: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    fontSize: 28,
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: '#FDE68A',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  bizName: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    marginTop: 1,
  },
  details: {
    color: '#EDE9FE',
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    marginLeft: 8,
    padding: 4,
  },
  closeText: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '700',
  },
});
