import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { VibeCheck } from '@/lib/types';

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

export default function ProfileScreen() {
  const { user, role, signOut } = useAuth();
  const [checks, setChecks] = useState<VibeCheckWithBiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchVibeChecks = useCallback(async () => {
    if (!user) {
      setChecks([]);
      setLoading(false);
      return;
    }

    const { data: rawChecks } = await supabase
      .from('vibe_checks')
      .select('*')
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

  useEffect(() => {
    fetchVibeChecks();
  }, [fetchVibeChecks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchVibeChecks();
    setRefreshing(false);
  };

  if (!user || role !== 'customer') {
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

      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
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

  /* Sign out */
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
});
