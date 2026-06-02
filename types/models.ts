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
  bankName?: string;
  balance: number;
  isDefault: boolean;
  createdAt: Timestamp;
  creditLimit?: number;              // Custom usage cap / limit set by user
  billingCycleStartDay?: number;     // Day of month statement is generated (1-31)
  paymentDueDay?: number;            // Day of month payment is due (1-31)
}

// ── Expense ───────────────────────────────────
export type TransactionType = 'expense' | 'income' | 'savings';

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

// ── EMI ───────────────────────────────────────
export interface EMI {
  id: string;
  uid: string;
  name: string;
  walletId: string;                 // Linked source wallet
  category: CategoryKey;
  monthlyAmount: number;
  totalInstallments: number;
  currentInstallment: number;
  startDay: number;                 // Day of the month the EMI is due (1-31)
  createdAt: Timestamp;
  active: boolean;
  lastPaidMonth?: string;           // Track last paid month in format "YYYY-MM" to prevent duplicate approvals
}
