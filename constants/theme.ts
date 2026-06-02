// ─────────────────────────────────────────────
//  SPENDNOT Design System — constants/theme.ts
// ─────────────────────────────────────────────

export const Colors = {
  // Core palette
  canvasIce: '#ffffff',       // Pure white background
  polarWhite: '#ffffff',
  carbonBlack: '#1A1A1A',     // Deep Charcoal
  deepGraphite: '#2a2a2a',
  ghostGray: '#EFEFEF',
  mutedStone: '#5A5A5A',       // Darkened for accessibility contrast
  softStone: '#767676',        // Darkened for accessibility contrast

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
  walletBankDefault: '#AEC2F7',
  walletBankDefaultText: '#1A1A1A',

  // Semantic
  income: '#99B889',
  expense: '#F3C0DC',
  savings: '#B7D3F2',
  danger: '#e05c5c',
  overBudget: '#e05c5c',
  
  // High-contrast text equivalents for WCAG AA compliance
  incomeText: '#2E6C40',
  expenseText: '#C23E7D',
  savingsText: '#2B5595',
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
export type WalletType = 'cash' | 'credit' | 'bank';

export const WalletColors: Record<WalletType, { bg: string; text: string }> = {
  cash: { bg: Colors.walletCash, text: Colors.walletCashText },
  credit: { bg: Colors.walletCredit, text: Colors.walletCreditText },
  bank: { bg: Colors.walletBankDefault, text: Colors.walletBankDefaultText },
};

// Bank brand pastel colors for UI styling
export const BankColors: Record<string, { bg: string; text: string }> = {
  hdfc: { bg: '#A6C8FF', text: '#0A2540' },      // Pastel Navy
  sbi: { bg: '#AEE4E8', text: '#004A50' },       // Pastel Teal
  icici: { bg: '#FFE3A8', text: '#592900' },     // Pastel Amber
  axis: { bg: '#FFCCD5', text: '#5A0E1A' },      // Pastel Maroon
  kotak: { bg: '#FFD3D6', text: '#1E3A8A' },     // Pastel Red/Blue
};

export const getWalletColors = (type: WalletType, bankName?: string | null): { bg: string; text: string } => {
  if (type === 'bank' && bankName) {
    const key = bankName.toLowerCase().trim();
    if (key.includes('hdfc')) return BankColors.hdfc;
    if (key.includes('sbi') || key.includes('state bank')) return BankColors.sbi;
    if (key.includes('icici')) return BankColors.icici;
    if (key.includes('axis')) return BankColors.axis;
    if (key.includes('kotak')) return BankColors.kotak;
  }
  return WalletColors[type];
};

// Category definitions
export type CategoryKey = string;

export interface CategoryDef {
  key: string;
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
  { key: 'other', label: 'Other', emoji: '📦' },
];

export const getCategoryDef = (key: string): CategoryDef => {
  const found = CATEGORIES.find((c) => c.key === key);
  if (found) return found;
  // Custom categories stored as "emoji:label"
  if (key.includes(':')) {
    const [emoji, ...rest] = key.split(':');
    return { key, label: rest.join(':'), emoji };
  }
  return CATEGORIES[CATEGORIES.length - 1];
};
