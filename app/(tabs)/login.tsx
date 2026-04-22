import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import * as AppleAuthentication from 'expo-apple-authentication';
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
import { Business, UserRole, isAutoLinkCollisionError } from '@/lib/types';
import { haversineDistance } from '@/lib/haversine';
import ProfileScreen from './profile';
import { OnboardingTutorial } from '@/components/OnboardingTutorial';
import { StaticPinPickerModal } from '@/components/StaticPinPickerModal';
import { matchBlockedChain } from '@/lib/chainDenylist';
import { matchBlockedWord } from '@/lib/profanityFilter';
import {
  checkOwnerGateLock,
  clearOwnerGateLock,
  recordOwnerGateFailure,
  OWNER_GATE_LOCKOUT_STEP_1,
} from '@/lib/ownerGate';

const CLAIM_RADIUS_MILES = 0.1;
const DEEP_LINK =
  'https://play.google.com/store/apps/details?id=com.potionsandfamiliars.downtownvibes';

export default function LoginScreen() {
  const { user, role, loading, signIn, signUp, signOut } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authRole, setAuthRole] = useState<UserRole | null>(null);
  // Auth form mode: 'signIn' (default, for return users) or 'signUp' (create
  // account). Switched via the segmented control at the top of the form card.
  // Replaces the old "bottom link that secretly submits as signup" pattern.
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');

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
  const [showOwnerProfile, setShowOwnerProfile] = useState(false);
  const [showOwnerTutorial, setShowOwnerTutorial] = useState(false);
  const [staticPinPickerTargetId, setStaticPinPickerTargetId] = useState<
    string | null
  >(null);
  const [staticPinSaving, setStaticPinSaving] = useState(false);

  // Owner action gate — requires the owner's Supabase auth password before
  // firing destructive or financially-impactful actions. Prevents an employee
  // with an unlocked phone from:
  //   - deleting a business (data loss)
  //   - upgrading to a higher subscription tier (unauthorized charge)
  //   - cancelling or downgrading a subscription (service loss / data loss on
  //     pins that depend on the higher tier)
  // All three paths now funnel through the same modal + re-auth flow.
  type OwnerGateAction =
    | { kind: 'delete_business'; businessId: string }
    | { kind: 'delete_account' }
    | { kind: 'open_paywall'; entitlement: 'single_pin' | 'dual_pin' }
    | { kind: 'manage_subscription' };

  const [ownerGateAction, setOwnerGateAction] = useState<OwnerGateAction | null>(null);
  const [ownerGatePassword, setOwnerGatePassword] = useState('');
  const [ownerGateSaving, setOwnerGateSaving] = useState(false);

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
      Alert.alert('Sign In Failed', error.message);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Enter your email and password.');
      return;
    }
    // 8-char minimum (up from 6). Only enforced on signup — existing users
    // with 6-char passwords are grandfathered via handleSignIn. App Store
    // reviewers have flagged 6-char minimums in other apps.
    if (password.length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert(
        "Passwords Don't Match",
        'Re-enter the same password in both fields.'
      );
      return;
    }
    setAuthLoading(true);
    const { error } = await signUp(email, password, authRole ?? 'customer');
    setAuthLoading(false);
    if (error) {
      Alert.alert('Sign Up Failed', error.message);
    } else {
      // With Supabase "Confirm email" disabled, signUp returns an active
      // session immediately — AuthContext's onAuthStateChange will push the
      // user into the signed-in UI. This alert is a courtesy confirmation,
      // not a "please check your inbox" (which would be a lie).
      Alert.alert('Account Created', "You're all set — you've been signed in.");
    }
  };

  // Opens an external URL in the system browser. Used for ToS / Privacy
  // links in the sign-up agreement line. If the URL can't be opened
  // (simulator without a browser, unlikely on real device) we fall back to
  // an alert so the user sees the URL as plain text and can copy it.
  const openUrlOrAlert = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // fall through to alert
    }
    Alert.alert('Link', url);
  };

  const handleForgotPassword = async () => {
    // Sends a Supabase password-reset email. The link routes back into the
    // app via the `vibeathon://login` deep link (same scheme used for email
    // confirmation). A full in-app "set new password" flow ships in Track
    // 2.5b — for now, the user taps the link, lands on the app's default
    // sign-in screen, and can then use whatever temporary access Supabase
    // grants to set a new password. If they're on a desktop with no app
    // installed, they'll hit the webpage redirect (not yet wired) — document
    // as a known gap until 2.5b lands.
    if (!email) {
      Alert.alert(
        'Enter your email',
        'Type the email for your account first — we’ll send a reset link there.'
      );
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'vibeathon://login',
    });
    setAuthLoading(false);
    if (error) {
      Alert.alert('Reset Failed', error.message);
      return;
    }
    Alert.alert(
      'Check your email',
      `We sent a password-reset link to ${email}. Tap it from your phone to come back into the app.`
    );
  };

  const handleAppleSignIn = async () => {
    // Sign in with Apple — native iOS flow.
    //
    // Nonce contract:
    //   - We generate a random `rawNonce` and hash it with SHA-256 before
    //     handing it to Apple. Apple signs an identity token whose `nonce`
    //     claim is the HASHED value.
    //   - We then pass the RAW nonce (not the hash) to Supabase. Supabase
    //     re-hashes it and compares to the claim in the JWT. If they match,
    //     the token is proven fresh and not replayable.
    //   - If we passed the hashed value to Supabase, the comparison would
    //     fail. This is the #1 footgun in Apple-on-Supabase setups.
    //
    // Collision handling:
    //   - Supabase auto-links the Apple identity to any existing user whose
    //     email matches AND is already verified. For users whose email is
    //     unverified (currently only pre-Path-3 signups, now zero in prod),
    //     auto-link is blocked. `isAutoLinkCollisionError` catches that
    //     case so we can prompt the user to sign in with password first.
    try {
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      setAuthLoading(true);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        Alert.alert(
          'Sign In Failed',
          "Apple didn't return an identity token. Try again, or use email and password."
        );
        return;
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) {
        if (isAutoLinkCollisionError(error)) {
          Alert.alert(
            'Email Already in Use',
            'That email is already tied to a Downtown Vibes account. Sign in with your password first, then add Apple sign-in from Account settings.'
          );
        } else {
          Alert.alert('Sign In Failed', error.message);
        }
        return;
      }

      // On first sign-in only, Apple returns `fullName` and `email`. We seize
      // the chance to persist the name and — for brand-new users — the role
      // picker's current selection (owner vs customer). On subsequent sign-ins
      // `credential.fullName` is null, which is why this runs once.
      const nextMetadata: Record<string, string> = {};
      const existingRole = data.user?.user_metadata?.role as UserRole | undefined;
      if (!existingRole) {
        nextMetadata.role = authRole ?? 'customer';
      }
      if (credential.fullName) {
        const fullName = [
          credential.fullName.givenName,
          credential.fullName.familyName,
        ]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (fullName) nextMetadata.full_name = fullName;
      }
      if (Object.keys(nextMetadata).length > 0) {
        const { error: updateErr } = await supabase.auth.updateUser({
          data: nextMetadata,
        });
        if (updateErr) {
          // Non-fatal — the user is signed in, metadata is cosmetic. Log for
          // diagnostics but don't block the UI transition.
          console.warn('Apple sign-in metadata update failed:', updateErr.message);
        }
      }
      // AuthContext.onAuthStateChange flips the UI to the signed-in view — no
      // explicit navigation needed here.
    } catch (err: any) {
      // `ERR_REQUEST_CANCELED` fires when the user dismisses the Apple sheet.
      // Silent is correct — no toast, no error noise.
      if (err?.code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      Alert.alert(
        'Sign In Failed',
        err?.message ?? 'Something went wrong with Apple sign-in. Try again.'
      );
    } finally {
      setAuthLoading(false);
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

      // Profanity / slur filter — checked BEFORE the chain denylist so users
      // who try to register "Fuck My Ass" get the content-policy message, not
      // the chain-denylist message. Defense-in-depth mirror of the
      // enforce_content_moderation_trg trigger on businesses.business_name.
      // See lib/profanityFilter.ts for the full wordlist + sync invariant.
      if (matchBlockedWord(name) !== null) {
        // TODO(post-trial): fire log_moderation_hit RPC here once the audit
        // table ships. Reusing log_chain_denylist_hit would pollute the
        // chain-denylist reporting — keep the two streams separate.
        Alert.alert(
          'Business name not allowed',
          'Your business name contains words that are not allowed. Please choose a different name. ' +
            'If you believe this is an error, contact support@potionsandfamiliars.com.'
        );
        return;
      }

      // Chain denylist check. National chains are not claimable in v1 because
      // we don't yet have a verification flow. A defense-in-depth DB trigger
      // enforces the same rule server-side; this is the friendly-UX path.
      const matchedChain = matchBlockedChain(name);
      if (matchedChain) {
        // Fire-and-forget audit log so we can see how often this fires and
        // catch patterns (trademark squatters, confused local owners, etc.).
        // The RPC is SECURITY DEFINER and safe for anon + authenticated.
        // Errors here must never block the UX path — we log and move on.
        void supabase
          .rpc('log_chain_denylist_hit', {
            p_raw_name: name,
            p_matched_chain: matchedChain,
          })
          .then(({ error }) => {
            if (error) {
              console.warn('chain_denylist_hits log failed:', error.message);
            }
          });

        // Generic copy — do NOT echo the matched chain back to the user.
        // Echoing it tells an attacker which entry in the list their input
        // tripped, which makes probing the denylist easier. It also avoids
        // embarrassing collisions (e.g. "Target Practice Archery" sharing a
        // prefix with a national retailer).
        Alert.alert(
          'This business is not claimable',
          "This appears to be a national chain, which isn't claimable in Downtown Vibes. " +
            'This app is for independent local businesses.\n\n' +
            "If you're a franchisee or manager, email support@potionsandfamiliars.com " +
            "and we'll help you get listed under a disambiguated name."
        );
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

  // Tapping "Delete Account" routes through the owner gate, same as Delete
  // Business / Manage Subscription. The Alert.alert yes/no was not strong
  // enough — an employee with an unlocked phone could wipe the whole
  // account with one tap. The gate's modal surfaces the Apple-subscription
  // caveat as its subtitle copy, and requires password re-auth before the
  // delete_account RPC fires (see handleConfirmOwnerGate below).
  const handleDeleteAccount = useCallback(() => {
    if (!user || deletingAccount || ownerGateSaving) return;
    // Route to the shared owner gate modal.
    setOwnerGateAction({ kind: 'delete_account' });
    setOwnerGatePassword('');
  }, [user, deletingAccount, ownerGateSaving]);

  // Open the owner gate modal for a given action. Caller supplies the
  // discriminated action; the confirm handler below dispatches on `kind`
  // after a successful re-auth.
  const requestOwnerGate = useCallback((action: OwnerGateAction) => {
    setOwnerGateAction(action);
    setOwnerGatePassword('');
  }, []);

  const closeOwnerGate = useCallback(() => {
    if (ownerGateSaving) return;
    setOwnerGateAction(null);
    setOwnerGatePassword('');
  }, [ownerGateSaving]);

  const handleDeleteBusiness = useCallback(
    (businessId: string) => {
      if (!user || deletingBusinessId) return;

      // Step 1 — soft confirm. On "Continue" we open the owner gate modal.
      // Nothing is deleted until the owner re-enters their account password.
      Alert.alert(
        'Delete Business?',
        'This permanently deletes this business and its pin. You will be asked to re-enter your account password to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            style: 'destructive',
            onPress: () => {
              requestOwnerGate({ kind: 'delete_business', businessId });
            },
          },
        ]
      );
    },
    [user, deletingBusinessId, requestOwnerGate]
  );

  const handleRequestUpgrade = useCallback(
    (entitlement: 'single_pin' | 'dual_pin') => {
      Alert.alert(
        'Upgrade Subscription?',
        'Upgrading will charge the Apple ID or Google account signed into this device. You will be asked to re-enter your account password to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () =>
              requestOwnerGate({ kind: 'open_paywall', entitlement }),
          },
        ]
      );
    },
    [requestOwnerGate]
  );

  const handleRequestManageSubscription = useCallback(() => {
    if (isRunningInExpoGo) {
      Alert.alert(
        'Expo Go',
        'Subscription management is not available in Expo Go. Use a development build to test RevenueCat.'
      );
      return;
    }
    Alert.alert(
      'Manage Subscription?',
      'Changing or cancelling your subscription can affect billing and may disable pins that depend on your current tier. You will be asked to re-enter your account password to continue.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => requestOwnerGate({ kind: 'manage_subscription' }),
        },
      ]
    );
  }, [requestOwnerGate]);

  // Single confirm handler for every gated owner action. Verifies the
  // current user's auth password via supabase.auth.signInWithPassword
  // (which doubles as a re-auth check), then dispatches to the matching
  // side effect.
  const handleConfirmOwnerGate = useCallback(async () => {
    if (!user || !ownerGateAction || ownerGateSaving) return;

    const password = ownerGatePassword;
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
      setOwnerGateSaving(true);

      // Rate-limit check BEFORE hitting Supabase. If the user is inside a
      // lockout window, surface the remaining time and abort — don't burn a
      // network round-trip or expose that the cooldown is client-only.
      const lockoutMessage = await checkOwnerGateLock(user.id);
      if (lockoutMessage) {
        Alert.alert('Please Wait', lockoutMessage);
        return;
      }

      // Verify the password by attempting a sign-in with the current email.
      // This refreshes the session but does not log the user out on success.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authError) {
        const state = await recordOwnerGateFailure(user.id);
        // Diagnostic: surface counter state so we can confirm SecureStore
        // persistence is working in the Expo Go trial. Safe to ship — the
        // lockout bounds are documented in support copy anyway.
        console.log('[ownerGate] wrong password', {
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
          // Show how many attempts remain before lockout — both as UX and as
          // a diagnostic for the trial. Threshold is 3 → 30s lockout.
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

      // Re-auth succeeded — clear any accumulated lockout state before
      // dispatching to the pending action.
      await clearOwnerGateLock(user.id);
      const action = ownerGateAction;

      if (action.kind === 'delete_business') {
        setDeletingBusinessId(action.businessId);
        const { error: deleteError } = await supabase
          .from('businesses')
          .delete()
          .eq('id', action.businessId);

        if (deleteError) {
          Alert.alert('Error', deleteError.message);
          return;
        }
        await fetchBusinessData(user.id);
      } else if (action.kind === 'delete_account') {
        setDeletingAccount(true);
        const { error: deleteError } = await supabase.rpc('delete_account');
        if (deleteError) {
          Alert.alert('Error', deleteError.message);
          return;
        }
        // Tear down the gate before signOut unmounts this screen.
        setOwnerGateAction(null);
        setOwnerGatePassword('');
        await signOut();
        return;
      } else if (action.kind === 'open_paywall') {
        setPaywallEntitlement(action.entitlement);
        setShowPaywall(true);
      } else if (action.kind === 'manage_subscription') {
        try {
          const rcUI = await loadRevenueCatUI();
          await rcUI.default.presentCustomerCenter();
        } catch {
          Alert.alert('Error', 'Could not open subscription management.');
          return;
        }
      }

      // Success — tear down the gate.
      setOwnerGateAction(null);
      setOwnerGatePassword('');
    } catch (err: any) {
      console.warn('Owner gate action error:', err);
      Alert.alert(
        'Error',
        err?.message ?? 'Could not complete this action. Please try again.'
      );
    } finally {
      setDeletingBusinessId(null);
      setOwnerGateSaving(false);
    }
  }, [user, ownerGateAction, ownerGateSaving, ownerGatePassword]);

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

    // Flash sale is free-text UGC that appears on the public map, so mirror
    // the enforce_content_moderation_trg trigger client-side. Generic copy,
    // no word echo. See lib/profanityFilter.ts header for the sync invariant.
    const trimmedSale = flashSale.trim();
    if (trimmedSale && matchBlockedWord(trimmedSale) !== null) {
      Alert.alert(
        'Flash sale text not allowed',
        'Your flash sale text contains words that are not allowed. Please revise. ' +
          'If you believe this is an error, contact support@potionsandfamiliars.com.'
      );
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

    // Description is public, free-text UGC — mirror the server trigger.
    const trimmedDesc = editDescText.trim();
    if (trimmedDesc && matchBlockedWord(trimmedDesc) !== null) {
      Alert.alert(
        'Description not allowed',
        'Your description contains words that are not allowed. Please revise. ' +
          'If you believe this is an error, contact support@potionsandfamiliars.com.'
      );
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
    // Pin lock only blocks single-tier accounts. For dual-tier, the lock is
    // conceptually guarding the static brick-and-mortar pin, which this
    // function does not touch — only the mobile/secondary pin moves here.
    const isDual = biz.account_tier === 'dual';
    if (biz.is_pin_locked && !isDual) {
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
        // Compose a share message that reads well as an iMessage preview OR
        // as a pasted caption on Instagram / X / Facebook. Multi-line with a
        // lede, the deep link on its own line for easy tap/copy, and the
        // active flash sale appended when there is one.
        const saleText = (row.flash_sale ?? '').trim();
        const shareMessage =
          `🚚 ${row.business_name} just parked at a new spot!\n\n` +
          `📍 Tap to see our live location on DowntownVibes:\n${DEEP_LINK}` +
          (saleText ? `\n\n🔥 Flash sale right now: ${saleText}` : '');

        Alert.alert('Success', 'Your pin has been moved to your current location!', [
          { text: 'Done', style: 'cancel' },
          {
            text: 'Share Update',
            onPress: () => {
              Share.share({
                message: shareMessage,
                title: `${row.business_name} — new location`,
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

  const openStaticPinPicker = (businessId: string) => {
    const biz = ownedBusinesses.find((b) => b.id === businessId);
    if (!biz) return;
    // The lock is specifically here to protect the static / brick-and-mortar
    // pin. No dual-tier escape hatch on this one.
    if (biz.is_pin_locked) {
      Alert.alert(
        'Pin Locked',
        'Unlock this pin to change your brick-and-mortar location.'
      );
      return;
    }
    setStaticPinPickerTargetId(businessId);
  };

  const handleConfirmStaticPin = async (
    latitude: number,
    longitude: number
  ) => {
    if (!staticPinPickerTargetId) return;
    const businessId = staticPinPickerTargetId;
    setStaticPinSaving(true);
    try {
      const { data, error } = await supabase
        .from('businesses')
        .update({
          static_latitude: latitude,
          static_longitude: longitude,
        })
        .eq('id', businessId)
        .select()
        .single();

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      if (data) {
        const row = data as unknown as Business;
        setOwnedBusinesses((prev) =>
          prev.map((b) => (b.id === row.id ? row : b))
        );
      }
      setStaticPinPickerTargetId(null);
      Alert.alert(
        'Location Set',
        'Your brick-and-mortar pin has been updated.'
      );
    } finally {
      setStaticPinSaving(false);
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
                  {isDual ? (
                    <>
                      {/* ── 🏠 Brick-and-Mortar section ─────────────── */}
                      <View style={styles.pinSection}>
                        <Text style={styles.pinSectionTitle}>
                          🏠 Brick-and-Mortar Pin
                        </Text>
                        <Text style={styles.pinSectionHelp}>
                          Your main storefront pin. Lock it to keep it put, or
                          move it anytime.
                        </Text>

                        <TouchableOpacity
                          style={[
                            styles.bizCardSetStaticBtn,
                            (locBusy || biz.is_pin_locked) &&
                              styles.btnDisabled,
                          ]}
                          onPress={() => openStaticPinPicker(biz.id)}
                          disabled={!!locBusy}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.bizCardSetStaticBtnText}>
                            {biz.is_pin_locked
                              ? '🔒 Brick-and-Mortar Locked'
                              : '🏠 Set Location'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.bizCardLockPinBtn,
                            styles.bizCardActionBtnSpacing,
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
                              ? '🔓 Unlock Pin Location'
                              : '🔒 Lock Pin Location'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* ── 🚚 Traveling Pin section ────────────────── */}
                      <View
                        style={[
                          styles.pinSection,
                          styles.pinSectionSpacing,
                        ]}
                      >
                        <Text style={styles.pinSectionTitle}>
                          🚚 Traveling Pin
                        </Text>
                        <Text style={styles.pinSectionHelp}>
                          Live-tracking pin for food trucks and pop-ups.
                        </Text>

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
                              📍 Move to my location
                            </Text>
                          )}
                        </TouchableOpacity>

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
                            🧹 Remove from Map
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    // ── Single-tier: one simpler section ─────────────
                    <View style={styles.pinSection}>
                      <Text style={styles.pinSectionTitle}>
                        📍 Pin Location
                      </Text>
                      <Text style={styles.pinSectionHelp}>
                        Your business pin on the map.
                      </Text>

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
                              📍 Move to my location
                            </Text>
                          )}
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        style={[
                          styles.bizCardLockPinBtn,
                          !biz.is_pin_locked &&
                            styles.bizCardActionBtnSpacing,
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
                            ? '🔓 Unlock Pin Location'
                            : '🔒 Lock Pin Location'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Divider separating pin actions from destructive action */}
                  <View style={styles.bizCardDivider} />

                  <TouchableOpacity
                    style={[
                      styles.bizCardDeleteBtn,
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
                onPress={() => handleRequestUpgrade('dual_pin')}
                activeOpacity={0.85}
              >
                <Text style={styles.upgradeBtnText}>
                  Upgrade to Dual-Pin (Pro)
                </Text>
              </TouchableOpacity>
              <Text style={styles.upgradeHelpText}>
                Perfect for Food Trucks and Pop-ups. Get a second pin so you
                can anchor one at your storefront AND run a live pin that
                moves with you. Lock one, move the other — or move both.
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
              {(['restaurant', 'bar', 'retail', 'coffee'] as const).map((t) => {
                const active = businessType === t;
                const label =
                  t === 'restaurant'
                    ? 'Restaurant'
                    : t === 'bar'
                      ? 'Bar'
                      : t === 'retail'
                        ? 'Retail'
                        : 'Coffee';
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
            onPress={handleRequestManageSubscription}
          >
            <Text style={styles.manageSubBtnText}>Manage Subscription</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ownerProfileBtn}
            onPress={() => setShowOwnerProfile(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.ownerProfileBtnText}>My Vibe Checks & Favorites</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ownerTutorialBtn}
            onPress={() => setShowOwnerTutorial(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.ownerTutorialBtnText}>View App Tutorial</Text>
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
                    ? 'Choose a password. While locked, this pin stays put until you unlock it. (Dual-tier traveling pins are not affected.)'
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

          {/* Owner action gate — single re-auth modal used by Delete Business,
              Upgrade Subscription, and Manage Subscription. Title / subtitle /
              CTA copy switches based on `ownerGateAction.kind`. */}
          <Modal
            visible={!!ownerGateAction}
            transparent
            animationType="fade"
            onRequestClose={closeOwnerGate}
          >
            <View style={styles.pinLockBackdrop}>
              <View style={styles.pinLockCard}>
                {(() => {
                  const action = ownerGateAction;
                  if (!action) return null;

                  let title = 'Confirm Action';
                  let subtitle = 'Enter your account password to continue.';
                  let ctaLabel = 'Confirm';
                  let ctaStyle = styles.pinLockPrimaryBtn;
                  let ctaTextStyle = styles.pinLockPrimaryText;

                  if (action.kind === 'delete_business') {
                    const bizName =
                      ownedBusinesses.find((b) => b.id === action.businessId)
                        ?.business_name ?? '';
                    title = `Delete Business${bizName ? ` — ${bizName}` : ''}`;
                    subtitle =
                      'Enter your account password to permanently delete this business and its pin. This cannot be undone.';
                    ctaLabel = 'Delete Business';
                    ctaStyle = styles.deleteBizConfirmBtn;
                    ctaTextStyle = styles.deleteBizConfirmText;
                  } else if (action.kind === 'delete_account') {
                    title = 'Delete Account';
                    subtitle =
                      "Enter your account password to permanently delete your account, all your businesses, and all your vibe checks. This will NOT cancel your active App Store or Play Store subscription — you must do that in your device's subscription settings. This cannot be undone.";
                    ctaLabel = 'Delete Account';
                    ctaStyle = styles.deleteBizConfirmBtn;
                    ctaTextStyle = styles.deleteBizConfirmText;
                  } else if (action.kind === 'open_paywall') {
                    title =
                      action.entitlement === 'dual_pin'
                        ? 'Upgrade to Dual-Pin (Pro)'
                        : 'Upgrade Subscription';
                    subtitle =
                      'Enter your account password to open the paywall. This protects against unauthorized purchases on the device.';
                    ctaLabel = 'Continue to Paywall';
                  } else if (action.kind === 'manage_subscription') {
                    title = 'Manage Subscription';
                    subtitle =
                      'Enter your account password to open subscription management. Cancelling or downgrading can disable pins that depend on your current tier.';
                    ctaLabel = 'Continue';
                  }

                  return (
                    <>
                      <Text style={styles.pinLockTitle}>{title}</Text>
                      <Text style={styles.pinLockSubtext}>{subtitle}</Text>
                      <TextInput
                        style={styles.input}
                        value={ownerGatePassword}
                        onChangeText={setOwnerGatePassword}
                        placeholder="Account password"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <View style={styles.pinLockBtnRow}>
                        <TouchableOpacity
                          style={[
                            ctaStyle,
                            ownerGateSaving && styles.btnDisabled,
                          ]}
                          onPress={handleConfirmOwnerGate}
                          disabled={ownerGateSaving}
                        >
                          {ownerGateSaving ? (
                            <ActivityIndicator color="#FFF" size="small" />
                          ) : (
                            <Text style={ctaTextStyle}>{ctaLabel}</Text>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.pinLockCancelBtn}
                          onPress={closeOwnerGate}
                          disabled={ownerGateSaving}
                        >
                          <Text style={styles.pinLockCancelText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>
          </Modal>

          {/* Owner: Vibe Checks & Favorites modal */}
          <Modal
            visible={showOwnerProfile}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setShowOwnerProfile(false)}
          >
            <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
              <View style={styles.ownerModalHeader}>
                <Text style={styles.ownerModalTitle}>My Vibe Checks & Favorites</Text>
                <TouchableOpacity
                  onPress={() => setShowOwnerProfile(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.ownerModalClose}>Close</Text>
                </TouchableOpacity>
              </View>
              <ProfileScreen embedded />
            </View>
          </Modal>

          <OnboardingTutorial
            visible={showOwnerTutorial}
            onFinish={() => setShowOwnerTutorial(false)}
          />

          <StaticPinPickerModal
            visible={!!staticPinPickerTargetId}
            businessName={
              ownedBusinesses.find((b) => b.id === staticPinPickerTargetId)
                ?.business_name ?? ''
            }
            initialLatitude={
              ownedBusinesses.find((b) => b.id === staticPinPickerTargetId)
                ?.static_latitude ??
              ownedBusinesses.find((b) => b.id === staticPinPickerTargetId)
                ?.latitude ??
              null
            }
            initialLongitude={
              ownedBusinesses.find((b) => b.id === staticPinPickerTargetId)
                ?.static_longitude ??
              ownedBusinesses.find((b) => b.id === staticPinPickerTargetId)
                ?.longitude ??
              null
            }
            onCancel={() => {
              if (!staticPinSaving) setStaticPinPickerTargetId(null);
            }}
            onConfirm={handleConfirmStaticPin}
          />
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
              {(['restaurant', 'bar', 'retail', 'coffee'] as const).map((t) => {
                const active = businessType === t;
                const label =
                  t === 'restaurant'
                    ? 'Restaurant'
                    : t === 'bar'
                      ? 'Bar'
                      : t === 'retail'
                        ? 'Retail'
                        : 'Coffee';
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
              Single Pin: one pin — move it or lock it. Dual Pin: two pins — perfect if you have a fixed location AND a mobile presence. Either tier, every pin can move and every pin can lock.
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
            style={styles.ownerProfileBtn}
            onPress={() => setShowOwnerProfile(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.ownerProfileBtnText}>My Vibe Checks & Favorites</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ownerTutorialBtn}
            onPress={() => setShowOwnerTutorial(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.ownerTutorialBtnText}>View App Tutorial</Text>
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

          {/* Owner: Vibe Checks & Favorites modal */}
          <Modal
            visible={showOwnerProfile}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setShowOwnerProfile(false)}
          >
            <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
              <View style={styles.ownerModalHeader}>
                <Text style={styles.ownerModalTitle}>My Vibe Checks & Favorites</Text>
                <TouchableOpacity
                  onPress={() => setShowOwnerProfile(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.ownerModalClose}>Close</Text>
                </TouchableOpacity>
              </View>
              <ProfileScreen embedded />
            </View>
          </Modal>

          <OnboardingTutorial
            visible={showOwnerTutorial}
            onFinish={() => setShowOwnerTutorial(false)}
          />
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
  //
  // Two orthogonal pieces of state drive this screen:
  //   - `authRole`  — customer | owner (picked on the previous screen).
  //                   Shown as a tappable chip at the top so the user can
  //                   see and change their role without hunting for a Back
  //                   button. Tap chip → returns to role picker.
  //   - `mode`      — signIn | signUp. Tabs at the top of the form card.
  //                   Controls: tagline copy, primary CTA label, primary CTA
  //                   handler, Apple button type, visibility of forgot-
  //                   password link vs. confirm-password field, and the ToS
  //                   agreement line. ONE form, clearly labeled — this
  //                   replaces the old "secondary button that silently
  //                   submits as signup" pattern that confused first-time
  //                   users.
  //
  // Copy is role-aware AND mode-aware. A Business Owner on Create Account
  // gets different tagline flavor than a Customer on Sign In.
  const isSignUp = mode === 'signUp';
  const roleIsOwner = authRole === 'owner';
  const tagline = isSignUp
    ? roleIsOwner
      ? "Let's claim your business"
      : "Let's get you exploring"
    : roleIsOwner
      ? 'Welcome back — manage your business'
      : 'Welcome back — pick up where you left off';
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
          style={styles.roleChip}
          activeOpacity={0.7}
          onPress={() => {
            // Going back to role picker — reset mode so the next entry is
            // a clean sign-in by default, and clear confirm password.
            setMode('signIn');
            setPasswordConfirm('');
            setAuthRole(null);
          }}
          accessibilityLabel={`Currently signing in as ${
            roleIsOwner ? 'Business Owner' : 'Customer'
          }. Tap to change role.`}
          accessibilityRole="button"
        >
          <Text style={styles.roleChipText}>
            {roleIsOwner ? '🏪 Business Owner' : '🔥 Customer'}
            <Text style={styles.roleChipAction}>  •  change</Text>
          </Text>
        </TouchableOpacity>

        <Text style={styles.logo}>DowntownVibes</Text>
        <Text style={styles.tagline}>{tagline}</Text>

        <View style={styles.formCard}>
          {/* ── Mode tabs ─────────────────────────────────────────
              Segmented control. Tapping a tab flips `mode` and clears
              `passwordConfirm` so stale data from the other mode doesn't
              leak. Email + password values persist across mode switches so
              a user who mistyped their intent doesn't have to retype. */}
          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[
                styles.modeTab,
                !isSignUp && styles.modeTabActive,
              ]}
              onPress={() => {
                setMode('signIn');
                setPasswordConfirm('');
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: !isSignUp }}
              accessibilityLabel="Sign In tab"
            >
              <Text
                style={[
                  styles.modeTabText,
                  !isSignUp && styles.modeTabTextActive,
                ]}
              >
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeTab,
                isSignUp && styles.modeTabActive,
              ]}
              onPress={() => setMode('signUp')}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSignUp }}
              accessibilityLabel="Create Account tab"
            >
              <Text
                style={[
                  styles.modeTabText,
                  isSignUp && styles.modeTabTextActive,
                ]}
              >
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { marginTop: 18 }]}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#6B7280"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            accessibilityLabel="Email address"
          />

          <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#6B7280"
            secureTextEntry
            // On signup, tell iOS Keychain this is a NEW password so it can
            // offer Strong Password suggestion. On signin, it's an existing
            // password — autofill should offer saved credentials instead.
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            textContentType={isSignUp ? 'newPassword' : 'password'}
            accessibilityLabel={isSignUp ? 'Create a password' : 'Password'}
          />

          {/* Sign-in: right-aligned forgot-password link.
              Sign-up: confirm-password input.
              Mutually exclusive to keep the form tight. */}
          {!isSignUp && (
            <TouchableOpacity
              style={styles.forgotRow}
              onPress={handleForgotPassword}
              disabled={authLoading}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {isSignUp && (
            <>
              <Text style={[styles.label, { marginTop: 14 }]}>
                Confirm password
              </Text>
              <TextInput
                style={styles.input}
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                placeholder="••••••••"
                placeholderTextColor="#6B7280"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel="Confirm password"
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, authLoading && styles.btnDisabled]}
            onPress={isSignUp ? handleSignUp : handleSignIn}
            disabled={authLoading}
            accessibilityRole="button"
            accessibilityLabel={isSignUp ? 'Create Account' : 'Sign In'}
          >
            {authLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          {/*
            Sign in with Apple — iOS only. Apple Guideline 4.8 requires an
            Apple SSO option to be offered at least as prominently as any
            third-party login (Google, Facebook, etc.), so this button sits
            directly under the primary email/password sign-in with equal
            visual weight. The AppleAuthenticationButton component uses the
            Apple-branded asset and satisfies HIG requirements automatically;
            do NOT replace it with a custom Text/Image button. We swap
            `buttonType` based on mode so the label matches intent
            ("Sign in with Apple" vs "Sign up with Apple").
          */}
          {Platform.OS === 'ios' && (
            <>
              <View style={styles.ssoDivider}>
                <View style={styles.ssoDividerLine} />
                <Text style={styles.ssoDividerText}>or</Text>
                <View style={styles.ssoDividerLine} />
              </View>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  isSignUp
                    ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                    : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                buttonStyle={
                  AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={12}
                style={styles.appleBtn}
                onPress={handleAppleSignIn}
              />
            </>
          )}

          {/* Privacy Policy line — only in signup mode. App Store review
              requires a visible Privacy Policy link on any screen that
              creates an account. We only have one document right now
              (published on the Potions & Familiars Wix site), so the line
              reads as a single-link agreement. When a real Terms of
              Service document ships at its own URL, add a second link here
              and reword to "agree to our Terms of Service and Privacy
              Policy." The URL below is what's registered in App Store
              Connect's App Privacy → Privacy Policy URL field, so keeping
              these two in sync avoids a "your app's policy link doesn't
              match App Store Connect" review flag. */}
          {isSignUp && (
            <Text style={styles.tosText}>
              By creating an account you agree to our{' '}
              <Text
                style={styles.tosLink}
                accessibilityRole="link"
                onPress={() =>
                  openUrlOrAlert(
                    'https://www.potionsandfamiliars.com/downtown-vibes-terms'
                  )
                }
              >
                Privacy Policy
              </Text>
              .
            </Text>
          )}
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
  /* SSO (Apple / Google / Facebook) */
  ssoDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 12,
  },
  ssoDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  ssoDividerText: {
    marginHorizontal: 10,
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  appleBtn: {
    width: '100%',
    height: 48,
  },

  /* Role chip — sits above the logo on the auth form. Shows which role the
     user picked on the previous screen (Business Owner / Customer) and is
     tappable to return to the role picker. Replaces the old "← Back"
     button, which was correct functionally but invisible as a role cue. */
  roleChip: {
    alignSelf: 'center',
    backgroundColor: '#EDE9FE',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  roleChipText: {
    color: '#1F2937',
    fontWeight: '700',
    fontSize: 13,
  },
  roleChipAction: {
    color: '#6C3AED',
    fontWeight: '700',
  },

  /* Mode tabs — Sign In / Create Account segmented control at the top of
     the auth form card. Active tab gets the brand purple + filled look;
     inactive tab is neutral grey text. Taps flip `mode` state. */
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  modeTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  modeTabTextActive: {
    color: '#6C3AED',
  },

  /* Forgot-password link — sits under the Password input in sign-in mode.
     Right-aligned, small purple, tappable. */
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  forgotText: {
    color: '#6C3AED',
    fontSize: 13,
    fontWeight: '700',
  },

  /* ToS / Privacy agreement copy — only shown in sign-up mode. Small
     centered text with tappable links for Terms + Privacy. */
  tosText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  tosLink: {
    color: '#6C3AED',
    fontWeight: '700',
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
  // Framed grouping around a set of pin-related buttons. Two sections on dual
  // (brick-and-mortar + traveling), one section on single-tier.
  pinSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },
  pinSectionSpacing: {
    marginTop: 14,
  },
  pinSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    letterSpacing: 0.2,
  },
  pinSectionHelp: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 12,
    lineHeight: 16,
  },
  // Horizontal divider separating pin actions from the destructive Delete CTA
  bizCardDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
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
  bizCardSetStaticBtn: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#6C3AED',
  },
  bizCardSetStaticBtnText: {
    color: '#6C3AED',
    fontWeight: '700',
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
  // Destructive primary button reused in the Delete Business password modal.
  // Visually distinct from pinLockPrimaryBtn (purple) so a fat-finger tap can't
  // be confused with a benign confirm.
  deleteBizConfirmBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteBizConfirmText: {
    color: '#FFFFFF',
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

  ownerProfileBtn: {
    backgroundColor: '#6C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
  },
  ownerProfileBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  ownerTutorialBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  ownerTutorialBtnText: {
    color: '#6C3AED',
    fontWeight: '700',
    fontSize: 15,
  },
  ownerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  ownerModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
  },
  ownerModalClose: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6C3AED',
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
