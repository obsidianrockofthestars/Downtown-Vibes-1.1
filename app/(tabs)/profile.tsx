import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { OnboardingTutorial, ONBOARDING_SEEN_KEY } from '@/components/OnboardingTutorial';
import { Business, VibeCheck } from '@/lib/types';
import {
  checkOwnerGateLock,
  clearOwnerGateLock,
  recordOwnerGateFailure,
  OWNER_GATE_LOCKOUT_STEP_1,
} from '@/lib/ownerGate';

interface VibeCheckWithBiz extends VibeCheck {
  business_name: string;
}

function renderStars(rating: number): string {
  return '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating);
}

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type ProfileTab = 'vibe' | 'favorites';

export interface ProfileScreenProps {
  /** When true, hides Sign Out / Delete Account (used when embedded in owner dashboard modal). */
  embedded?: boolean;
}

export default function ProfileScreen({ embedded = false }: ProfileScreenProps) {
  const { user, role, signOut } = useAuth();
  const [tab, setTab] = useState<ProfileTab>('vibe');
  const [checks, setChecks] = useState<VibeCheckWithBiz[]>([]);
  const [favorites, setFavorites] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // Delete-Account owner gate. Mirrors the password re-auth + SecureStore
  // rate limiter used by Delete Business in login.tsx. The lockout counter
  // is SHARED (same SecureStore key namespace) so a user who burns attempts
  // on one destructive action can't fish for extra guesses on the other.
  const [deleteGateVisible, setDeleteGateVisible] = useState(false);
  const [deleteGatePassword, setDeleteGatePassword] = useState('');
  const [deleteGateSaving, setDeleteGateSaving] = useState(false);

  const fetchVibeChecks = useCallback(async () => {
    if (!user) {
      setChecks([]);
      setLoading(false);
      return;
    }

    const { data: rawChecks } = await supabase
      .from('vibe_checks')
      .select('id,created_at,business_id,user_id,rating,comment')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!rawChecks || rawChecks.length === 0) {
      setChecks([]);
      setLoading(false);
      return;
    }

    const bizIds = [...new Set(rawChecks.map((c: any) => c.business_id))];
    const { data: bizzes } = await supabase
      .from('businesses')
      .select('id, business_name')
      .in('id', bizIds);

    const bizMap = new Map(
      (bizzes ?? []).map((b: any) => [b.id, b.business_name])
    );

    setChecks(
      rawChecks.map((c: any) => ({
        ...c,
        business_name: bizMap.get(c.business_id) ?? 'Unknown Business',
      }))
    );
    setLoading(false);
  }, [user]);

  const fetchFavorites = useCallback(async () => {
    if (!user) {
      setFavorites([]);
      setFavoritesLoading(false);
      return;
    }
    setFavoritesLoading(true);
    const { data: rows, error } = await supabase
      .from('user_favorites')
      .select('*, businesses(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Favorites fetch error:', error);
      setFavorites([]);
      setFavoritesLoading(false);
      return;
    }

    const list: Business[] = [];
    for (const row of rows ?? []) {
      const r = row as { businesses?: Business | null; business?: Business | null };
      const biz = r.businesses ?? r.business ?? null;
      if (biz && typeof biz === 'object' && biz.id) {
        list.push(biz as Business);
      }
    }
    setFavorites(list);
    setFavoritesLoading(false);
  }, [user]);

  useEffect(() => {
    fetchVibeChecks();
  }, [fetchVibeChecks]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (tab === 'vibe') await fetchVibeChecks();
    else await fetchFavorites();
    setRefreshing(false);
  };

  // Tapping "Delete Account" opens the owner-gate modal. The Alert.alert
  // yes/no prompt was not strong enough — an employee with an unlocked phone
  // could nuke the whole account with one tap. Now the same password re-auth
  // + rate limiter used for Delete Business also guards Delete Account.
  const handleDeleteAccount = useCallback(() => {
    if (!user || deletingAccount || deleteGateSaving) return;
    setDeleteGatePassword('');
    setDeleteGateVisible(true);
  }, [user, deletingAccount, deleteGateSaving]);

  const closeDeleteGate = useCallback(() => {
    if (deleteGateSaving) return;
    setDeleteGateVisible(false);
    setDeleteGatePassword('');
  }, [deleteGateSaving]);

  // Verifies the current user's account password via signInWithPassword,
  // respecting the shared owner-gate lockout counter. On success, calls
  // the delete_account RPC and signs out. Mirrors handleConfirmOwnerGate
  // in login.tsx — keep these in sync if the rate-limit policy changes.
  const handleConfirmDeleteAccount = useCallback(async () => {
    if (!user || deleteGateSaving || deletingAccount) return;

    const password = deleteGatePassword;
    if (!password) {
      Alert.alert('Password Required', 'Enter your account password to continue.');
      return;
    }
    if (!user.email) {
      Alert.alert(
        'Cannot Verify',
        'No email on this account. Please sign out and back in, then try again.'
      );
      return;
    }

    try {
      setDeleteGateSaving(true);

      // Rate-limit check BEFORE hitting Supabase — don't burn a network
      // round-trip or expose that the cooldown is client-side.
      const lockoutMessage = await checkOwnerGateLock(user.id);
      if (lockoutMessage) {
        Alert.alert('Please Wait', lockoutMessage);
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authError) {
        const state = await recordOwnerGateFailure(user.id);
        console.log('[ownerGate] wrong password (delete_account)', {
          userId: user.id,
          failures: state.failures,
          lockedUntil: state.lockedUntil,
          now: Date.now(),
          locked: state.lockedUntil > Date.now(),
        });
        if (state.lockedUntil > Date.now()) {
          const secondsLeft = Math.ceil((state.lockedUntil - Date.now()) / 1000);
          const human =
            secondsLeft > 60
              ? `${Math.ceil(secondsLeft / 60)} minute${
                  Math.ceil(secondsLeft / 60) === 1 ? '' : 's'
                }`
              : `${secondsLeft} second${secondsLeft === 1 ? '' : 's'}`;
          Alert.alert(
            'Too Many Attempts',
            `That password did not match and this device is now locked for ${human}.`
          );
        } else {
          const remaining = Math.max(
            0,
            OWNER_GATE_LOCKOUT_STEP_1.threshold - state.failures
          );
          const attemptLine =
            remaining > 0
              ? `Attempt ${state.failures}/${OWNER_GATE_LOCKOUT_STEP_1.threshold}. ${remaining} more wrong ${
                  remaining === 1 ? 'attempt' : 'attempts'
                } will lock this device for 30 seconds.`
              : `Attempt ${state.failures}. This device will be locked on the next wrong attempt.`;
          Alert.alert(
            'Incorrect Password',
            `That password did not match. ${attemptLine}`
          );
        }
        return;
      }

      // Re-auth succeeded — clear lockout and fire the destructive RPC.
      await clearOwnerGateLock(user.id);

      setDeletingAccount(true);
      const { error: deleteError } = await supabase.rpc('delete_account');
      if (deleteError) {
        Alert.alert('Error', deleteError.message);
        return;
      }

      // Tear down the gate before signOut unmounts this screen.
      setDeleteGateVisible(false);
      setDeleteGatePassword('');
      await signOut();
    } catch (err: any) {
      console.warn('Delete account error:', err);
      Alert.alert(
        'Error',
        err?.message ?? 'Could not delete your account. Please try again.'
      );
    } finally {
      setDeleteGateSaving(false);
      setDeletingAccount(false);
    }
  }, [user, deleteGateSaving, deleteGatePassword, deletingAccount, signOut]);

  if (!user || (!embedded && role !== 'customer')) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyEmoji}>🔒</Text>
        <Text style={styles.heading}>Profile</Text>
        <Text style={styles.subtext}>
          Sign in as a customer to see your profile.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#6C3AED"
        />
      }
    >
      <View style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {(user.email ?? '?')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>Customer</Text>
        </View>
      </View>

      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'vibe' && styles.segmentBtnActive]}
          onPress={() => setTab('vibe')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.segmentBtnText,
              tab === 'vibe' && styles.segmentBtnTextActive,
            ]}
          >
            My Vibe Checks
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'favorites' && styles.segmentBtnActive]}
          onPress={() => setTab('favorites')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.segmentBtnText,
              tab === 'favorites' && styles.segmentBtnTextActive,
            ]}
          >
            My Favorites
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'vibe' ? (
        <>
          <Text style={styles.sectionTitle}>Your Vibe Checks</Text>
          {loading ? (
            <ActivityIndicator
              size="large"
              color="#6C3AED"
              style={{ marginTop: 24 }}
            />
          ) : checks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyTitle}>No Vibe Checks yet</Text>
              <Text style={styles.emptySubtext}>
                Tap a business on the map to leave your first review!
              </Text>
            </View>
          ) : (
            checks.map((vc) => (
              <View key={vc.id} style={styles.checkCard}>
                <View style={styles.checkHeader}>
                  <Text style={styles.checkBizName} numberOfLines={1}>
                    {vc.business_name}
                  </Text>
                  <Text style={styles.checkStars}>{renderStars(vc.rating)}</Text>
                </View>
                {vc.comment ? (
                  <Text style={styles.checkComment}>{vc.comment}</Text>
                ) : null}
                <Text style={styles.checkDate}>{formatDate(vc.created_at)}</Text>
              </View>
            ))
          )}
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>My Favorites</Text>
          {favoritesLoading ? (
            <ActivityIndicator
              size="large"
              color="#6C3AED"
              style={{ marginTop: 24 }}
            />
          ) : favorites.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>❤️</Text>
              <Text style={styles.emptyTitle}>No favorites yet</Text>
              <Text style={styles.emptySubtext}>
                Tap the heart on a business on the map to add it here!
              </Text>
            </View>
          ) : (
            favorites.map((biz) => (
              <View key={biz.id} style={styles.favCard}>
                {biz.flash_sale?.trim() ? (
                  <View style={styles.flashSaleBadge}>
                    <Text style={styles.flashSaleBadgeText}>
                      🔥 Active Flash Sale
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.favCardName} numberOfLines={2}>
                  {biz.business_name}
                </Text>
                <Text style={styles.favCardType}>
                  {biz.business_type}
                  {biz.flash_sale?.trim() ? ` · ${biz.flash_sale}` : ''}
                </Text>
              </View>
            ))
          )}
        </>
      )}

      {!embedded && (
        <>
          <TouchableOpacity
            style={styles.tutorialBtn}
            onPress={() => setShowTutorial(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.tutorialBtnText}>View App Tutorial</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteBtn, deletingAccount && styles.btnDisabled]}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
          >
            <Text style={styles.deleteText}>
              {deletingAccount ? 'Deleting Account…' : 'Delete Account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          <OnboardingTutorial
            visible={showTutorial}
            onFinish={() => setShowTutorial(false)}
          />

          {/* Delete-Account owner gate. Same pattern as Delete Business in
              login.tsx — password re-auth + shared SecureStore rate limiter. */}
          <Modal
            visible={deleteGateVisible}
            transparent
            animationType="fade"
            onRequestClose={closeDeleteGate}
          >
            <View style={styles.gateBackdrop}>
              <View style={styles.gateCard}>
                <Text style={styles.gateTitle}>Delete Account</Text>
                <Text style={styles.gateSubtext}>
                  Enter your account password to permanently delete your
                  account, all your businesses, and all your vibe checks.
                  This cannot be undone.
                </Text>
                <TextInput
                  style={styles.gateInput}
                  value={deleteGatePassword}
                  onChangeText={setDeleteGatePassword}
                  placeholder="Account password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.gateBtnRow}>
                  <TouchableOpacity
                    style={[
                      styles.gateConfirmBtn,
                      (deleteGateSaving || deletingAccount) && styles.btnDisabled,
                    ]}
                    onPress={handleConfirmDeleteAccount}
                    disabled={deleteGateSaving || deletingAccount}
                  >
                    {deleteGateSaving || deletingAccount ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Text style={styles.gateConfirmText}>Delete Account</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.gateCancelBtn}
                    onPress={closeDeleteGate}
                    disabled={deleteGateSaving || deletingAccount}
                  >
                    <Text style={styles.gateCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F9FAFB',
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 6,
  },
  subtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },

  /* Profile header */
  profileHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#6C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  email: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 6,
  },
  roleBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  roleBadgeText: {
    color: '#6C3AED',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* Segment control */
  segmentRow: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  segmentBtnTextActive: {
    color: '#6C3AED',
    fontWeight: '700',
  },

  /* Section */
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 12,
  },

  /* Empty state */
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },

  /* Check cards */
  checkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  checkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  checkBizName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
    marginRight: 8,
  },
  checkStars: {
    fontSize: 14,
    color: '#F59E0B',
  },
  checkComment: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 4,
  },
  checkDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  /* Favorites list */
  favCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  flashSaleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  flashSaleBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  favCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  favCardType: {
    fontSize: 13,
    color: '#6B7280',
    textTransform: 'capitalize',
  },

  /* Sign out */
  deleteBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  deleteText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 15,
  },
  tutorialBtn: {
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 32,
  },
  tutorialBtnText: {
    color: '#6C3AED',
    fontWeight: '700',
    fontSize: 15,
  },
  signOutBtn: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  signOutText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.6,
  },

  /* Delete-Account owner gate modal. Mirrors pinLock* styles from login.tsx. */
  gateBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  gateCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  gateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  gateSubtext: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 14,
  },
  gateInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
    marginBottom: 14,
  },
  gateBtnRow: {
    flexDirection: 'column',
    gap: 10,
  },
  gateConfirmBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  gateConfirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  gateCancelBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  gateCancelText: {
    color: '#1F2937',
    fontWeight: '700',
    fontSize: 15,
  },
});
