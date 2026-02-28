import React, { useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Business } from '@/lib/types';

interface OwnerDashboardProps {
  business: Business;
  onUpdate: (b: Business) => void;
}

export function OwnerDashboard({ business, onUpdate }: OwnerDashboardProps) {
  const [flashSale, setFlashSale] = useState(business.flash_sale ?? '');
  const [menuLink, setMenuLink] = useState(business.menu_link ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from('businesses')
      .update({
        flash_sale: flashSale.trim() || null,
        menu_link: menuLink.trim() || null,
      })
      .eq('id', business.id)
      .select()
      .single();

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else if (data) {
      onUpdate(data);
      Alert.alert('Saved', 'Your business has been updated.');
    }
  };

  const handleClearSale = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from('businesses')
      .update({ flash_sale: null })
      .eq('id', business.id)
      .select()
      .single();

    setSaving(false);
    if (!error && data) {
      setFlashSale('');
      onUpdate(data);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Owner Dashboard</Text>
      <Text style={styles.bizName}>{business.business_name}</Text>
      <Text style={styles.bizType}>{business.business_type}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Flash Sale Message</Text>
        <TextInput
          style={styles.input}
          value={flashSale}
          onChangeText={setFlashSale}
          placeholder="e.g. 20% off all drinks until 8pm!"
          placeholderTextColor="#9CA3AF"
          multiline
        />
        {business.flash_sale ? (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearSale}>
            <Text style={styles.clearText}>Clear Active Sale</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Menu Link</Text>
        <TextInput
          style={styles.input}
          value={menuLink}
          onChangeText={setMenuLink}
          placeholder="https://your-menu.com"
          placeholderTextColor="#9CA3AF"
          keyboardType="url"
          autoCapitalize="none"
        />
        {business.menu_link ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(business.menu_link!)}
          >
            <Text style={styles.linkPreview}>Open current link ↗</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.saveText}>Save Changes</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
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
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  clearBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  clearText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 13,
  },
  linkPreview: {
    color: '#6C3AED',
    fontWeight: '600',
    fontSize: 13,
    marginTop: 8,
  },
  saveBtn: {
    backgroundColor: '#6C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
