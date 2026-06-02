// ─────────────────────────────────────────────
//  SPENDNOT — useEmis hook
//  hooks/useEmis.ts
// ─────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { EMI } from '../types/models';
import { useAuth } from '../context/AuthContext';

export function useEmis() {
  const { user } = useAuth();
  const [emis, setEmis] = useState<EMI[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setEmis([]); setLoading(false); return; }
    const q = query(
      collection(db, 'emis'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setEmis(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EMI)));
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const active = emis.filter((e) => e.active && e.currentInstallment < e.totalInstallments);
  const completed = emis.filter((e) => !e.active || e.currentInstallment >= e.totalInstallments);

  return { emis, active, completed, loading };
}
