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
import { OwnerDashboard } from '@/components/OwnerDashboard';

export default function LoginScreen() {
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [ownedBusiness, setOwnedBusiness] = useState<Business | null>(null);
  const [bizLoading, setBizLoading] = useState(false);

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
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('Owner fetch error:', error.message);
        setOwnedBusiness(data);
      })
      .catch((err) => {
        console.warn('Owner fetch exception:', err);
      })
      .finally(() => {
        setBizLoading(false);
      });
  }, [user]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C3AED" />
      </View>
    );
  }

  // Logged-in owner
  if (user && ownedBusiness) {
    return (
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
      >
        <OwnerDashboard
          business={ownedBusiness}
          onUpdate={setOwnedBusiness}
        />
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Logged-in non-owner
  if (user) {
    return (
      <View style={styles.center}>
        {bizLoading ? (
          <ActivityIndicator size="large" color="#6C3AED" />
        ) : (
          <>
            <Text style={styles.emoji}>👋</Text>
            <Text style={styles.greeting}>
              Logged in as {user.email}
            </Text>
            <Text style={styles.subtext}>
              You don't own a business yet. Contact us to claim yours!
            </Text>
            <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  // Guest auth form
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
    backgroundColor: '#F9FAFB',
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
