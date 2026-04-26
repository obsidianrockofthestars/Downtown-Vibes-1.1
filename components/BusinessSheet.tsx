import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
// @ts-ignore
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Business, VibeCheck } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { matchBlockedWord } from '@/lib/profanityFilter';
import { RedemptionModal } from './RedemptionModal';

function renderStars(rating: number): string {
  const full = Math.round(rating);
  return '\u2605'.repeat(full) + '\u2606'.repeat(5 - full);
}

function formatTimeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000
  );
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export type BusinessSheetProps = {
  selectedBusiness: Business | null;
  onDismiss: () => void;
};

export function BusinessSheet({ selectedBusiness, onDismiss }: BusinessSheetProps) {
  const router = useRouter();
  const { user, role } = useAuth();

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['50%', '90%'], []);

  const [vibeChecks, setVibeChecks] = useState<VibeCheck[]>([]);
  const [vibeLoading, setVibeLoading] = useState(false);
  const [showVibeForm, setShowVibeForm] = useState(false);
  const [vibeRating, setVibeRating] = useState(0);
  const [vibeComment, setVibeComment] = useState('');
  const [vibeSubmitting, setVibeSubmitting] = useState(false);

  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [favoriteRowId, setFavoriteRowId] = useState<string | null>(null);

  // 1.5.0 redemption mechanic — fullscreen modal triggered by the
  // "🎟️ Redeem at checkout" button that renders below an active flash sale.
  // See wiki/redemption-mechanic-spec.md.
  const [showRedemptionModal, setShowRedemptionModal] = useState(false);

  useEffect(() => {
    if (selectedBusiness) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [selectedBusiness]);

  useEffect(() => {
    if (!selectedBusiness) {
      setVibeChecks([]);
      setShowVibeForm(false);
      setVibeRating(0);
      setVibeComment('');
      return;
    }

    setVibeLoading(true);
    supabase
      .from('vibe_checks')
      .select('id,created_at,business_id,user_id,rating,comment')
      .eq('business_id', selectedBusiness.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) console.warn('Vibe checks fetch error:', error.message);
        setVibeChecks((data as VibeCheck[]) ?? []);
        setVibeLoading(false);
      });
  }, [selectedBusiness]);

  useEffect(() => {
    if (!selectedBusiness || !user) {
      setIsFavorited(false);
      setFavoriteRowId(null);
      return;
    }
    supabase
      .from('user_favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_id', selectedBusiness.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('Favorite check error:', error.message);
        setIsFavorited(!!data);
        setFavoriteRowId(data?.id ?? null);
      });
  }, [selectedBusiness, user, role]);

  const handleOpenMenu = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open this link.');
      }
    } catch {
      Alert.alert('Error', 'Invalid URL.');
    }
  }, []);

  const handleSubmitVibeCheck = async () => {
    if (!user || !selectedBusiness || vibeRating === 0) return;

    // Profanity / slur filter — mirror the enforce_vibe_check_moderation_trg
    // trigger on public.vibe_checks.comment. Defense-in-depth + UX: catch
    // bad comments before the network call so the user gets an instant,
    // friendly error instead of a Supabase error surface. Generic copy,
    // no word echo. See lib/profanityFilter.ts for the sync invariant.
    const trimmedComment = vibeComment.trim();
    if (trimmedComment && matchBlockedWord(trimmedComment) !== null) {
      Alert.alert(
        'Vibe check not allowed',
        'Your vibe check contains words that are not allowed. Please revise. ' +
          'If you believe this is an error, contact support@potionsandfamiliars.com.'
      );
      return;
    }

    setVibeSubmitting(true);

    // Prevent duplicate reviews: check if this user already reviewed this business
    const { count } = await supabase
      .from('vibe_checks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('business_id', selectedBusiness.id);

    if ((count ?? 0) > 0) {
      setVibeSubmitting(false);
      Alert.alert(
        'Already Reviewed',
        "You've already left a Vibe Check for this business."
      );
      return;
    }

    const { error } = await supabase.from('vibe_checks').insert({
      business_id: selectedBusiness.id,
      user_id: user.id,
      rating: vibeRating,
      comment: trimmedComment || null,
    });
    setVibeSubmitting(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setVibeRating(0);
    setVibeComment('');
    setShowVibeForm(false);

    const { data: refreshed } = await supabase
      .from('vibe_checks')
      .select('id,created_at,business_id,user_id,rating,comment')
      .eq('business_id', selectedBusiness.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setVibeChecks((refreshed as VibeCheck[]) ?? []);
  };

  const handleToggleFavorite = useCallback(async () => {
    if (!user) {
      Alert.alert(
        'Sign in to favorite',
        'You need an account to favorite!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Account', onPress: () => router.push('/(tabs)/account') },
        ]
      );
      return;
    }
    if (!selectedBusiness || favoriteLoading) return;

    setFavoriteLoading(true);
    try {
      if (isFavorited && favoriteRowId) {
        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('id', favoriteRowId);
        if (error) {
          console.error('Unfavorite error:', error);
          Alert.alert('Error', error.message);
          return;
        }
        setIsFavorited(false);
        setFavoriteRowId(null);
      } else {
        const { data, error } = await supabase
          .from('user_favorites')
          .insert({
            user_id: user.id,
            business_id: selectedBusiness.id,
          })
          .select('id')
          .single();
        if (error) {
          console.error('Favorite insert error:', error);
          Alert.alert('Error', error.message);
          return;
        }
        if (data?.id) {
          setIsFavorited(true);
          setFavoriteRowId(data.id);
        }
      }
    } finally {
      setFavoriteLoading(false);
    }
  }, [
    user,
    role,
    selectedBusiness,
    isFavorited,
    favoriteRowId,
    favoriteLoading,
    router,
  ]);

  const avgRating = useMemo(() => {
    if (vibeChecks.length === 0) return 0;
    return vibeChecks.reduce((sum, v) => sum + v.rating, 0) / vibeChecks.length;
  }, [vibeChecks]);

  return (
    <>
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={onDismiss}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <View pointerEvents="none" style={{ position: 'absolute', bottom: -20, left: -40, zIndex: 0 }}>
          <Image
            source={require('@/assets/images/watermark.png')}
            style={{ width: 250, height: 250, opacity: 0.05, resizeMode: 'contain' }}
          />
        </View>
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          {selectedBusiness && (
            <>
              <Text style={styles.sheetName}>
                {selectedBusiness.business_name}
              </Text>

              {selectedBusiness.flash_sale ? (
                <>
                  <Text style={styles.sheetSale}>
                    {'\uD83D\uDD25'} {selectedBusiness.flash_sale}
                  </Text>
                  <TouchableOpacity
                    style={styles.redemptionBtn}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (!user) {
                        Alert.alert(
                          'Sign in to redeem',
                          'Create a free account to claim this discount and let the business know DV sent you.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Go to Account',
                              onPress: () =>
                                router.push('/(tabs)/account'),
                            },
                          ]
                        );
                        return;
                      }
                      setShowRedemptionModal(true);
                    }}
                  >
                    <Text style={styles.redemptionBtnText}>
                      {'\uD83C\uDFAB'} Redeem at checkout
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              {selectedBusiness.history_fact ? (
                <Text style={styles.sheetFact}>
                  {selectedBusiness.history_fact}
                </Text>
              ) : (
                <Text style={styles.sheetType}>
                  {selectedBusiness.business_type}
                </Text>
              )}

              <TouchableOpacity
                style={styles.favoriteButton}
                activeOpacity={0.8}
                onPress={handleToggleFavorite}
                disabled={favoriteLoading}
              >
                {favoriteLoading ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Ionicons
                    name={isFavorited ? 'heart' : 'heart-outline'}
                    size={22}
                    color={isFavorited ? '#DC2626' : '#6B7280'}
                  />
                )}
                <Text
                  style={[
                    styles.favoriteButtonText,
                    isFavorited && styles.favoriteButtonTextActive,
                  ]}
                >
                  {isFavorited ? 'Favorited' : 'Favorite'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.directionsButton}
                activeOpacity={0.8}
                onPress={() => {
                  const label = encodeURIComponent(selectedBusiness.business_name);
                  // Prefer static (storefront) coords for directions; fall back to dynamic location
                  const lat =
                    typeof selectedBusiness.static_latitude === 'number'
                      ? selectedBusiness.static_latitude
                      : selectedBusiness.latitude;
                  const lng =
                    typeof selectedBusiness.static_longitude === 'number'
                      ? selectedBusiness.static_longitude
                      : selectedBusiness.longitude;
                  const url =
                    Platform.OS === 'ios'
                      ? `maps:0,0?q=${label}@${lat},${lng}`
                      : `geo:0,0?q=${lat},${lng}(${label})`;
                  Linking.openURL(url).catch(() =>
                    Alert.alert('Error', 'Could not open maps.')
                  );
                }}
              >
                <Text style={styles.sheetButtonText}>
                  {'\uD83E\uDDED'} Get Directions
                </Text>
              </TouchableOpacity>

              {selectedBusiness.menu_link?.startsWith('http') ? (
                <TouchableOpacity
                  style={styles.sheetButton}
                  activeOpacity={0.8}
                  onPress={() => handleOpenMenu(selectedBusiness.menu_link!)}
                >
                  <Text style={styles.sheetButtonText}>View Menu</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.vibeSection}>
                <View style={styles.vibeHeader}>
                  <Text style={styles.vibeSectionTitle}>Vibe Checks</Text>
                  {vibeChecks.length > 0 && (
                    <Text style={styles.vibeAvg}>
                      {renderStars(avgRating)} ({avgRating.toFixed(1)})
                    </Text>
                  )}
                </View>

                {vibeLoading ? (
                  <ActivityIndicator
                    size="small"
                    color="#6C3AED"
                    style={{ marginVertical: 12 }}
                  />
                ) : vibeChecks.length === 0 ? (
                  <Text style={styles.vibeEmpty}>
                    No vibe checks yet. Be the first!
                  </Text>
                ) : (
                  vibeChecks.map((vc) => (
                    <View key={vc.id} style={styles.vibeCard}>
                      <View style={styles.vibeCardHeader}>
                        <Text style={styles.vibeStars}>
                          {renderStars(vc.rating)}
                        </Text>
                        <Text style={styles.vibeDate}>
                          {formatTimeAgo(vc.created_at)}
                        </Text>
                      </View>
                      {vc.comment ? (
                        <Text style={styles.vibeComment}>{vc.comment}</Text>
                      ) : null}
                    </View>
                  ))
                )}

                <TouchableOpacity
                  style={styles.vibeCheckBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (!user) {
                      Alert.alert(
                        'Sign in to leave a Vibe Check',
                        'You need an account to leave a Vibe Check!',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Go to Account',
                            onPress: () => router.push('/(tabs)/account'),
                          },
                        ]
                      );
                      return;
                    }
                    setShowVibeForm(true);
                  }}
                >
                  <Text style={styles.vibeCheckBtnText}>
                    Leave a Vibe Check
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      <Modal
        visible={showVibeForm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVibeForm(false)}
      >
        <Pressable
          style={styles.vibeFormBackdrop}
          onPress={() => setShowVibeForm(false)}
        />
        <View style={styles.vibeFormCard}>
          <Text style={styles.vibeFormTitle}>Leave a Vibe Check</Text>
          <Text style={styles.vibeFormBizName} numberOfLines={1}>
            {selectedBusiness?.business_name}
          </Text>

          <View style={styles.starPickerRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setVibeRating(star)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.starPickerStar,
                    star <= vibeRating && styles.starPickerStarActive,
                  ]}
                >
                  {star <= vibeRating ? '\u2605' : '\u2606'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.vibeFormInput}
            value={vibeComment}
            onChangeText={setVibeComment}
            placeholder="What's the vibe? (optional)"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={280}
          />

          <TouchableOpacity
            style={[
              styles.vibeFormSubmit,
              (!vibeRating || vibeSubmitting) && styles.vibeFormSubmitDisabled,
            ]}
            onPress={handleSubmitVibeCheck}
            disabled={!vibeRating || vibeSubmitting}
            activeOpacity={0.8}
          >
            {vibeSubmitting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.vibeFormSubmitText}>Submit Vibe Check</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.vibeFormCancelBtn}
            onPress={() => setShowVibeForm(false)}
          >
            <Text style={styles.vibeFormCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <RedemptionModal
        visible={showRedemptionModal}
        selectedBusiness={selectedBusiness}
        onClose={() => setShowRedemptionModal(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetHandle: {
    backgroundColor: '#D1D5DB',
    width: 40,
  },
  sheetContent: {
    paddingHorizontal: 24,
    paddingBottom: 36,
    position: 'relative',
    zIndex: 1,
  },
  sheetName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  sheetSale: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 4,
  },
  redemptionBtn: {
    width: '100%',
    backgroundColor: '#6C3AED',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  redemptionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sheetFact: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 12,
  },
  sheetType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'capitalize',
    marginBottom: 12,
  },
  favoriteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  favoriteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  favoriteButtonTextActive: {
    color: '#DC2626',
  },
  directionsButton: {
    marginTop: 8,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetButton: {
    marginTop: 8,
    backgroundColor: '#6C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  vibeSection: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
  },
  vibeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  vibeSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  vibeAvg: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
  },
  vibeEmpty: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 12,
  },
  vibeCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  vibeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  vibeStars: {
    fontSize: 13,
    color: '#F59E0B',
  },
  vibeDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  vibeComment: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
    marginTop: 2,
  },
  vibeCheckBtn: {
    marginTop: 10,
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  vibeCheckBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  vibeFormBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  vibeFormCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: '25%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 20,
  },
  vibeFormTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  vibeFormBizName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6C3AED',
    marginBottom: 16,
  },
  starPickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  starPickerStar: {
    fontSize: 34,
    color: '#D1D5DB',
  },
  starPickerStarActive: {
    color: '#F59E0B',
  },
  vibeFormInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  vibeFormSubmit: {
    backgroundColor: '#6C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  vibeFormSubmitDisabled: {
    opacity: 0.5,
  },
  vibeFormSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  vibeFormCancelBtn: {
    alignItems: 'center',
    marginTop: 12,
  },
  vibeFormCancelText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 14,
  },
});
