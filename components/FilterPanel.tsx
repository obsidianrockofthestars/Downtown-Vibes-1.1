import React from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
// @ts-ignore
import Ionicons from '@expo/vector-icons/Ionicons';
import { SearchBar } from '@/components/SearchBar';
import { Business } from '@/lib/types';

export type ClosestRow = { business: Business; dist: number };

export type FilterPanelProps = {
  filtersVisible: boolean;
  closeFilters: () => void;
  filtersAnim: Animated.Value;
  insets: EdgeInsets;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeSort: 'default' | 'closest';
  setActiveSort: (sort: 'default' | 'closest') => void;
  userLocation: { latitude: number; longitude: number } | null;
  closestTop5WithDistance: ClosestRow[];
  formatMiles: (miles: number) => string;
  setSelectedBusiness: (business: Business) => void;
  saleFilterIds: string[] | null;
  setSaleFilterIds: React.Dispatch<React.SetStateAction<string[] | null>>;
  activeFilters: string[];
  toggleFilter: (category: string) => void;
  CATEGORIES: readonly string[];
  CHIP_COLORS: Record<string, { bg: string; text: string }>;
};

export function FilterPanel({
  filtersVisible,
  closeFilters,
  filtersAnim,
  insets,
  searchQuery,
  setSearchQuery,
  activeSort,
  setActiveSort,
  userLocation,
  closestTop5WithDistance,
  formatMiles,
  setSelectedBusiness,
  saleFilterIds,
  setSaleFilterIds,
  activeFilters,
  toggleFilter,
  CATEGORIES,
  CHIP_COLORS,
}: FilterPanelProps) {
  return (
    <Modal
      visible={filtersVisible}
      animationType="none"
      transparent
      onRequestClose={closeFilters}
    >
      <Pressable style={styles.modalBackdrop} onPress={closeFilters} />

      <Animated.View
        style={[
          styles.sidePanel,
          {
            paddingTop: insets.top + 18,
            paddingBottom: Math.max(insets.bottom, 40),
            transform: [
              {
                translateX: filtersAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [420, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Image
          source={require('@/assets/images/watermark.png')}
          style={{
            position: 'absolute',
            bottom: 0,
            right: -40,
            width: 250,
            height: 250,
            opacity: 0.05,
            resizeMode: 'contain',
            zIndex: 0,
          }}
          pointerEvents="none"
        />
        <View style={styles.sidePanelHeader}>
          <Text style={styles.modalTitle}>Filters</Text>
          <TouchableOpacity
            onPress={closeFilters}
            activeOpacity={0.8}
            style={styles.iconCloseButton}
            accessibilityRole="button"
            accessibilityLabel="Close filters"
          >
            <Ionicons name="close" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        <Text style={styles.modalSectionLabel}>Sort By</Text>
        <View style={styles.sortBtnRow}>
          <TouchableOpacity
            onPress={() => setActiveSort('default')}
            activeOpacity={0.8}
            style={[styles.sortBtn, activeSort === 'default' && styles.sortBtnActive]}
            accessibilityRole="button"
            accessibilityLabel="Sort default"
          >
            <Text
              style={[
                styles.sortBtnText,
                activeSort === 'default' && styles.sortBtnTextActive,
              ]}
            >
              Default
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveSort('closest')}
            activeOpacity={0.8}
            disabled={!userLocation}
            style={[
              styles.sortBtn,
              activeSort === 'closest' && styles.sortBtnActive,
              !userLocation && styles.sortBtnDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sort closest"
          >
            <Text
              style={[
                styles.sortBtnText,
                activeSort === 'closest' && styles.sortBtnTextActive,
              ]}
            >
              Closest
            </Text>
          </TouchableOpacity>
        </View>

        {activeSort === 'closest' && userLocation && (
          <View style={styles.closestList}>
            {closestTop5WithDistance.length === 0 ? (
              <Text style={styles.closestEmptyText}>No nearby pins found.</Text>
            ) : (
              <ScrollView
                style={{ maxHeight: 180 }}
                showsVerticalScrollIndicator={false}
              >
                {closestTop5WithDistance.map(({ business, dist }, idx) => (
                  <View
                    key={business.id}
                    style={[
                      styles.closestRow,
                      idx === closestTop5WithDistance.length - 1 &&
                        styles.closestRowLast,
                    ]}
                  >
                    <View style={styles.closestRowText}>
                      <Text style={styles.closestName} numberOfLines={1}>
                        {business.business_name}
                      </Text>
                      <Text style={styles.closestDistance}>
                        {formatMiles(dist)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.closestViewBtn}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedBusiness(business);
                        closeFilters();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${business.business_name}`}
                    >
                      <Text style={styles.closestViewBtnText}>View</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        <Text style={styles.modalSectionLabel}>Categories</Text>

        {saleFilterIds && (
          <TouchableOpacity
            onPress={() => setSaleFilterIds(null)}
            activeOpacity={0.8}
            style={styles.clearSaleFilterBtn}
            accessibilityRole="button"
            accessibilityLabel="Clear sale filter"
          >
            <Text style={styles.clearSaleFilterText}>
              {'\u2715'} Clear Sale Filter
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.categoryGrid}>
          <Image
            source={require('@/assets/images/watermark.png')}
            style={[
              StyleSheet.absoluteFillObject,
              { opacity: 0.2, resizeMode: 'cover' },
            ]}
            {...({ pointerEvents: 'none' } as any)}
          />
          {CATEGORIES.map((cat) => {
            const active = activeFilters.includes(cat);
            const colors = CHIP_COLORS[cat];
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => toggleFilter(cat)}
                activeOpacity={0.8}
                style={[
                  styles.categoryBox,
                  active && { backgroundColor: colors.bg, borderColor: colors.bg },
                  !active && styles.categoryBoxInactive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${cat}`}
              >
                <Text
                  style={[
                    styles.categoryBoxText,
                    active && { color: colors.text },
                    !active && styles.categoryBoxTextInactive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sortBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
  },
  sortBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortBtnActive: {
    backgroundColor: '#6C3AED',
    borderColor: '#6C3AED',
  },
  sortBtnDisabled: {
    opacity: 0.6,
  },
  sortBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  sortBtnTextActive: {
    color: '#FFFFFF',
  },
  closestList: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14,
  },
  closestEmptyText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 13,
  },
  closestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closestRowLast: {
    borderBottomWidth: 0,
  },
  closestRowText: {
    flex: 1,
    paddingRight: 12,
  },
  closestName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  closestDistance: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 2,
  },
  closestViewBtn: {
    backgroundColor: '#6C3AED',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closestViewBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  clearSaleFilterBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  clearSaleFilterText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  categoryGrid: {
    backgroundColor: 'white',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 34,
    overflow: 'hidden',
  },
  categoryBox: {
    width: '48%',
    height: 50,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  categoryBoxInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
  },
  categoryBoxText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  categoryBoxTextInactive: {
    color: '#6B7280',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sidePanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '60%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    paddingHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: -6, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 22,
  },
  sidePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  iconCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSectionLabel: {
    marginTop: 12,
    marginBottom: 8,
    color: '#374151',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
