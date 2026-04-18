import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { OnboardingTutorial, ONBOARDING_SEEN_KEY } from '@/components/OnboardingTutorial';
import { Business, VibeCheck } from '@/lib/types';

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

  const handleDeleteAccount = useCallback(() => {
    if (!user || deletingAccount) return;

    Alert.alert(
      'Delete Account?',
      'Are you sure you want to permanently delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingAccount(true);

              const { error } = await supabase.rpc('delete_account');
              if (error) {
                Alert.alert('Error', error.message);
                return;
              }

              await signOut();
            } catch (err: any) {
              console.warn('Delete account error:', err);
              Alert.alert(
                'Error',
                err?.message ?? 'Could not delete your account. Please try again.'
              );
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  }, [user, deletingAccount, signOut]);

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
});
