// ─────────────────────────────────────────────
//  SPENDNOT — useChecklist hook
//  hooks/useChecklist.ts
// ─────────────────────────────────────────────
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  collection, query, where, orderBy, onSnapshot, getDocs,
  addDoc, deleteDoc, doc, updateDoc, writeBatch,
  increment, Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ChecklistTemplate, ChecklistItem } from '../types/models';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useChecklist(activeMonth: string) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [checklistLoading, setChecklistLoading] = useState(true);

  // Track month initialisation in AsyncStorage to prevent deleted items from coming back
  const [initializedMonths, setInitializedMonths] = useState<Record<string, boolean>>({});
  // Guard: don't run auto-init until AsyncStorage has been read
  const [initMonthsLoaded, setInitMonthsLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setInitializedMonths({});
      setInitMonthsLoaded(true);
      return;
    }
    setInitMonthsLoaded(false);
    const loadInit = async () => {
      try {
        const stored = await AsyncStorage.getItem(`spendnot:initialized_months:${user.uid}`);
        if (stored) {
          setInitializedMonths(JSON.parse(stored));
        } else {
          setInitializedMonths({});
        }
      } catch (e) {
        console.error('Error loading initialized months:', e);
      } finally {
        setInitMonthsLoaded(true);
      }
    };
    loadInit();
  }, [user?.uid]);

  const markMonthInitialized = async (month: string) => {
    if (!user) return;
    const updated = { ...initializedMonths, [month]: true };
    setInitializedMonths(updated);
    try {
      await AsyncStorage.setItem(`spendnot:initialized_months:${user.uid}`, JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving initialized months:', e);
    }
  };

  // 1. Fetch templates
  useEffect(() => {
    if (!user) {
      setTemplates([]);
      setTemplatesLoading(false);
      return;
    }
    const q = query(
      collection(db, 'checklist_templates'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChecklistTemplate)));
      setTemplatesLoading(false);
    }, (err) => {
      console.error('Templates subscription error:', err);
      setTemplatesLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  // 2. Fetch checklist items for active month
  useEffect(() => {
    if (!user) {
      setChecklist([]);
      setChecklistLoading(false);
      return;
    }
    setChecklistLoading(true);
    const q = query(
      collection(db, 'checklist_items'),
      where('uid', '==', user.uid),
      where('month', '==', activeMonth),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChecklistItem));
      setChecklist(items);
      setChecklistLoading(false);
    }, (err) => {
      console.error('Checklist subscription error:', err);
      setChecklistLoading(false);
    });
    return unsub;
  }, [user?.uid, activeMonth]);

  // Combined loading state
  useEffect(() => {
    setLoading(templatesLoading || checklistLoading);
  }, [templatesLoading, checklistLoading]);



  // ── 4. Auto-initialise/Sync monthly checklist from templates ────────────────
  useEffect(() => {
    if (templatesLoading || checklistLoading) return;
    // Wait until AsyncStorage has been read — avoids wiping stored initializedMonths
    if (!initMonthsLoaded) return;
    if (!user || templates.length === 0) return;

    // Only run if the month has not been initialized yet
    if (!initializedMonths[activeMonth]) {
      if (checklist.length === 0) {
        // Clone all templates
        const init = async () => {
          const batch = writeBatch(db);
          templates.forEach((t) => {
            const itemRef = doc(collection(db, 'checklist_items'));
            batch.set(itemRef, {
              uid: user.uid,
              month: activeMonth,
              name: t.name,
              amount: t.amount,
              category: t.category,
              walletId: t.walletId,
              isPaid: false,
              expenseId: null,
              paidAt: null,
              createdAt: Timestamp.now(),
            } as Omit<ChecklistItem, 'id'>);
          });

          try {
            await batch.commit();
            await markMonthInitialized(activeMonth);
          } catch (err) {
            console.error('Error auto-initialising checklist items:', err);
          }
        };
        init();
      } else {
        // Already contains items (e.g. created previously), mark it initialized
        markMonthInitialized(activeMonth);
      }
    }
  }, [templatesLoading, checklistLoading, initMonthsLoaded, templates, checklist, activeMonth, user, initializedMonths]);

  // Template CRUD Operations
  const addTemplate = async (name: string, amount: number, category: string, walletId: string) => {
    if (!user) return;
    
    // 1. Create template
    await addDoc(collection(db, 'checklist_templates'), {
      uid: user.uid,
      name: name.trim(),
      amount,
      category,
      walletId,
      createdAt: Timestamp.now(),
    });

    // 2. Also append checklist item to the active month so it shows up immediately
    await addDoc(collection(db, 'checklist_items'), {
      uid: user.uid,
      month: activeMonth,
      name: name.trim(),
      amount,
      category,
      walletId,
      isPaid: false,
      expenseId: null,
      paidAt: null,
      createdAt: Timestamp.now(),
    });
  };

  const updateTemplate = async (id: string, updates: Partial<ChecklistTemplate>) => {
    await updateDoc(doc(db, 'checklist_templates', id), updates);
  };

  const deleteTemplate = async (id: string) => {
    await deleteDoc(doc(db, 'checklist_templates', id));
  };

  // Checklist Item CRUD Operations
  const addChecklistItem = async (name: string, amount: number, category: string, walletId: string) => {
    if (!user) return;
    await addDoc(collection(db, 'checklist_items'), {
      uid: user.uid,
      month: activeMonth,
      name: name.trim(),
      amount,
      category,
      walletId,
      isPaid: false,
      expenseId: null,
      paidAt: null,
      createdAt: Timestamp.now(),
    });
  };

  const updateChecklistItem = async (id: string, updates: Partial<ChecklistItem>) => {
    const item = checklist.find(c => c.id === id);
    if (!item) return;

    // 1. Update the checklist item
    await updateDoc(doc(db, 'checklist_items', id), updates);

    // 2. Also update the corresponding template if it exists
    const matchingTemplate = templates.find(
      (t) => t.name.toLowerCase() === item.name.toLowerCase() && t.category === item.category
    );
    if (matchingTemplate) {
      const templateUpdates: Partial<ChecklistTemplate> = {};
      if (updates.name) templateUpdates.name = updates.name;
      if (updates.amount) templateUpdates.amount = updates.amount;
      if (updates.category) templateUpdates.category = updates.category;
      if (updates.walletId) templateUpdates.walletId = updates.walletId;
      
      await updateDoc(doc(db, 'checklist_templates', matchingTemplate.id), templateUpdates);
    }
  };

  const deleteChecklistItem = async (id: string) => {
    const item = checklist.find(c => c.id === id);
    if (!item) return;

    if (item.isPaid) {
      await unmarkPaid(item);
    }
    
    // 1. Delete this checklist item
    await deleteDoc(doc(db, 'checklist_items', id));

    // 2. Also find and delete the corresponding template
    const matchingTemplate = templates.find(
      (t) => t.name.toLowerCase() === item.name.toLowerCase() && t.category === item.category
    );
    if (matchingTemplate) {
      await deleteDoc(doc(db, 'checklist_templates', matchingTemplate.id));
    }
  };

  // Pay Operations
  const markPaid = async (item: ChecklistItem, overrideAmount?: number) => {
    if (!user) return;
    const finalAmount = overrideAmount !== undefined ? overrideAmount : item.amount;

    // 1. Create logged expense transaction
    const expRef = await addDoc(collection(db, 'expenses'), {
      uid: user.uid,
      walletId: item.walletId,
      type: 'expense',
      category: item.category,
      amount: finalAmount,
      note: item.name,
      date: Timestamp.now(),
      isRecurring: true,
      createdAt: Timestamp.now(),
    });

    // 2. Decrement wallet balance
    await updateDoc(doc(db, 'wallets', item.walletId), {
      balance: increment(-finalAmount),
    });

    // 3. Mark checklist item as paid
    await updateDoc(doc(db, 'checklist_items', item.id), {
      isPaid: true,
      amount: finalAmount,
      expenseId: expRef.id,
      paidAt: Timestamp.now(),
    });
  };

  const unmarkPaid = async (item: ChecklistItem) => {
    if (!user) return;

    // 1. Delete transaction if exists
    if (item.expenseId) {
      try {
        await deleteDoc(doc(db, 'expenses', item.expenseId));
      } catch (err) {
        console.error('Expense deletion failed:', err);
      }
    }

    // 2. Refund wallet balance
    await updateDoc(doc(db, 'wallets', item.walletId), {
      balance: increment(item.amount),
    });

    // 3. Update checklist status
    await updateDoc(doc(db, 'checklist_items', item.id), {
      isPaid: false,
      expenseId: null,
      paidAt: null,
    });
  };

  const resetToDefaults = async () => {
    if (!user) return;

    // Delete current items
    const batch = writeBatch(db);
    checklist.forEach((item) => {
      batch.delete(doc(db, 'checklist_items', item.id));
    });
    await batch.commit();

    // Reset initializedMonths state and storage so next load re-clones
    const updated = { ...initializedMonths };
    delete updated[activeMonth];
    setInitializedMonths(updated);
    try {
      await AsyncStorage.setItem(`spendnot:initialized_months:${user.uid}`, JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving initialized months:', e);
    }
  };

  return {
    templates,
    checklist,
    loading,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
    markPaid,
    unmarkPaid,
    resetToDefaults,
  };
}
