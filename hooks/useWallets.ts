// ─────────────────────────────────────────────
//  SPENDNOT — useWallets hook
//  hooks/useWallets.ts
// ─────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Wallet } from '../types/models';
import { useAuth } from '../context/AuthContext';

export function useWallets() {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWallets([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'wallets'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setWallets(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as Wallet)),
      );
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  return { wallets, loading };
}
