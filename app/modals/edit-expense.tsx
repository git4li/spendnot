// ─────────────────────────────────────────────
//  SPENDNOT — Edit Expense Modal
//  app/modals/edit-expense.tsx
// ─────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
  Keyboard, TouchableWithoutFeedback, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  doc, getDoc, updateDoc, increment, Timestamp, deleteDoc, arrayUnion
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useWallets } from '../../hooks/useWallets';
import { useExpenses } from '../../hooks/useExpenses';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  CATEGORIES, getCategoryDef, WalletColors, CategoryDef,
} from '../../constants/theme';
import { TransactionType } from '../../types/models';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { confirmAction } from '../../lib/confirm';

const formatDateString = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseDateString = (str: string): Date | null => {
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const yyyy = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10) - 1;
  const dd = parseInt(parts[2], 10);
  if (isNaN(yyyy) || isNaN(mm) || isNaN(dd)) return null;
  const d = new Date(yyyy, mm, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm || d.getDate() !== dd) return null;
  return d;
};

export default function EditExpenseModal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wallets } = useWallets();
  const { bottom } = useSafeAreaInsets();
  const { expenses } = useExpenses(100); // Load last 100 transactions for frequency sorting
  const amountRef = React.useRef<TextInput>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalAmount, setOriginalAmount] = useState(0);
  const [originalWalletId, setOriginalWalletId] = useState('');
  const [originalType, setOriginalType] = useState<TransactionType>('expense');

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState('');
  const [category, setCategory] = useState('food');
  const [note, setNote] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [dateMode, setDateMode] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDateStr, setCustomDateStr] = useState(formatDateString(new Date()));

  // Custom category state persisted in Firestore
  const [dbCustomCats, setDbCustomCats] = useState<string[]>([]);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newEmoji, setNewEmoji] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const { user } = useAuth();

  // Load custom categories from Firestore
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists() && snap.data()?.customCategories) {
        setDbCustomCats(snap.data().customCategories);
      }
    });
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

  // Sort categories dynamically by usage frequency
  const sortedCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    expenses.forEach((e) => {
      counts[e.category] = (counts[e.category] ?? 0) + 1;
    });

    return [...allCategories].sort((a, b) => {
      const countA = counts[a.key] ?? 0;
      const countB = counts[b.key] ?? 0;
      if (countA !== countB) return countB - countA;
      return 0; // maintain default ordering for ties
    });
  }, [allCategories, expenses]);

  const handleAddCustomCategory = async () => {
    if (!user) return;
    const emoji = newEmoji.trim() || '⭐';
    const label = newLabel.trim();
    if (!label) {
      Toast.show({ type: 'error', text1: 'Name required', text2: 'Please enter a category name.' });
      return;
    }
    const key = `${emoji}:${label}`;

    try {
      // Persist custom category to user profile in Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        customCategories: arrayUnion(key),
      });

      setDbCustomCats((prev) => [...prev, key]);
      setCategory(key);
      setNewEmoji('');
      setNewLabel('');
      setShowAddCat(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to save', text2: err.message });
    }
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'expenses', id));
        if (snap.exists()) {
          const d = snap.data();
          setType(d.type);
          setAmount(String(d.amount));
          setWalletId(d.walletId);
          setCategory(d.category);
          setNote(d.note ?? '');
          setIsRecurring(d.isRecurring ?? false);
          setOriginalAmount(d.amount);
          setOriginalWalletId(d.walletId);
          setOriginalType(d.type);
          
          if (d.date) {
            const txDate = d.date.toDate();
            const todayStr = formatDateString(new Date());
            const yesterdayStr = formatDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
            const txDateStr = formatDateString(txDate);
            
            if (txDateStr === todayStr) {
              setDateMode('today');
            } else if (txDateStr === yesterdayStr) {
              setDateMode('yesterday');
            } else {
              setDateMode('custom');
            }
            setCustomDateStr(txDateStr);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSave = async () => {
    if (!user) {
      Toast.show({ type: 'error', text1: 'Not logged in', text2: 'Please log in first.' });
      return;
    }
    const amt = parseFloat(amount.replace(/,/g, ''));
    if (!amt || amt <= 0) {
      Toast.show({ type: 'error', text1: 'Invalid amount', text2: 'Please enter a valid amount.' });
      return;
    }
    if (!walletId) {
      Toast.show({ type: 'error', text1: 'No wallet', text2: 'Please select a wallet.' });
      return;
    }

    setSaving(true);
    try {
      let finalDate = new Date();
      if (dateMode === 'yesterday') {
        finalDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      } else if (dateMode === 'custom') {
        const parsed = parseDateString(customDateStr.trim());
        if (!parsed) {
          Toast.show({ type: 'error', text1: 'Invalid date', text2: 'Please use YYYY-MM-DD format.' });
          setSaving(false);
          return;
        }
        finalDate = parsed;
      }

      // Update the document
      await updateDoc(doc(db, 'expenses', id), {
        type, amount: amt, walletId, category,
        note: note.trim() || null, isRecurring,
        date: Timestamp.fromDate(finalDate),
        updatedAt: Timestamp.now(),
      });

      // Reverse original transaction, apply new one
      const originalDelta = originalType === 'income' ? -originalAmount : originalAmount;
      const newDelta = type === 'income' ? amt : -amt;

      if (originalWalletId === walletId) {
        await updateDoc(doc(db, 'wallets', walletId), {
          balance: increment(originalDelta + newDelta),
        });
      } else {
        await updateDoc(doc(db, 'wallets', originalWalletId), { balance: increment(originalDelta) });
        await updateDoc(doc(db, 'wallets', walletId), { balance: increment(newDelta) });
      }

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
      Toast.show({ type: 'success', text1: 'Updated ✓' });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!user) return;
    confirmAction(
      'Delete Entry',
      'Are you sure you want to delete this transaction? This cannot be undone.',
      async () => {
        setSaving(true);
        try {
          await deleteDoc(doc(db, 'expenses', id));
          
          // Reverse original wallet balance
          const originalDelta = originalType === 'income' ? -originalAmount : originalAmount;
          await updateDoc(doc(db, 'wallets', originalWalletId), {
            balance: increment(originalDelta),
          });

          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {}
          Toast.show({ type: 'success', text1: 'Deleted ✓' });
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)');
          }
        } catch (err: any) {
          Toast.show({ type: 'error', text1: 'Delete failed', text2: err.message });
        } finally {
          setSaving(false);
        }
      }
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={Colors.carbonBlack} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Edit Entry</Text>
            <TouchableOpacity onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)');
              }
            }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Type pill selector */}
          <View style={styles.pillRow}>
            {(['expense', 'income', 'savings'] as TransactionType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.pill, type === t && styles.pillActive]}
                onPress={() => { setType(t); Haptics.selectionAsync(); }}
              >
                {type === t && <Text style={styles.pillTick}>✓ </Text>}
                <Text style={[styles.pillText, type === t && styles.pillTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Amount */}
            <Text style={styles.howMuch}>Amount</Text>
            <TouchableOpacity
              style={styles.amountRow}
              activeOpacity={1}
              onPress={() => {
                if (amountRef.current) {
                  if (amountRef.current.isFocused()) {
                    amountRef.current.blur();
                    setTimeout(() => {
                      amountRef.current?.focus();
                    }, 50);
                  } else {
                    amountRef.current.focus();
                  }
                }
              }}
            >
              <Text style={styles.amountCurrency}>₹</Text>
              <TextInput
                ref={amountRef}
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.ghostGray}
                maxLength={10}
                autoFocus
              />
            </TouchableOpacity>

            {/* Wallet selector */}
            <Text style={styles.fieldLabel}>Wallet</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walletPillsRow}>
              {wallets.map((w) => {
                const wColors = WalletColors[w.type] ?? { bg: Colors.ghostGray, text: Colors.carbonBlack };
                const selected = walletId === w.id;
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.walletPill, { backgroundColor: wColors.bg }, selected && styles.walletPillSelected]}
                    onPress={() => { setWalletId(w.id); Haptics.selectionAsync(); }}
                  >
                    {selected && <Text style={[styles.walletTick, { color: wColors.text }]}>✓ </Text>}
                    <Text style={[styles.walletPillText, { color: wColors.text }]}>{w.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Category Scroll Row */}
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catScrollRow}
            >
              {sortedCategories.map((c) => {
                const selected = category === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.catCard, selected && styles.catCardActive]}
                    onPress={() => { setCategory(c.key); Haptics.selectionAsync(); }}
                  >
                    {selected && (
                      <View style={styles.catTick}>
                        <Text style={styles.catTickText}>✓</Text>
                      </View>
                    )}
                    <Text style={styles.catEmoji}>{c.emoji}</Text>
                    <Text style={[styles.catLabel, selected && styles.catLabelActive]} numberOfLines={1}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {/* Add custom category */}
              <TouchableOpacity
                style={[styles.catCard, styles.catCardAdd]}
                onPress={() => setShowAddCat(true)}
              >
                <Text style={styles.catAddPlus}>+</Text>
                <Text style={styles.catAddLabel}>New</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Note */}
            <Text style={styles.fieldLabel}>Note</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Add a note..."
              placeholderTextColor={Colors.mutedStone}
              value={note}
              onChangeText={setNote}
              maxLength={100}
            />

            {/* Date Selector */}
            <Text style={styles.fieldLabel}>Date</Text>
            <View style={styles.datePillRow}>
              {(['today', 'yesterday', 'custom'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.datePill, dateMode === mode && styles.datePillActive]}
                  onPress={() => {
                    setDateMode(mode);
                    Haptics.selectionAsync();
                  }}
                >
                  {dateMode === mode && <Text style={styles.pillTick}>✓ </Text>}
                  <Text style={[styles.datePillText, dateMode === mode && styles.datePillTextActive]}>
                    {mode === 'today' ? 'Today' : mode === 'yesterday' ? 'Yesterday' : 'Custom'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {dateMode === 'custom' && (
              <TextInput
                style={styles.customDateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.mutedStone}
                value={customDateStr}
                onChangeText={setCustomDateStr}
                maxLength={10}
              />
            )}

            {/* Recurring */}
            <Text style={styles.fieldLabel}>Frequency</Text>
            <View style={styles.pillRow}>
              {[false, true].map((val) => (
                <TouchableOpacity
                  key={val ? 'recurring' : 'one-time'}
                  style={[styles.pill, isRecurring === val && styles.pillActive]}
                  onPress={() => { setIsRecurring(val); Haptics.selectionAsync(); }}
                >
                  {isRecurring === val && <Text style={styles.pillTick}>✓ </Text>}
                  <Text style={[styles.pillText, isRecurring === val && styles.pillTextActive]}>
                    {val ? '🔁 Recurring' : '1️⃣ One-time'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={Colors.polarWhite} />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteBtn, saving && { opacity: 0.6 }, { marginBottom: Math.max(bottom - 8, 8) }]}
            onPress={handleDelete}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.deleteBtnText}>Delete Transaction</Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>

      {/* Add Custom Category Modal */}
      <Modal visible={showAddCat} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => { setShowAddCat(false); Keyboard.dismiss(); }}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>New Category</Text>
                <View style={styles.modalRow}>
                  <TextInput
                    style={[styles.modalInput, styles.emojiInput]}
                    value={newEmoji}
                    onChangeText={setNewEmoji}
                    placeholder="😀"
                    placeholderTextColor={Colors.mutedStone}
                    maxLength={2}
                  />
                  <TextInput
                    style={[styles.modalInput, { flex: 1 }]}
                    value={newLabel}
                    onChangeText={setNewLabel}
                    placeholder="Category name"
                    placeholderTextColor={Colors.mutedStone}
                    maxLength={20}
                  />
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowAddCat(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalAddBtn} onPress={handleAddCustomCategory}>
                    <Text style={styles.modalAddText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.polarWhite },
  sheet: {
    flex: 1, backgroundColor: Colors.polarWhite,
    borderTopLeftRadius: Radius['4xl'], borderTopRightRadius: Radius['4xl'],
    padding: Spacing.lg, paddingTop: Spacing.base,
  },
  dragHandle: {
    width: 40, height: 4, backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full, alignSelf: 'center', marginBottom: Spacing.base,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.base,
  },
  headerTitle: { ...Typography.bodyBold, fontSize: FontSize.xl, color: Colors.carbonBlack },
  cancelText: { ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.mutedStone },
  pillRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  pill: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    borderRadius: Radius.full, paddingHorizontal: Spacing.base, paddingVertical: 10,
    backgroundColor: Colors.ghostGray,
  },
  pillActive: { backgroundColor: Colors.carbonBlack },
  pillTick: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.polarWhite },
  pillText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.mutedStone },
  pillTextActive: { color: Colors.polarWhite },
  howMuch: { ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.mutedStone, marginBottom: Spacing.sm },
  amountRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    borderBottomWidth: 2, borderBottomColor: Colors.carbonBlack,
    paddingBottom: Spacing.md, marginBottom: Spacing.xl, gap: Spacing.xs,
  },
  amountCurrency: { ...Typography.body, fontSize: FontSize['3xl'], color: Colors.mutedStone, paddingBottom: 4 },
  amountInput: {
    ...Typography.heading, fontSize: FontSize['9xl'],
    color: Colors.carbonBlack, letterSpacing: -3, flex: 1, padding: 0, lineHeight: undefined,
  },
  fieldLabel: {
    ...Typography.bodyBold, fontSize: FontSize.base,
    color: Colors.carbonBlack, marginBottom: Spacing.sm, marginTop: Spacing.xs,
  },
  walletPillsRow: { gap: Spacing.sm, marginBottom: Spacing.lg },
  walletPill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.full, paddingHorizontal: Spacing.base, paddingVertical: 9,
    borderWidth: 2, borderColor: 'transparent',
  },
  walletPillSelected: { borderColor: Colors.carbonBlack },
  walletTick: { ...Typography.bodyBold, fontSize: FontSize.sm },
  walletPillText: { ...Typography.bodyBold, fontSize: FontSize.sm },
  // Category Scroll Row
  catScrollRow: { gap: Spacing.sm, paddingBottom: 4, marginBottom: Spacing.lg },
  catCard: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    alignItems: 'center',
    width: 76,
    height: 76,
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  catCardActive: { backgroundColor: Colors.carbonBlack },
  catCardAdd: { backgroundColor: Colors.ghostGray, borderWidth: 1.5, borderColor: Colors.mutedStone, borderStyle: 'dashed' },
  catAddPlus: { fontSize: 22, color: Colors.mutedStone },
  catAddLabel: { ...Typography.bodyMedium, fontSize: 10, color: Colors.mutedStone },
  catTick: {
    position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: 7,
    backgroundColor: Colors.lilacPink, alignItems: 'center', justifyContent: 'center',
  },
  catTickText: { fontSize: 8, color: Colors.carbonBlack, fontWeight: '700' },
  catEmoji: { fontSize: 20 },
  catLabel: { ...Typography.bodyMedium, fontSize: 10, color: Colors.carbonBlack, textAlign: 'center' },
  catLabelActive: { color: Colors.polarWhite },
  noteInput: {
    backgroundColor: Colors.ghostGray, borderRadius: Radius.md,
    paddingHorizontal: Spacing.base, paddingVertical: 12,
    ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.carbonBlack, marginBottom: Spacing.base,
  },
  saveBtn: {
    backgroundColor: Colors.carbonBlack, borderRadius: Radius.full, height: 56,
    alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm, marginBottom: Spacing.sm,
  },
  saveBtnText: { ...Typography.bodyBold, fontSize: FontSize.lg, color: Colors.polarWhite },
  deleteBtn: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    backgroundColor: 'transparent',
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.danger,
  },
  deleteBtnText: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.danger,
  },
  datePillRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  datePill: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    borderRadius: Radius.full, paddingHorizontal: Spacing.base, paddingVertical: 10,
    backgroundColor: Colors.ghostGray,
  },
  datePillActive: { backgroundColor: Colors.carbonBlack },
  datePillText: { ...Typography.bodyBold, fontSize: FontSize.sm, color: Colors.mutedStone },
  datePillTextActive: { color: Colors.polarWhite },
  customDateInput: {
    backgroundColor: Colors.ghostGray, borderRadius: Radius.md,
    paddingHorizontal: Spacing.base, paddingVertical: 12,
    ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.carbonBlack, marginBottom: Spacing.base,
  },
  // Custom category modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.xl,
  },
  modalCard: {
    backgroundColor: Colors.polarWhite, borderRadius: Radius['2xl'],
    padding: Spacing.xl, width: '100%', maxWidth: 380, gap: Spacing.base,
  },
  modalTitle: { ...Typography.bodyBold, fontSize: FontSize.xl, color: Colors.carbonBlack },
  modalRow: { flexDirection: 'row', gap: Spacing.sm },
  modalInput: {
    backgroundColor: Colors.ghostGray, borderRadius: Radius.md,
    paddingHorizontal: Spacing.base, paddingVertical: 12,
    ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.carbonBlack,
  },
  emojiInput: { width: 56, textAlign: 'center', fontSize: 24 },
  modalActions: { flexDirection: 'row', gap: Spacing.sm },
  modalCancelBtn: {
    flex: 1, borderRadius: Radius.full, paddingVertical: 12,
    backgroundColor: Colors.ghostGray, alignItems: 'center',
  },
  modalCancelText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.mutedStone },
  modalAddBtn: {
    flex: 1, borderRadius: Radius.full, paddingVertical: 12,
    backgroundColor: Colors.carbonBlack, alignItems: 'center',
  },
  modalAddText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.polarWhite },
});
