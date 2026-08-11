// ─────────────────────────────────────────────
//  SPENDNOT — useCustomCategories hook
//  hooks/useCustomCategories.ts
// ─────────────────────────────────────────────
import { useEffect, useState, useMemo } from 'react';
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { CATEGORIES, CategoryDef } from '../constants/theme';

export function useCustomCategories() {
  const { user } = useAuth();
  const [dbCustomCats, setDbCustomCats] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setDbCustomCats([]);
      setLoading(false);
      return;
    }
    const docRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists() && snap.data()?.customCategories) {
        setDbCustomCats(snap.data().customCategories);
      } else {
        setDbCustomCats([]);
      }
      setLoading(false);
    }, (err) => {
      console.error('Error loading custom categories:', err);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const parsedCustomCategories = useMemo(() => {
    return dbCustomCats.map((item) => {
      const [emoji, ...rest] = item.split(':');
      return { key: item, label: rest.join(':'), emoji } as CategoryDef;
    });
  }, [dbCustomCats]);

  const allCategories = useMemo(() => {
    return [...CATEGORIES, ...parsedCustomCategories];
  }, [parsedCustomCategories]);

  const addCustomCategory = async (emoji: string, label: string) => {
    if (!user) return;
    const cleanEmoji = emoji.trim() || '⭐';
    const cleanLabel = label.trim();
    if (!cleanLabel) throw new Error('Label required');
    const key = `${cleanEmoji}:${cleanLabel}`;

    await updateDoc(doc(db, 'users', user.uid), {
      customCategories: arrayUnion(key),
    });
    return key;
  };

  return {
    categories: allCategories,
    addCustomCategory,
    loading,
  };
}
