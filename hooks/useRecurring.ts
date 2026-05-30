// ─────────────────────────────────────────────
//  SPENDNOT — useRecurring hook
//  hooks/useRecurring.ts
// ─────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Recurring } from '../types/models';
import { useAuth } from '../context/AuthContext';

export function useRecurring() {
  const { user } = useAuth();
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setRecurring([]); setLoading(false); return; }
    const q = query(
      collection(db, 'recurring'),
      where('uid', '==', user.uid),
      orderBy('nextDueDate', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setRecurring(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Recurring)));
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const today = new Date();
  const overdue = recurring.filter((r) => !r.isPaid && r.nextDueDate.toDate() < today);
  const upcoming = recurring.filter(
    (r) => !r.isPaid && r.nextDueDate.toDate() >= today,
  );

  return { recurring, overdue, upcoming, loading };
}
