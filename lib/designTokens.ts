// Pony Express Neon — design tokens.
//
// Visual aesthetic for the Events Board surface (1.6.0+). Western frontier
// dispatched from a cybernetic relay station. Dusk skies, parchment placards,
// neon cyan/purple accents. Tokens are pulled directly from the canonical
// mockup at wiki/pony-express-neon-mockup.png and the design philosophy at
// wiki/pony-express-neon-philosophy.md.
//
// Scope: currently consumed only by the Events tab + PostCard. Map and
// Account stay on the existing light theme. Do NOT propagate these tokens
// to other surfaces without an explicit design pass.

export const colors = {
  // Surfaces
  surfaceDeep:    '#1F1419',  // page background — dusk sky
  surfaceBase:    '#2A1B1F',  // card base
  surfaceElevated:'#3A2530',  // raised surfaces, modals
  surfacePaper:   '#F5E6C8',  // parchment — for placards / wanted-poster moments
  surfaceLeather: '#8B5A2B',  // saddle leather accent
  surfaceLeatherHi:'#AE7740', // brighter leather for highlights

  // Sunset (warm)
  sunsetCoral:    '#E85D4E',
  sunsetOrange:   '#F97316',
  duskHorizon:    '#B55B4B',
  dustTan:        '#C8956D',

  // Neon (cool)
  neonCyan:       '#22D3EE',
  neonPurple:     '#6C3AED',
  neonPurpleHi:   '#8C60FF',  // brightened for glow renders
  neonMagenta:    '#EC4899',

  // Text
  textPrimary:    '#FAF3E8',  // bone — primary on dark
  textSecondary:  '#C8956D',  // dust-tan — secondary on dark
  textOnPaper:    '#1F1419',  // dusk — on cream parchment
  textMuted:      '#A0867A',  // dim warm gray
  textSteel:      '#4C5563',  // disabled / very dim

  // State
  stateSuccess:   '#22D3EE',
  stateDanger:    '#E85D4E',
  stateWarning:   '#F97316',
} as const;

// Typography — fontFamily strings reference fonts loaded in app/_layout.tsx
// via expo-font. If a name isn't in the useFonts() map, RN falls back to
// the platform default, so loading order matters.
export const fonts = {
  display:     'BigShoulders',     // EVENTS BOARD header, type badges
  displayAlt:  'BigShoulders',     // (room to swap to StardosStencil later for stamps)
  monoBold:    'JetBrainsMono-Bold',
  mono:        'JetBrainsMono-Regular',
  monoLegacy:  'SpaceMono',        // existing — kept for any legacy uses
  pixel:       'Silkscreen',       // pixel-display micro labels (timestamps, tab labels)
  body:        undefined,          // RN default (San Francisco / Roboto) — readability
} as const;

export const fontSizes = {
  display:    44,    // hero title (EVENTS BOARD)
  h1:         24,
  h2:         20,
  body:       15,
  bodySm:     13,
  caption:    12,
  micro:      10,
} as const;

export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
} as const;

export const radius = {
  card:   14,    // standard cards
  pill:   999,   // chips / badges (pill material)
  paper:  4,     // parchment / placards (sharper — paper material)
  stamp:  2,     // very sharp — telegraph plates / cyber stamps
} as const;

// Glow shadows — RN doesn't directly support box-shadow blur the way CSS
// does, but iOS shadow* + Android elevation come close. For richer glow,
// stack a translucent View under the element (see <NeonGlow> helper if
// extracted later). These tokens describe the *intent*; consumers wire up
// the platform-correct implementation.
export const glow = {
  cyan: {
    shadowColor: colors.neonCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  purple: {
    shadowColor: colors.neonPurpleHi,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  magenta: {
    shadowColor: colors.neonMagenta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
} as const;

// Per-post-type style hints (consumed by PostCard.tsx).
export const postTypeMeta = {
  event:        { emoji: '📅', label: 'EVENT',        bg: colors.surfacePaper, accent: '#92400E' },
  announcement: { emoji: '📢', label: 'ANNOUNCEMENT', bg: '#3A1F26',           accent: colors.neonMagenta },
  employee:    { emoji: '👋', label: 'MEET THE TEAM', bg: '#1F2A40',           accent: colors.neonCyan },
  vibe:        { emoji: '✨', label: 'VIBE',          bg: '#2A1F35',           accent: colors.neonPurpleHi },
  update:      { emoji: '📣', label: 'UPDATE',        bg: '#2A1B1F',           accent: colors.dustTan },
} as const;

// St. Joseph downtown anchor coords — reused for the GPS coordinate stamp
// in the Events Board header and the location-denied fallback in events.tsx.
export const ST_JOSEPH_COORDS = {
  latitude: 39.7674,
  longitude: -94.8467,
  displayLat: '39.77°N',
  displayLon: '94.85°W',
} as const;
