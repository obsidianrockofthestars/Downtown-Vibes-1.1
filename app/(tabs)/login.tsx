import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import Purchases from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';

// Lazy-loaded to avoid crash in Expo Go where the native module isn't available.
let _rcUI: typeof import('react-native-purchases-ui') | null = null;
async function loadRevenueCatUI() {
  if (!_rcUI) {
    _rcUI = await import('react-native-purchases-ui');
  }
  return _rcUI;
}
import { useAuth } from '@/context/AuthContext';
import { isRunningInExpoGo } from '@/lib/expoGo';
import { supabase } from '@/lib/supabase';
import { Business, UserRole } from '@/lib/types';
import { haversineDistance } from '@/lib/haversine';

const CLAIM_RADIUS_MILES = 0.1;
const DEEP_LINK =
  'https://play.google.com/store/apps/details?id=com.potionsandfamiliars.downtownvibes';

export default function LoginScreen() {
  const { user, role, loading, signIn, signUp, signOut } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authRole, setAuthRole] = useState<UserRole | null>(null);

  const [ownedBusinesses, setOwnedBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(
    null
  );
  const [bizLoading, setBizLoading] = useState(false);

  const [flashSale, setFlashSale] = useState('');
  const [emojiIcon, setEmojiIcon] = useState('');
  const [menuLink, setMenuLink] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [updatingLocationId, setUpdatingLocationId] = useState<string | null>(
    null
  );
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [creating, setCreating] = useState(false);
  const [businessType, setBusinessType] = useState('restaurant');
  const [pinTier, setPinTier] = useState<'single' | 'dual'>('single');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDescText, setEditDescText] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallEntitlement, setPaywallEntitlement] = useState<'single_pin' | 'dual_pin'>('single_pin');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletingBusinessId, setDeletingBusinessId] = useState<string | null>(
    null
  );
  const [pinLockModalVisible, setPinLockModalVisible] = useState(false);
  const [pinLockTargetId, setPinLockTargetId] = useState<string | null>(null);
  const [pinLockMode, setPinLockMode] = useState<'lock' | 'unlock'>('lock');
  const [pinLockPasswordInput, setPinLockPasswordInput] = useState('');
  const [pinLockSaving, setPinLockSaving] = useState(false);

  const fetchBusinessData = async (userId: string) => {
    setBizLoading(true);
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select(
          [
            'id',
            'owner_id',
            'business_name',
            'business_type',
            'account_tier',
            'latitude',
            'longitude',
            'static_latitude',
            'static_longitude',
            'is_traveling_active',
            'emoji_icon',
            'flash_sale',
            'is_pin_locked',
            'pin_lock_password',
            'menu_link',
            'website',
            'description',
            'is_active',
          ].join(',')
        )
        .eq('owner_id', userId)
        .order('business_name', { ascending: true });

      if (error) console.warn('Owner fetch error:', error.message);

      const rows = ((data ?? []) as unknown as Business[]) ?? [];

      if (rows.length > 0) {
        setOwnedBusinesses(rows);
        setNeedsOnboarding(false);
        setSelectedBusinessId((prev) => {
          if (prev && rows.some((r) => r.id === prev)) return prev;
          return rows[0].id;
        });
      } else {
        setOwnedBusinesses([]);
        setSelectedBusinessId(null);
        setNeedsOnboarding(true);
      }
    } catch (err) {
      console.warn('Owner fetch exception:', err);
    } finally {
      setBizLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setOwnedBusinesses([]);
      setSelectedBusinessId(null);
      setNeedsOnboarding(false);
      return;
    }
    if (role === 'customer') return;
    fetchBusinessData(user.id);
  }, [user, role]);

  const activeBusiness = useMemo(
    () =>
      ownedBusinesses.find((b) => b.id === selectedBusinessId) ??
      ownedBusinesses[0] ??
      null,
    [ownedBusinesses, selectedBusinessId]
  );

  useEffect(() => {
    const b = activeBusiness;
    if (!b) return;
    setFlashSale(b.flash_sale ?? '');
    setEmojiIcon(b.emoji_icon ?? '');
    setMenuLink(b.menu_link ?? '');
    setWebsite(b.website ?? '');
    setBusinessType(b.business_type ?? 'restaurant');
    setPinTier((b.account_tier as 'single' | 'dual') ?? 'single');
    setIsEditingDesc(false);
  }, [activeBusiness?.id]);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Enter your email and password.');
      return;
    }
    setAuthLoading(true);
    const { error } = await signIn(email, password);
    setAuthLoading(false);

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        Alert.alert(
          'Verify Your Email',
          'You need to click the confirmation link we sent to your email before logging in. Check your spam folder!'
        );
      } else {
        Alert.alert('Sign In Failed', error.message);
      }
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Enter your email and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    setAuthLoading(true);
    const { error } = await signUp(email, password, authRole ?? 'customer');
    setAuthLoading(false);
    if (error) {
      Alert.alert('Sign Up Failed', error.message);
    } else {
      Alert.alert('Check Your Email', 'We sent you a confirmation link.');
    }
  };

  const handleCreateBusiness = async () => {
    try {
      if (!user) return;
      const name = newBusinessName.trim();
      if (!name) {
        Alert.alert('Missing Name', 'Enter your business name to continue.');
        return;
      }

      if (!isRunningInExpoGo) {
        const { count, error: countErr } = await supabase
          .from('businesses')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', user.id);

        if (countErr) {
          Alert.alert('Error', 'Could not verify your current pins. Try again.');
          return;
        }

        const ownedPinCount = count ?? 0;
        if (ownedPinCount >= 2) {
          Alert.alert(
            'Maximum Locations Reached',
            'You currently have 2 pins. Contact support for enterprise pricing.'
          );
          return;
        }

        const requiredEntitlementIdentifier =
          ownedPinCount === 0 ? 'single_pin' : 'dual_pin';

        const customerInfo = await Purchases.getCustomerInfo();
        const hasSingle =
          typeof customerInfo.entitlements.active['single_pin'] !== 'undefined';
        const hasDual =
          typeof customerInfo.entitlements.active['dual_pin'] !== 'undefined';

        const hasRequiredEntitlement =
          requiredEntitlementIdentifier === 'single_pin'
            ? hasSingle || hasDual
            : hasDual;

        if (!hasRequiredEntitlement) {
          const rcUI = await loadRevenueCatUI();
          const result = await rcUI.default.presentPaywallIfNeeded({
            requiredEntitlementIdentifier,
          });

          if (
            result !== rcUI.PAYWALL_RESULT.PURCHASED &&
            result !== rcUI.PAYWALL_RESULT.RESTORED
          ) {
            return;
          }
        }
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Required',
          'You must enable location access to claim a business.'
        );
        return;
      }

      setCreating(true);

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const userLat = loc.coords.latitude;
      const userLon = loc.coords.longitude;

      const insertPayload: any = {
        id: Crypto.randomUUID(),
        owner_id: user.id,
        business_name: name,
        business_type: businessType,
        account_tier: pinTier,
        latitude: userLat,
        longitude: userLon,
        is_active: true,
      };

      if (pinTier === 'dual') {
        insertPayload.static_latitude = userLat;
        insertPayload.static_longitude = userLon;
      }

      const { error } = await supabase.from('businesses').insert(insertPayload);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        setNewBusinessName('');
        await fetchBusinessData(user.id);
        promptSharePin(name);
      }
    } catch (err: any) {
      console.warn('Create business error:', err);
      Alert.alert(
        'Error',
        err?.message ?? 'Something went wrong. Please try again.'
      );
    } finally {
      setCreating(false);
    }
  };

  const promptSharePin = (businessName: string) => {
    Alert.alert('Pin Created!', 'Your business is now on the map.', [
      { text: 'Done', style: 'cancel' },
      {
        text: 'Share',
        onPress: () => {
          Share.share({
            message: `📍 ${businessName} is now on DowntownVibes! Find us on the map: ${DEEP_LINK}`,
            title: 'DowntownVibes',
          }).catch(() => {});
        },
      },
    ]);
  };

  const handleDeleteAccount = useCallback(() => {
    if (!user || deletingAccount) return;

    Alert.alert(
      'Delete Account?',
      "Are you sure you want to permanently delete your account? This will NOT automatically cancel your active subscriptions. You must cancel your subscription in your device's Apple ID settings. This action cannot be undone.",
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

  const handleDeleteBusiness = useCallback(
    (businessId: string) => {
      if (!user || deletingBusinessId) return;

      Alert.alert(
        'Delete Business?',
        'Are you sure you want to permanently delete this business and its pin? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                setDeletingBusinessId(businessId);

                const { error } = await supabase
                  .from('businesses')
                  .delete()
                  .eq('id', businessId);

                if (error) {
                  Alert.alert('Error', error.message);
                  return;
                }

                await fetchBusinessData(user.id);
              } catch (err: any) {
                console.warn('Delete business error:', err);
                Alert.alert(
                  'Error',
                  err?.message ?? 'Could not delete this business. Please try again.'
                );
              } finally {
                setDeletingBusinessId(null);
              }
            },
          },
        ]
      );
    },
    [user, deletingBusinessId]
  );

  const normalizeUrl = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  const handleSaveChanges = async () => {
    if (!activeBusiness) return;

    const cleanMenu = normalizeUrl(menuLink);
    const cleanWebsite = normalizeUrl(website);

    if (menuLink.trim() && !cleanMenu?.startsWith('http')) {
      Alert.alert('Invalid URL', 'Menu link must be a valid web address.');
      return;
    }
    if (website.trim() && !cleanWebsite?.startsWith('http')) {
      Alert.alert('Invalid URL', 'Website must be a valid web address.');
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from('businesses')
      .update({
        flash_sale: flashSale.trim() || null,
        emoji_icon: emojiIcon.trim() || null,
        menu_link: cleanMenu,
        website: cleanWebsite,
        business_type: businessType,
      })
      .eq('id', activeBusiness.id)
      .select()
      .single();

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else if (data) {
      const row = data as unknown as Business;
      setOwnedBusinesses((prev) =>
        prev.map((b) => (b.id === row.id ? row : b))
      );
      setMenuLink(row.menu_link ?? '');
      setWebsite(row.website ?? '');

      const saleText = (row.flash_sale ?? '').trim();
      if (saleText) {
        Alert.alert('Saved', 'Your business has been updated.', [
          { text: 'Done', style: 'cancel' },
          {
            text: 'Share Flash Sale',
            onPress: () => {
              Share.share({
                message: `🔥 Flash Sale at ${row.business_name}! "${saleText}" — Open DowntownVibes to see the deal: ${DEEP_LINK}`,
                title: 'DowntownVibes Flash Sale',
              }).catch(() => {});
            },
          },
        ]);
      } else {
        Alert.alert('Saved', 'Your business has been updated.');
      }
    }
  };

  const handleUpdateDescription = async () => {
    if (!activeBusiness) return;
    if (editDescText.length > 100) {
      Alert.alert('Too Long', 'Description must be 100 characters or less.');
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from('businesses')
      .update({ description: editDescText.trim() || null })
      .eq('id', activeBusiness.id)
      .select()
      .single();

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else if (data) {
      const row = data as unknown as Business;
      setOwnedBusinesses((prev) =>
        prev.map((b) => (b.id === row.id ? row : b))
      );
      setIsEditingDesc(false);
      Alert.alert('Saved', 'Description updated.');
    }
  };

  const handleUpdateLocation = async (businessId: string) => {
    const biz = ownedBusinesses.find((b) => b.id === businessId);
    if (!biz) return;
    if (biz.is_pin_locked) {
      Alert.alert(
        'Pin Locked',
        'This pin is locked. Unlock pin location to update it.'
      );
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Denied',
        'Location access is required to update your pin.'
      );
      return;
    }

    setUpdatingLocationId(businessId);

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { data, error } = await supabase
        .from('businesses')
        .update({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          is_traveling_active: true,
        })
        .eq('id', businessId)
        .select()
        .single();

      if (error) {
        Alert.alert('Error', error.message);
      } else if (data) {
        const row = data as unknown as Business;
        setOwnedBusinesses((prev) =>
          prev.map((b) => (b.id === row.id ? row : b))
        );
        Alert.alert('Success', 'Your pin has been moved to your current location!', [
          { text: 'Done', style: 'cancel' },
          {
            text: 'Share Update',
            onPress: () => {
              Share.share({
                message: `📍 ${row.business_name} just moved! Find us on DowntownVibes: ${DEEP_LINK}`,
                title: 'DowntownVibes Pin Update',
              }).catch(() => {});
            },
          },
        ]);
      }
    } catch {
      Alert.alert('Error', 'Failed to acquire GPS position.');
    } finally {
      setUpdatingLocationId(null);
    }
  };

  const openLockPinModal = useCallback((businessId: string) => {
    setPinLockTargetId(businessId);
    setPinLockMode('lock');
    setPinLockPasswordInput('');
    setPinLockModalVisible(true);
  }, []);

  const openUnlockPinModal = useCallback((businessId: string) => {
    setPinLockTargetId(businessId);
    setPinLockMode('unlock');
    setPinLockPasswordInput('');
    setPinLockModalVisible(true);
  }, []);

  const handleConfirmPinLock = useCallback(async () => {
    if (!user || !pinLockTargetId || pinLockSaving) return;

    try {
      setPinLockSaving(true);

      if (pinLockMode === 'lock') {
        const password = pinLockPasswordInput.trim();
        if (!password) {
          Alert.alert(
            'Password required',
            'Enter a password to lock this pin location.'
          );
          return;
        }

        const { data, error } = await supabase
          .from('businesses')
          .update({
            is_pin_locked: true,
            pin_lock_password: password,
          })
          .eq('id', pinLockTargetId)
          .select('id,is_pin_locked,pin_lock_password')
          .single();

        if (error) {
          Alert.alert('Error', error.message);
          return;
        }

        const locked = data as {
          id: string;
          is_pin_locked: boolean;
          pin_lock_password: string | null;
        };
        setOwnedBusinesses((prev) =>
          prev.map((b) =>
            b.id === locked.id
              ? {
                  ...b,
                  is_pin_locked: locked.is_pin_locked,
                  pin_lock_password: locked.pin_lock_password,
                }
              : b
          )
        );
        setPinLockModalVisible(false);
        setPinLockTargetId(null);
        Alert.alert('Pin Locked', 'Pin location is now locked.');
        return;
      }

      const { data: latest, error: fetchErr } = await supabase
        .from('businesses')
        .select('pin_lock_password,is_pin_locked')
        .eq('id', pinLockTargetId)
        .maybeSingle();

      if (fetchErr) {
        Alert.alert('Error', fetchErr.message);
        return;
      }

      const expected = ((latest as any)?.pin_lock_password ?? '') as string;
      const provided = pinLockPasswordInput;

      if ((expected ?? '') !== (provided ?? '')) {
        Alert.alert('Incorrect Password', 'That password does not match.');
        return;
      }

      const { data, error } = await supabase
        .from('businesses')
        .update({ is_pin_locked: false, pin_lock_password: null })
        .eq('id', pinLockTargetId)
        .select('id,is_pin_locked,pin_lock_password')
        .single();

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      const unlocked = data as {
        id: string;
        is_pin_locked: boolean;
        pin_lock_password: string | null;
      };
      setOwnedBusinesses((prev) =>
        prev.map((b) =>
          b.id === unlocked.id
            ? {
                ...b,
                is_pin_locked: unlocked.is_pin_locked,
                pin_lock_password: unlocked.pin_lock_password,
              }
            : b
        )
      );
      setPinLockModalVisible(false);
      setPinLockTargetId(null);
      Alert.alert('Unlocked', 'Pin location is now unlocked.');
    } catch (err: any) {
      console.warn('Pin lock error:', err);
      Alert.alert('Error', err?.message ?? 'Something went wrong.');
    } finally {
      setPinLockSaving(false);
    }
  }, [user, pinLockTargetId, pinLockSaving, pinLockMode, pinLockPasswordInput]);

  const handleRemoveTravelingPin = async (businessId: string) => {
    setUpdatingLocationId(businessId);
    try {
      const { error } = await supabase
        .from('businesses')
        .update({ is_traveling_active: false })
        .eq('id', businessId);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      setOwnedBusinesses((prev) =>
        prev.map((b) =>
          b.id === businessId ? { ...b, is_traveling_active: false } : b
        )
      );
      Alert.alert('Traveling pin removed');
    } finally {
      setUpdatingLocationId(null);
    }
  };

  // ─── Loading spinner ─────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C3AED" />
      </View>
    );
  }

  // ─── Customer redirect ────────────────────────────────────────
  if (user && role === 'customer') {
    return (
      <View style={styles.center}>
        <Text style={styles.customerRedirectEmoji}>✨</Text>
        <Text style={styles.customerRedirectTitle}>You're signed in!</Text>
        <Text style={styles.customerRedirectSub}>
          Head to the Account tab to manage your account and Vibe Checks.
        </Text>
      </View>
    );
  }

  // ─── Logged-in: Owner Dashboard ──────────────────────────────
  if (user && activeBusiness) {
    const pinLockTargetName =
      ownedBusinesses.find((b) => b.id === pinLockTargetId)?.business_name ?? '';
    const showDualUpgrade = ownedBusinesses.some(
      (b) => b.account_tier !== 'dual'
    );

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.dashboardHeader}>
            <Text style={styles.heading}>Owner Dashboard</Text>
            <Text style={styles.dashboardSubtext}>
              Each card is one map pin. Tap a card to edit its details below.
            </Text>
          </View>

          {ownedBusinesses.map((biz) => {
            const isDual = biz.account_tier === 'dual';
            const isSelected = biz.id === selectedBusinessId;
            const locBusy = updatingLocationId === biz.id;
            return (
              <View
                key={biz.id}
                style={[
                  styles.bizPinCard,
                  isSelected && styles.bizPinCardSelected,
                ]}
              >
                <TouchableOpacity
                  onPress={() => setSelectedBusinessId(biz.id)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.bizPinCardName}>{biz.business_name}</Text>
                  <Text style={styles.bizPinCardType}>{biz.business_type}</Text>
                  {isDual && (
                    <View style={[styles.proBadge, { alignSelf: 'flex-start', marginTop: 8 }]}>
                      <Text style={styles.proBadgeText}>Pro: Dual-Pin</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.bizPinCardActionStack}>
                  {!biz.is_pin_locked ? (
                    <TouchableOpacity
                      style={[
                        styles.bizCardUpdatePinBtn,
                        locBusy && styles.btnDisabled,
                      ]}
                      onPress={() => handleUpdateLocation(biz.id)}
                      disabled={!!locBusy}
                      activeOpacity={0.85}
                    >
                      {locBusy ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.bizCardUpdatePinBtnText}>
                          📍 Update Pin Location
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.bizCardLockPinBtn,
                      !biz.is_pin_locked && styles.bizCardActionBtnSpacing,
                      (pinLockSaving || locBusy) && styles.btnDisabled,
                    ]}
                    onPress={() =>
                      biz.is_pin_locked
                        ? openUnlockPinModal(biz.id)
                        : openLockPinModal(biz.id)
                    }
                    disabled={pinLockSaving || !!locBusy}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.bizCardLockPinBtnText}>
                      {biz.is_pin_locked
                        ? 'Unlock Pin Location'
                        : 'Lock Pin Location'}
                    </Text>
                  </TouchableOpacity>

                  {isDual ? (
                    <TouchableOpacity
                      style={[
                        styles.bizCardRemoveTravelingBtn,
                        styles.bizCardActionBtnSpacing,
                        locBusy && styles.btnDisabled,
                      ]}
                      onPress={() => handleRemoveTravelingPin(biz.id)}
                      disabled={!!locBusy}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.bizCardRemoveTravelingBtnText}>
                        🧹 Remove Traveling Pin
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.bizCardDeleteBtn,
                      styles.bizCardActionBtnSpacing,
                      deletingBusinessId === biz.id && styles.btnDisabled,
                    ]}
                    onPress={() => handleDeleteBusiness(biz.id)}
                    disabled={!!deletingBusinessId}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.bizCardDeleteBtnText}>
                      {deletingBusinessId === biz.id
                        ? 'Deleting…'
                        : 'Delete Business'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {showDualUpgrade ? (
            <View style={styles.upgradeBlock}>
              <TouchableOpacity
                style={styles.upgradeBtn}
                onPress={() => {
                  setPaywallEntitlement('dual_pin');
                  setShowPaywall(true);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.upgradeBtnText}>
                  Upgrade to Dual-Pin (Pro)
                </Text>
              </TouchableOpacity>
              <Text style={styles.upgradeHelpText}>
                Perfect for Food Trucks and Pop-ups. Keep your permanent
                storefront pin while adding a second live-tracking pin when you
                travel.
              </Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.editTargetHint}>
              Editing: {activeBusiness.business_name}
            </Text>
            <Text style={[styles.cardLabel, { marginTop: 10 }]}>Description</Text>
            {isEditingDesc ? (
              <>
                <TextInput
                  style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={editDescText}
                  onChangeText={setEditDescText}
                  placeholder="Describe your business in a sentence..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  maxLength={100}
                />
                <Text style={styles.charCounter}>
                  {editDescText.length}/100
                </Text>
                <View style={styles.descBtnRow}>
                  <TouchableOpacity
                    style={[styles.descBtn, styles.descBtnSave, saving && styles.btnDisabled]}
                    onPress={handleUpdateDescription}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Text style={styles.descBtnSaveText}>Save</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.descBtn, styles.descBtnCancel]}
                    onPress={() => setIsEditingDesc(false)}
                  >
                    <Text style={styles.descBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.descText}>
                  {activeBusiness.description || 'No description yet.'}
                </Text>
                <TouchableOpacity
                  style={styles.editDescBtn}
                  onPress={() => {
                    setEditDescText(activeBusiness.description ?? '');
                    setIsEditingDesc(true);
                  }}
                >
                  <Text style={styles.editDescBtnText}>Edit Description</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Flash Sale</Text>
            <TextInput
              style={styles.input}
              value={flashSale}
              onChangeText={setFlashSale}
              placeholder='e.g. "50% off couches today!"'
              placeholderTextColor="#9CA3AF"
              multiline
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Business Type</Text>
            <View style={styles.typeRow}>
              {(['restaurant', 'bar', 'retail', 'traveling'] as const).map((t) => {
                const active = businessType === t;
                const label =
                  t === 'restaurant'
                    ? 'Restaurant'
                    : t === 'bar'
                      ? 'Bar'
                      : t === 'retail'
                        ? 'Retail'
                        : 'Traveling';
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, active && styles.typeBtnActive]}
                    onPress={() => setBusinessType(t)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.typeBtnText, active && styles.typeBtnTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helperText}>This controls your category on the map.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Emoji Icon</Text>
            <TextInput
              style={[styles.input, styles.emojiInput]}
              value={emojiIcon}
              onChangeText={(text) => setEmojiIcon([...text].slice(0, 2).join(''))}
              placeholder='e.g. "🍔" or "🐈‍⬛"'
              placeholderTextColor="#9CA3AF"
              maxLength={4}
            />
            <Text style={styles.helperText}>1–2 characters shown on your map pin</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Menu Link</Text>
            <TextInput
              style={styles.input}
              value={menuLink}
              onChangeText={setMenuLink}
              placeholder="Menu URL (e.g., https://...)"
              placeholderTextColor="#9CA3AF"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.helperText}>Shown as a "View Menu" button on your pin</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Website</Text>
            <TextInput
              style={styles.input}
              value={website}
              onChangeText={setWebsite}
              placeholder="Website URL (e.g., https://...)"
              placeholderTextColor="#9CA3AF"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.helperText}>Your business website or social page</Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            onPress={handleSaveChanges}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.manageSubBtn}
            onPress={() => {
              if (isRunningInExpoGo) {
                Alert.alert(
                  'Expo Go',
                  'Subscription management is not available in Expo Go. Use a development build to test RevenueCat.'
                );
                return;
              }
              loadRevenueCatUI()
                .then((rcUI) => rcUI.default.presentCustomerCenter())
                .catch(() =>
                  Alert.alert('Error', 'Could not open subscription management.')
                );
            }}
          >
            <Text style={styles.manageSubBtnText}>Manage Subscription</Text>
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

          {/* Paywall modal (Owner Dashboard) */}
          <Modal
            visible={showPaywall}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setShowPaywall(false)}
          >
            <View style={styles.paywallContainer}>
              {isRunningInExpoGo ? (
                <View style={styles.paywallContainer}>
                  <Text style={styles.paywallExpoGoTitle}>Paywall (Expo Go)</Text>
                  <Text style={styles.paywallExpoGoText}>
                    RevenueCat paywall is disabled in Expo Go. Use a native
                    TestFlight build to test purchases.
                  </Text>
                  <TouchableOpacity
                    style={styles.paywallCloseBtn}
                    onPress={() => setShowPaywall(false)}
                  >
                    <Text style={styles.paywallCloseBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <RevenueCatUI.Paywall
                    options={{ offeringIdentifier: 'default' } as any}
                    onPurchaseCompleted={() => setShowPaywall(false)}
                    onRestoreCompleted={() => setShowPaywall(false)}
                    onDismiss={() => setShowPaywall(false)}
                  />
                  <TouchableOpacity
                    style={styles.paywallCloseBtn}
                    onPress={() => setShowPaywall(false)}
                  >
                    <Text style={styles.paywallCloseBtnText}>Close</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Modal>

          <Modal
            visible={pinLockModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => {
              if (!pinLockSaving) {
                setPinLockModalVisible(false);
                setPinLockTargetId(null);
              }
            }}
          >
            <View style={styles.pinLockBackdrop}>
              <View style={styles.pinLockCard}>
                <Text style={styles.pinLockTitle}>
                  {pinLockMode === 'lock'
                    ? 'Lock Pin Location'
                    : 'Unlock Pin Location'}
                  {pinLockTargetName ? ` — ${pinLockTargetName}` : ''}
                </Text>
                <Text style={styles.pinLockSubtext}>
                  {pinLockMode === 'lock'
                    ? 'Choose a password. While locked, Update Pin Location is hidden until you unlock.'
                    : 'Enter your pin lock password to allow moving this pin again.'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={pinLockPasswordInput}
                  onChangeText={setPinLockPasswordInput}
                  placeholder={
                    pinLockMode === 'lock'
                      ? 'Choose a password'
                      : 'Password'
                  }
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  autoCapitalize="none"
                />

                <View style={styles.pinLockBtnRow}>
                  <TouchableOpacity
                    style={[
                      styles.pinLockPrimaryBtn,
                      pinLockSaving && styles.btnDisabled,
                    ]}
                    onPress={handleConfirmPinLock}
                    disabled={pinLockSaving}
                  >
                    {pinLockSaving ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Text style={styles.pinLockPrimaryText}>
                        {pinLockMode === 'lock' ? 'Lock Pin' : 'Unlock Pin'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.pinLockCancelBtn}
                    onPress={() => {
                      setPinLockModalVisible(false);
                      setPinLockTargetId(null);
                    }}
                    disabled={pinLockSaving}
                  >
                    <Text style={styles.pinLockCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ─── Logged-in: Owner Onboarding ──────────────────────────────
  if (user && needsOnboarding) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.onboardingContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.onboardingEmoji}>📍</Text>
          <Text style={styles.onboardingTitle}>
            Welcome! Let's get your business on the map.
          </Text>
          <Text style={styles.onboardingSubtext}>
            Enter your business name below and we'll create your pin. You can
            update your location, emoji, and details from the dashboard.
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.label}>Business Name</Text>
            <TextInput
              style={styles.input}
              value={newBusinessName}
              onChangeText={setNewBusinessName}
              placeholder="e.g. Joe's Coffee Shop"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
            />

            <Text style={[styles.label, { marginTop: 18 }]}>Business Type</Text>
            <View style={styles.typeRow}>
              {(['restaurant', 'bar', 'retail', 'traveling'] as const).map((t) => {
                const active = businessType === t;
                const label =
                  t === 'restaurant'
                    ? 'Restaurant'
                    : t === 'bar'
                      ? 'Bar'
                      : t === 'retail'
                        ? 'Retail'
                        : 'Traveling';
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, active && styles.typeBtnActive]}
                    onPress={() => setBusinessType(t)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.typeBtnText, active && styles.typeBtnTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: 18 }]}>Pin Tier</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  pinTier === 'single' && styles.toggleBtnActive,
                ]}
                onPress={() => setPinTier('single')}
              >
                <Text style={styles.toggleEmoji}>📍</Text>
                <Text
                  style={[
                    styles.toggleLabel,
                    pinTier === 'single' && styles.toggleLabelActive,
                  ]}
                >
                  Single Pin
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  pinTier === 'dual' && styles.toggleBtnActive,
                ]}
                onPress={() => setPinTier('dual')}
              >
                <Text style={styles.toggleEmoji}>📍📍</Text>
                <Text
                  style={[
                    styles.toggleLabel,
                    pinTier === 'dual' && styles.toggleLabelActive,
                  ]}
                >
                  Dual Pin
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>
              Single Pin: A permanent storefront. Dual Pin: Keep your permanent storefront pin while adding a second live-tracking pin when you travel.
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, creating && styles.btnDisabled]}
              onPress={handleCreateBusiness}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Create My Business Pin</Text>
              )}
            </TouchableOpacity>
          </View>

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

          <Modal
            visible={showPaywall}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setShowPaywall(false)}
          >
            <View style={styles.paywallContainer}>
              {isRunningInExpoGo ? (
                <View style={styles.paywallContainer}>
                  <Text style={styles.paywallExpoGoTitle}>Paywall (Expo Go)</Text>
                  <Text style={styles.paywallExpoGoText}>
                    RevenueCat paywall is disabled in Expo Go. Use a native
                    TestFlight build to test purchases.
                  </Text>
                  <TouchableOpacity
                    style={styles.paywallCloseBtn}
                    onPress={() => setShowPaywall(false)}
                  >
                    <Text style={styles.paywallCloseBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <RevenueCatUI.Paywall
                    options={{ offeringIdentifier: 'default' } as any}
                    onPurchaseCompleted={() => setShowPaywall(false)}
                    onRestoreCompleted={() => setShowPaywall(false)}
                    onDismiss={() => setShowPaywall(false)}
                  />
                  <TouchableOpacity
                    style={styles.paywallCloseBtn}
                    onPress={() => setShowPaywall(false)}
                  >
                    <Text style={styles.paywallCloseBtnText}>Close</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ─── Logged-in: Loading business data ─────────────────────────
  if (user && bizLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C3AED" />
      </View>
    );
  }

  // ─── Guest: Role picker ───────────────────────────────────────
  if (!user && !authRole) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.rolePickerContent}
      >
        <Text style={styles.logo}>DowntownVibes</Text>
        <Text style={styles.tagline}>How do you vibe?</Text>

        <TouchableOpacity
          style={styles.roleCard}
          activeOpacity={0.8}
          onPress={() => setAuthRole('owner')}
        >
          <Text style={styles.roleEmoji}>🏪</Text>
          <Text style={styles.roleTitle}>I'm a Business Owner</Text>
          <Text style={styles.roleSubtext}>
            Claim your pin, manage sales & more
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.roleCard}
          activeOpacity={0.8}
          onPress={() => setAuthRole('customer')}
        >
          <Text style={styles.roleEmoji}>🔥</Text>
          <Text style={styles.roleTitle}>I'm a Customer</Text>
          <Text style={styles.roleSubtext}>
            Discover deals, leave Vibe Checks — free!
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ─── Guest: Auth form (shared by both roles) ──────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.authContent}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setAuthRole(null)}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.logo}>DowntownVibes</Text>
        <Text style={styles.tagline}>
          {authRole === 'owner'
            ? 'Sign in to manage your business'
            : 'Sign in to start exploring'}
        </Text>

        <View style={styles.formCard}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.primaryBtn, authLoading && styles.btnDisabled]}
            onPress={handleSignIn}
            disabled={authLoading}
          >
            {authLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleSignUp}
            disabled={authLoading}
          >
            <Text style={styles.secondaryBtnText}>
              Don't have an account? Sign Up
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F9FAFB',
  },
  authContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },

  /* Customer redirect */
  customerRedirectEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  customerRedirectTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 8,
  },
  customerRedirectSub: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },

  /* Role picker */
  rolePickerContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  roleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  roleEmoji: {
    fontSize: 42,
    marginBottom: 10,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  roleSubtext: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },

  /* Back button */
  backBtn: {
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6C3AED',
  },

  /* Auth form */
  logo: {
    fontSize: 36,
    fontWeight: '900',
    color: '#6C3AED',
    textAlign: 'center',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 32,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  primaryBtn: {
    backgroundColor: '#6C3AED',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryBtn: {
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryBtnText: {
    color: '#6C3AED',
    fontWeight: '600',
    fontSize: 14,
  },

  /* Toggle row */
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  typeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  typeBtnActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#6C3AED',
  },
  typeBtnText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 13,
  },
  typeBtnTextActive: {
    color: '#6C3AED',
  },
  toggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  toggleBtnActive: {
    borderColor: '#6C3AED',
    backgroundColor: '#F3EAFF',
  },
  toggleEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  toggleLabelActive: {
    color: '#6C3AED',
  },

  /* Onboarding */
  onboardingContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  onboardingEmoji: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 12,
  },
  onboardingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  onboardingSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },

  /* Owner dashboard */
  dashboardHeader: {
    padding: 20,
    paddingBottom: 8,
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  bizName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6C3AED',
  },
  bizType: {
    fontSize: 14,
    color: '#6B7280',
    textTransform: 'capitalize',
    marginBottom: 12,
  },
  proBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginBottom: 6,
  },
  proBadgeText: {
    color: '#166534',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  dashboardSubtext: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginTop: 4,
  },
  bizPinCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bizPinCardSelected: {
    borderColor: '#6C3AED',
    borderWidth: 2,
    backgroundColor: '#FAF5FF',
  },
  bizPinCardName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  bizPinCardType: {
    fontSize: 14,
    color: '#6B7280',
    textTransform: 'capitalize',
    marginTop: 4,
  },
  bizPinCardActionStack: {
    marginTop: 18,
    width: '100%',
    alignSelf: 'stretch',
  },
  bizCardActionBtnSpacing: {
    marginTop: 12,
  },
  bizCardUpdatePinBtn: {
    width: '100%',
    backgroundColor: '#6C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  bizCardUpdatePinBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  bizCardLockPinBtn: {
    width: '100%',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  bizCardLockPinBtnText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 15,
  },
  bizCardRemoveTravelingBtn: {
    width: '100%',
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  bizCardRemoveTravelingBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  bizCardDeleteBtn: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  bizCardDeleteBtnText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 15,
  },
  editTargetHint: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6C3AED',
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  emojiInput: {
    fontSize: 28,
    textAlign: 'center',
    paddingVertical: 10,
  },
  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
  },
  descText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  charCounter: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
  },
  editDescBtn: {
    marginTop: 8,
  },
  editDescBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6C3AED',
  },
  descBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  descBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  descBtnSave: {
    backgroundColor: '#6C3AED',
  },
  descBtnSaveText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  descBtnCancel: {
    backgroundColor: '#F3F4F6',
  },
  descBtnCancelText: {
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 14,
  },
  pinLockBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pinLockCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
  },
  pinLockTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  pinLockSubtext: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  pinLockBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  pinLockPrimaryBtn: {
    flex: 1,
    backgroundColor: '#6C3AED',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pinLockPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  pinLockCancelBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pinLockCancelText: {
    color: '#6B7280',
    fontWeight: '800',
    fontSize: 14,
  },
  upgradeBlock: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 2,
  },
  upgradeBtn: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  upgradeBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  upgradeHelpText: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 18,
  },
  clearTravelingBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 10,
  },
  clearTravelingBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: '#6C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  manageSubBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  manageSubBtnText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 15,
  },
  deleteBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  deleteText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 15,
  },
  signOutBtn: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
  },
  signOutText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 15,
  },

  paywallContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  paywallExpoGoTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1F2937',
    marginTop: 48,
    marginHorizontal: 24,
    textAlign: 'center',
  },
  paywallExpoGoText: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 12,
    marginHorizontal: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  paywallCloseBtn: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  paywallCloseBtnText: {
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 16,
  },
});
