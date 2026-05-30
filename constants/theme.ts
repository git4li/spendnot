// ─────────────────────────────────────────────
//  SPENDNOT Design System — constants/theme.ts
// ─────────────────────────────────────────────

export const Colors = {
  // Core palette
  canvasIce: '#F9F6E5',       // Cream background
  polarWhite: '#ffffff',
  carbonBlack: '#1A1A1A',     // Deep Charcoal
  deepGraphite: '#2a2a2a',
  ghostGray: '#EFEFEF',
  mutedStone: '#7a7a7a',
  softStone: '#999999',

  // Pastel accents
  softBlue: '#B7D3F2',
  pastelYellow: '#FCE67B',    // Card highlight / cream card
  sageGreen: '#99B889',
  lilacPink: '#F3C0DC',       // Primary accent / + button
  periwinkle: '#AEC2F7',

  // Legacy aliases (used throughout screens)
  creamCard: '#FCE67B',
  powerPink: '#F3C0DC',
  skyBlue: '#B7D3F2',
  limePop: '#99B889',

  // Wallet colours — updated to pastel palette
  walletCash: '#99B889',
  walletCashText: '#1A1A1A',
  walletCredit: '#1A1A1A',
  walletCreditText: '#ffffff',
  walletGPay: '#B7D3F2',
  walletGPayText: '#1A1A1A',
  walletPhonePe: '#F3C0DC',
  walletPhonePeText: '#1A1A1A',

  // Semantic
  income: '#99B889',
  expense: '#F3C0DC',
  savings: '#B7D3F2',
  danger: '#e05c5c',
  overBudget: '#e05c5c',
} as const;

export const Typography = {
  heading: {
    fontFamily: 'Montserrat_900Black',
    letterSpacing: -0.033 * 16,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    letterSpacing: -0.02 * 16,
  },
  bodyMedium: {
    fontFamily: 'Inter_500Medium',
    letterSpacing: -0.02 * 16,
  },
  bodyBold: {
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.02 * 16,
  },
} as const;

export const FontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  '5xl': 32,
  '6xl': 36,
  '7xl': 40,
  '8xl': 48,
  '9xl': 60,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 38,
  '3xl': 44,
  '4xl': 46,
  full: 100,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

// Wallet type → colour mapping
export type WalletType = 'cash' | 'credit' | 'upi-gpay' | 'upi-phonepe' | 'upi-other';

export const WalletColors: Record<WalletType, { bg: string; text: string }> = {
  cash: { bg: Colors.walletCash, text: Colors.walletCashText },
  credit: { bg: Colors.walletCredit, text: Colors.walletCreditText },
  'upi-gpay': { bg: Colors.walletGPay, text: Colors.walletGPayText },
  'upi-phonepe': { bg: Colors.walletPhonePe, text: Colors.walletPhonePeText },
  'upi-other': { bg: Colors.periwinkle, text: Colors.carbonBlack },
};

// Category definitions
export type CategoryKey =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'health'
  | 'entertainment'
  | 'education'
  | 'other';

export interface CategoryDef {
  key: CategoryKey;
  label: string;
  emoji: string;
}

export const CATEGORIES: CategoryDef[] = [
  { key: 'food', label: 'Food', emoji: '🍔' },
  { key: 'transport', label: 'Transport', emoji: '🚕' },
  { key: 'shopping', label: 'Shopping', emoji: '🛒' },
  { key: 'bills', label: 'Bills', emoji: '⚡' },
  { key: 'health', label: 'Health', emoji: '💊' },
  { key: 'entertainment', label: 'Entertain', emoji: '🎬' },
  { key: 'education', label: 'Education', emoji: '📚' },
  { key: 'other', label: 'Other', emoji: '📦' },
];

export const getCategoryDef = (key: CategoryKey): CategoryDef =>
  CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
