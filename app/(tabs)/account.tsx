import React from 'react';
import { useAuth } from '@/context/AuthContext';
import LoginScreen from './login';
import ProfileScreen from './profile';

/**
 * Single "Account" tab: shows Login/Signup when unauthenticated,
 * Business dashboard (login screen) when owner, Customer profile when customer.
 */
export default function AccountScreen() {
  const { user, role } = useAuth();

  if (user && role === 'customer') {
    return <ProfileScreen />;
  }

  return <LoginScreen />;
}
