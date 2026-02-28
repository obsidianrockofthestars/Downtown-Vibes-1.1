import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface FlashSaleBannerProps {
  sale: { text: string; name: string } | null;
  onDismiss: () => void;
}

export function FlashSaleBanner({ sale, onDismiss }: FlashSaleBannerProps) {
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
    if (sale) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start();

      const timer = setTimeout(dismiss, 6000);
      return () => clearTimeout(timer);
    } else {
      translateY.setValue(-120);
    }
  }, [sale, dismiss]);

  if (!sale) return null;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>🔥</Text>
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            Hey, sale here!
          </Text>
          <Text style={styles.bizName} numberOfLines={1}>
            {sale.name}
          </Text>
          <Text style={styles.details} numberOfLines={2}>
            {sale.text}
          </Text>
        </View>
        <TouchableOpacity onPress={dismiss} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
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
