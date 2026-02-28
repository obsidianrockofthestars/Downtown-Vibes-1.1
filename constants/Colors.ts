export const PIN_COLORS: Record<string, string> = {
  restaurant: '#22C55E',
  bar: '#3B82F6',
  store: '#EF4444',
  retail: '#EF4444',
};

export const BUSINESS_TYPES = ['restaurant', 'bar', 'store', 'retail'];

const tintColorLight = '#6C3AED';
const tintColorDark = '#A78BFA';

export default {
  light: {
    text: '#1F2937',
    background: '#F9FAFB',
    tint: tintColorLight,
    tabIconDefault: '#9CA3AF',
    tabIconSelected: tintColorLight,
    card: '#FFFFFF',
    border: '#E5E7EB',
    subtle: '#6B7280',
  },
  dark: {
    text: '#F9FAFB',
    background: '#111827',
    tint: tintColorDark,
    tabIconDefault: '#6B7280',
    tabIconSelected: tintColorDark,
    card: '#1F2937',
    border: '#374151',
    subtle: '#9CA3AF',
  },
};
