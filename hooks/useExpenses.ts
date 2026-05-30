// ─────────────────────────────────────────────
//  SPENDNOT — useExpenses hook
//  hooks/useExpenses.ts
// ─────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Expense } from '../types/models';
import { useAuth } from '../context/AuthContext';

export function useExpenses(limitCount = 50) {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setExpenses([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'expenses'),
      where('uid', '==', user.uid),
      orderBy('date', 'desc'),
      limit(limitCount),
    );
    const unsub = onSnapshot(q, (snap) => {
      setExpenses(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense)),
      );
      setLoading(false);
    });
    return unsub;
  }, [user?.uid, limitCount]);

  return { expenses, loading };
}

// Helper: current-month expenses only
export function useMonthlyExpenses() {
  const { expenses, loading } = useExpenses(500);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthly = expenses.filter((e) => e.date.toDate() >= start && e.type === 'expense');
  const income = expenses.filter((e) => e.date.toDate() >= start && e.type === 'income');
  const totalSpent = monthly.reduce((s, e) => s + e.amount, 0);
  const totalIncome = income.reduce((s, e) => s + e.amount, 0);
  return { monthly, income, totalSpent, totalIncome, loading };
}
