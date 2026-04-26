// 1.5.0 redemption mechanic — fullscreen modal shown when a user taps
// "🎟️ Redeem at checkout" on a flash-sale-having business. Big visible
// proof for staff: business name, discount text, live ticking clock
// (proves it's not a screenshot from yesterday), "show this to staff"
// instruction. On open, fire-and-forget INSERT into flash_sale_redemptions
// for owner-side attribution metrics.
//
// See wiki/redemption-mechanic-spec.md.

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Business } from '@/lib/types';
import { formatLiveClock } from '@/lib/formatters';

export type RedemptionModalProps = {
  visible: boolean;
  selectedBusiness: Business | null;
  onClose: () => void;
};

export function RedemptionModal({
  visible,
  selectedBusiness,
  onClose,
}: RedemptionModalProps) {
  const { user } = useAuth();
  const [now, setNow] = useState<Date>(() => new Date());
  const [logging, setLogging] = useState(false);
  // Track which (visible-session, business) we've already logged so the
  // insert fires exactly once per modal open even if React re-renders.
  const lastLoggedRef = useRef<string | null>(null);

  // Live clock — updates every 1s while visible. Pauses (no interval) when
  // the modal is hidden so we don't burn cycles in the background.
  useEffect(() => {
    if (!visible) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  // Fire-and-forget redemption log. Fails open: if the insert errors
  // (network, RLS, etc.) the modal still works — better UX than blocking
  // the user from showing their phone to staff over a logging hiccup.
  useEffect(() => {
    if (!visible) {
      lastLoggedRef.current = null;
      return;
    }
    if (!selectedBusiness || !user) return;
    const sessionKey = `${selectedBusiness.id}:${visible}`;
    if (lastLoggedRef.current === sessionKey) return;
    lastLoggedRef.current = sessionKey;
    setLogging(true);
    (async () => {
      try {
        const { error } = await supabase.from('flash_sale_redemptions').insert({
          business_id: selectedBusiness.id,
          user_id: user.id,
          flash_sale_text: selectedBusiness.flash_sale ?? null,
        });
        if (error) {
          console.warn('flash_sale_redemptions insert errored:', error);
        }
      } catch (err) {
        console.warn('flash_sale_redemptions insert threw:', err);
      } finally {
        setLogging(false);
      }
    })();
  }, [visible, selectedBusiness, user]);

  if (!selectedBusiness) return null;

  const flashSale = (selectedBusiness.flash_sale ?? '').trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.emoji}>🎟️</Text>

          <Text style={styles.businessName} numberOfLines={2}>
            {selectedBusiness.business_name}
          </Text>

          {flashSale ? (
            <View style={styles.flashSaleBox}>
              <Text style={styles.flashSaleText}>{flashSale}</Text>
            </View>
          ) : null}

          <View style={styles.clockBox}>
            <Text style={styles.clockText}>{formatLiveClock(now)}</Text>
            {logging ? (
              <ActivityIndicator
                size="small"
                color="#9CA3AF"
                style={styles.clockSpinner}
              />
            ) : null}
          </View>

          <Text style={styles.instruction}>
            Show this to staff to redeem your discount
          </Text>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 72,
    lineHeight: 80,
    marginBottom: 8,
  },
  businessName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  flashSaleBox: {
    width: '100%',
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  flashSaleText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
  },
  clockBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  clockText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#6C3AED',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  clockSpinner: {
    marginLeft: 10,
  },
  instruction: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  closeBtn: {
    width: '100%',
    backgroundColor: '#6C3AED',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
