// ─────────────────────────────────────────────
//  SPENDNOT — useBudgets hook
//  hooks/useBudgets.ts
// ─────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Budget } from '../types/models';
import { useAuth } from '../context/AuthContext';

export function useBudgets() {
  const { user } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setBudgets([]); setLoading(false); return; }
    const q = query(collection(db, 'budgets'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setBudgets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Budget)));
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  return { budgets, loading };
}
