import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Business } from '@/lib/types';

export default function LoginScreen() {
  const { user, loading, signIn, signUp, signOut } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [ownedBusiness, setOwnedBusiness] = useState<Business | null>(null);
  const [bizLoading, setBizLoading] = useState(false);

  const [flashSale, setFlashSale] = useState('');
  const [emojiIcon, setEmojiIcon] = useState('');
  const [menuLink, setMenuLink] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setOwnedBusiness(null);
      return;
    }

    setBizLoading(true);
    supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('Owner fetch error:', error.message);
        if (data) {
          setOwnedBusiness(data);
          setFlashSale(data.flash_sale ?? '');
          setEmojiIcon(data.emoji_icon ?? '');
          setMenuLink(data.menu_link ?? '');
          setWebsite(data.website ?? '');
        } else {
          setOwnedBusiness(null);
        }
      })
      .catch((err) => console.warn('Owner fetch exception:', err))
      .finally(() => setBizLoading(false));
  }, [user]);

  // ─── Auth handlers ───────────────────────────────────────────
  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Enter your email and password.');
      return;
    }
    setAuthLoading(true);
    const { error } = await signIn(email, password);
    setAuthLoading(false);
    if (error) Alert.alert('Sign In Failed', error.message);
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
    const { error } = await signUp(email, password);
    setAuthLoading(false);
    if (error) {
      Alert.alert('Sign Up Failed', error.message);
    } else {
      Alert.alert('Check Your Email', 'We sent you a confirmation link.');
    }
  };

  // ─── Dashboard save handler ──────────────────────────────────
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
      Alert.alert('Saved', 'Your business has been updated.');
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

  // ─── Logged-in: Owner Dashboard ──────────────────────────────
  if (user && ownedBusiness) {
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

          <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ─── Logged-in: Non-owner ────────────────────────────────────
  if (user) {
    return (
      <View style={styles.center}>
        {bizLoading ? (
          <ActivityIndicator size="large" color="#6C3AED" />
        ) : (
          <>
            <Text style={styles.emoji}>👋</Text>
            <Text style={styles.greeting}>Logged in as {user.email}</Text>
            <Text style={styles.subtext}>
              Please contact administration to claim your business pin.
            </Text>
            <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  // ─── Guest: Auth form ────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.authContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.logo}>Vibeathon</Text>
        <Text style={styles.tagline}>
          Log in to claim & manage your business
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

  /* Non-owner */
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  greeting: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 6,
  },
  subtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
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
});
