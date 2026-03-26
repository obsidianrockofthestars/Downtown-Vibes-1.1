import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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

  const [ownedBusiness, setOwnedBusiness] = useState<Business | null>(null);
  const [bizLoading, setBizLoading] = useState(false);

  const [flashSale, setFlashSale] = useState('');
  const [emojiIcon, setEmojiIcon] = useState('');
  const [menuLink, setMenuLink] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [creating, setCreating] = useState(false);
  const [businessType, setBusinessType] = useState('restaurant');
  const [pinTier, setPinTier] = useState<'single' | 'dual'>('single');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDescText, setEditDescText] = useState('');
  const [demoBypass, setDemoBypass] = useState(false);
  const [bypassModalVisible, setBypassModalVisible] = useState(false);
  const [bypassCode, setBypassCode] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallEntitlement, setPaywallEntitlement] = useState<'single_pin' | 'dual_pin'>('single_pin');

  const fetchBusinessData = async (userId: string) => {
    setBizLoading(true);
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', userId)
        .limit(1)
        .maybeSingle();

      if (error) console.warn('Owner fetch error:', error.message);

      if (data) {
        setOwnedBusiness(data);
        setFlashSale(data.flash_sale ?? '');
        setEmojiIcon(data.emoji_icon ?? '');
        setMenuLink(data.menu_link ?? '');
        setWebsite(data.website ?? '');
        setBusinessType(data.business_type ?? 'restaurant');
        setPinTier((data.account_tier as any) ?? 'single');
        setNeedsOnboarding(false);
      } else {
        setOwnedBusiness(null);
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
      setOwnedBusiness(null);
      setNeedsOnboarding(false);
      return;
    }
    if (role === 'customer') return;
    fetchBusinessData(user.id);
  }, [user, role]);

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
    if (!user) return;
    const name = newBusinessName.trim();
    if (!name) {
      Alert.alert('Missing Name', 'Enter your business name to continue.');
      return;
    }

    if (!demoBypass && !isRunningInExpoGo) {
      try {
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

        const customerInfo = await Purchases.getCustomerInfo();
        const hasSingle = typeof customerInfo.entitlements.active['single_pin'] !== 'undefined';
        const hasDual = typeof customerInfo.entitlements.active['dual_pin'] !== 'undefined';

        if (ownedPinCount === 0 && !hasSingle && !hasDual) {
          setPaywallEntitlement('single_pin');
          setShowPaywall(true);
          return;
        }

        if (ownedPinCount === 1 && !hasDual) {
          Alert.alert(
            'Upgrade Required',
            'You must upgrade to the $15/mo Dual Pin tier to add a second location.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'View Plans',
                onPress: () => {
                  setPaywallEntitlement('dual_pin');
                  setShowPaywall(true);
                },
              },
            ]
          );
          return;
        }
      } catch {
        Alert.alert('Error', 'Could not verify subscription status. Try again.');
        return;
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

    try {
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
    } catch {
      Alert.alert('Error', 'Failed to verify your location. Please try again.');
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

  const normalizeUrl = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  const handleSaveChanges = async () => {
    if (!ownedBusiness) return;

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
      .eq('id', ownedBusiness.id)
      .select()
      .single();

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else if (data) {
      setOwnedBusiness(data);
      setMenuLink(data.menu_link ?? '');
      setWebsite(data.website ?? '');

      const saleText = (data.flash_sale ?? '').trim();
      if (saleText) {
        Alert.alert('Saved', 'Your business has been updated.', [
          { text: 'Done', style: 'cancel' },
          {
            text: 'Share Flash Sale',
            onPress: () => {
              Share.share({
                message: `🔥 Flash Sale at ${data.business_name}! "${saleText}" — Open DowntownVibes to see the deal: ${DEEP_LINK}`,
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
    if (!ownedBusiness) return;
    if (editDescText.length > 100) {
      Alert.alert('Too Long', 'Description must be 100 characters or less.');
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from('businesses')
      .update({ description: editDescText.trim() || null })
      .eq('id', ownedBusiness.id)
      .select()
      .single();

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else if (data) {
      setOwnedBusiness(data);
      setIsEditingDesc(false);
      Alert.alert('Saved', 'Description updated.');
    }
  };

  const handleUpdateLocation = async () => {
    if (!ownedBusiness) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Denied',
        'Location access is required to update your pin.'
      );
      return;
    }

    setIsUpdatingLocation(true);

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
        .eq('id', ownedBusiness.id)
        .select()
        .single();

      if (error) {
        Alert.alert('Error', error.message);
      } else if (data) {
        setOwnedBusiness(data);
        Alert.alert('Success', 'Your pin has been moved to your current location!', [
          { text: 'Done', style: 'cancel' },
          {
            text: 'Share Update',
            onPress: () => {
              Share.share({
                message: `📍 ${data.business_name} just moved! Find us on DowntownVibes: ${DEEP_LINK}`,
                title: 'DowntownVibes Pin Update',
              }).catch(() => {});
            },
          },
        ]);
      }
    } catch {
      Alert.alert('Error', 'Failed to acquire GPS position.');
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  const handleRemoveTravelingPin = async () => {
    if (!ownedBusiness) return;

    setIsUpdatingLocation(true);
    try {
      const { error } = await supabase
        .from('businesses')
        .update({ is_traveling_active: false })
        .eq('id', ownedBusiness.id);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      setOwnedBusiness((prev) =>
        prev ? { ...prev, is_traveling_active: false } : prev
      );
      Alert.alert('Traveling pin removed');
    } finally {
      setIsUpdatingLocation(false);
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
  if (user && ownedBusiness) {
    const isDualTier = ownedBusiness.account_tier === 'dual';
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
            <Text style={styles.bizName}>{ownedBusiness.business_name}</Text>
            <Text style={styles.bizType}>{ownedBusiness.business_type}</Text>
            {isDualTier && (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>Pro Tier: Dual-Pin Active</Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Description</Text>
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
                  {ownedBusiness.description || 'No description yet.'}
                </Text>
                <TouchableOpacity
                  style={styles.editDescBtn}
                  onPress={() => {
                    setEditDescText(ownedBusiness.description ?? '');
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

          {isDualTier ? (
            <>
              <TouchableOpacity
                style={[
                  styles.locationBtn,
                  isUpdatingLocation && styles.btnDisabled,
                ]}
                onPress={handleUpdateLocation}
                disabled={isUpdatingLocation}
              >
                {isUpdatingLocation ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.locationBtnText}>
                    📍 Update Pin to My Current Location
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.clearTravelingBtn}
                onPress={handleRemoveTravelingPin}
                activeOpacity={0.85}
              >
                <Text style={styles.clearTravelingBtnText}>
                  🧹 Remove Traveling Pin
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.upgradeBlock}>
              <TouchableOpacity
                style={styles.upgradeBtn}
                onPress={() => { setPaywallEntitlement('dual_pin'); setShowPaywall(true); }}
                activeOpacity={0.85}
              >
                <Text style={styles.upgradeBtnText}>
                  Upgrade to Dual-Pin (Pro)
                </Text>
              </TouchableOpacity>
              <Text style={styles.upgradeHelpText}>
                Perfect for Food Trucks and Pop-ups. Keep your permanent storefront pin while adding a second live-tracking pin when you travel.
              </Text>
            </View>
          )}

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
              RevenueCatUI.presentCustomerCenter().catch(() =>
                Alert.alert('Error', 'Could not open subscription management.')
              );
            }}
          >
            <Text style={styles.manageSubBtnText}>Manage Subscription</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
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
          <Pressable
            onLongPress={() => {
              setBypassCode('');
              setBypassModalVisible(true);
            }}
            delayLongPress={800}
          >
            <Text style={styles.onboardingTitle}>
              Welcome! Let's get your business on the map.
            </Text>
          </Pressable>
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

          <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          <Modal
            visible={bypassModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setBypassModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Admin Override</Text>
                <TextInput
                  style={styles.input}
                  value={bypassCode}
                  onChangeText={setBypassCode}
                  placeholder="Enter bypass code"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  secureTextEntry
                />
                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnConfirm]}
                    onPress={() => {
                      if (bypassCode === 'dylandual26') {
                        setDemoBypass(true);
                        setBypassModalVisible(false);
                        Alert.alert('Bypass Active', 'Paywall check disabled for this session.');
                      } else {
                        Alert.alert('Invalid Code');
                      }
                    }}
                  >
                    <Text style={styles.modalBtnText}>Confirm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setBypassModalVisible(false)}
                  >
                    <Text style={[styles.modalBtnText, { color: '#6B7280' }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

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
                    RevenueCat paywall is disabled in Expo Go. Use a dev build to test purchases.
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
                    options={{} as any}
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
  locationBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 8,
  },
  locationBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
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
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
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

  /* Bypass modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 14,
    textAlign: 'center',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnConfirm: {
    backgroundColor: '#6C3AED',
  },
  modalBtnCancel: {
    backgroundColor: '#F3F4F6',
  },
  modalBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
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
