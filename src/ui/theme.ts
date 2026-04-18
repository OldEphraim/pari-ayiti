export const colors = {
  primary: '#00209F',
  accent: '#D21034',
  bg: '#FAFAF7',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#666666',
  border: '#E5E5E5',
  pendingSync: '#F59E0B',
  pendingSettlement: '#3B82F6',
  won: '#0F766E',
  lost: '#6B7280',
  void: '#9CA3AF',
  offline: '#78716C',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 4, md: 8, lg: 12, pill: 999 };

export const type = {
  h1: { fontSize: 24, fontWeight: '700' as const },
  h2: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  small: { fontSize: 14, fontWeight: '400' as const },
  mono: { fontSize: 14, fontFamily: 'monospace' as const },
};

export const motion = { maxMs: 250 };

export type PillColorKey =
  | 'pendingSync'
  | 'pendingSettlement'
  | 'won'
  | 'lost'
  | 'void'
  | 'offline';

export type TextVariant = keyof typeof type;
