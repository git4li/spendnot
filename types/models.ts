// ─────────────────────────────────────────────
//  SPENDNOT — Firestore Data Types
//  types/models.ts
// ─────────────────────────────────────────────
import { Timestamp } from 'firebase/firestore';
import { CategoryKey, WalletType } from '../constants/theme';

// ── User ─────────────────────────────────────
export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  currency: 'INR';
  defaultWalletId: string | null;
  createdAt: Timestamp;
}

// ── Wallet ────────────────────────────────────
export interface Wallet {
  id: string;
  uid: string;
  name: string;
  type: WalletType;
  upiApp?: 'gpay' | 'phonepe' | 'other';
  bankName?: string;
  balance: number;
  isDefault: boolean;
  createdAt: Timestamp;
}

// ── Expense ───────────────────────────────────
export type TransactionType = 'expense' | 'income';

export interface Expense {
  id: string;
  uid: string;
  walletId: string;
  type: TransactionType;
  category: CategoryKey;
  amount: number;
  note?: string;
  date: Timestamp;
  isRecurring: boolean;
  recurringId?: string;
  createdAt: Timestamp;
}

// ── Budget ────────────────────────────────────
export type BudgetPeriod = 'weekly' | 'monthly';

export interface Budget {
  id: string;
  uid: string;
  category: CategoryKey;
  limit: number;
  period: BudgetPeriod;
  startDate: Timestamp;
}

// ── Recurring ─────────────────────────────────
export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';

export interface Recurring {
  id: string;
  uid: string;
  name: string;
  walletId: string;
  amount: number;
  frequency: RecurringFrequency;
  nextDueDate: Timestamp;
  isAutoDeduct: boolean;
  lastPaidDate?: Timestamp;
  isPaid: boolean;
}
