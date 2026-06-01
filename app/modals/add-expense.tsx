// ─────────────────────────────────────────────
//  SPENDNOT — Add Expense / Income Modal
//  app/modals/add-expense.tsx
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
  Keyboard, TouchableWithoutFeedback, Modal, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  collection, addDoc, doc, updateDoc, increment, Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useWallets } from '../../hooks/useWallets';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  CATEGORIES, CategoryDef, WalletColors,
} from '../../constants/theme';
import { TransactionType } from '../../types/models';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

export default function AddExpenseModal() {
  const { wallets } = useWallets();
  const { bottom } = useSafeAreaInsets();

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState<string>(
    wallets.find((w) => w.isDefault)?.id ?? wallets[0]?.id ?? '',
  );
  const [category, setCategory] = useState<string>('food');
  const [note, setNote] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  // Custom category state
  const [customCategories, setCustomCategories] = useState<CategoryDef[]>([]);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newEmoji, setNewEmoji] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const allCategories = [...CATEGORIES, ...customCategories];

  const user = auth.currentUser!;

  const handleAddCustomCategory = () => {
    const emoji = newEmoji.trim() || '⭐';
    const label = newLabel.trim();
    if (!label) { Alert.alert('Name required', 'Please enter a category name.'); return; }
    const key = `${emoji}:${label}`;
    const newCat: CategoryDef = { key, label, emoji };
    setCustomCategories((prev) => [...prev, newCat]);
    setCategory(key);
    setNewEmoji('');
    setNewLabel('');
    setShowAddCat(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(/,/g, ''));
    if (!amt || amt <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.'); return;
    }
    if (!walletId) {
      Alert.alert('No wallet', 'Please select a wallet.'); return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, 'expenses'), {
        uid: user.uid,
        walletId,
        type,
        category,
        amount: amt,
        note: note.trim() || null,
        date: Timestamp.now(),
        isRecurring,
        createdAt: Timestamp.now(),
      });

      const delta = type === 'expense' ? -amt : amt;
      await updateDoc(doc(db, 'wallets', walletId), {
        balance: increment(delta),
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({
        type: 'success',
        text1: `${type === 'expense' ? 'Expense' : 'Income'} saved ✓`,
        text2: `₹${amt.toLocaleString('en-IN')}`,
      });
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.dragHandle} />

          {/* Expense / Income pill selector */}
          <View style={styles.pillRow}>
            {(['expense', 'income'] as TransactionType[]).map((t) => (
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
            <Text style={styles.howMuch}>How much?</Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountCurrency}>₹</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.ghostGray}
                maxLength={10}
                autoFocus
              />
            </View>

            {/* Wallet selector */}
            <Text style={styles.fieldLabel}>From wallet</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.walletPillsRow}
            >
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

            {/* Category grid */}
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.catGrid}>
              {allCategories.map((c) => {
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
                    <Text style={[styles.catLabel, selected && styles.catLabelActive]}>{c.label}</Text>
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
            </View>

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

            {/* Recurring pill selector */}
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

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }, { marginBottom: Math.max(bottom - 8, 8) }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={Colors.polarWhite} />
            ) : (
              <Text style={styles.saveBtnText}>
                Save {type === 'expense' ? 'Expense' : 'Income'}
              </Text>
            )}
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
    flex: 1,
    backgroundColor: Colors.polarWhite,
    borderTopLeftRadius: Radius['4xl'],
    borderTopRightRadius: Radius['4xl'],
    padding: Spacing.lg,
    paddingTop: Spacing.base,
  },
  dragHandle: {
    width: 40, height: 4,
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  // Pill selectors (expense/income + recurring)
  pillRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  pill: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: 10,
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
    color: Colors.carbonBlack, letterSpacing: -3,
    flex: 1, padding: 0, lineHeight: undefined,
  },
  fieldLabel: {
    ...Typography.bodyBold, fontSize: FontSize.base,
    color: Colors.carbonBlack, marginBottom: Spacing.sm, marginTop: Spacing.xs,
  },
  // Wallet
  walletPillsRow: { gap: Spacing.sm, marginBottom: Spacing.lg },
  walletPill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base, paddingVertical: 9,
    borderWidth: 2, borderColor: 'transparent',
  },
  walletPillSelected: { borderColor: Colors.carbonBlack },
  walletTick: { ...Typography.bodyBold, fontSize: FontSize.sm },
  walletPillText: { ...Typography.bodyBold, fontSize: FontSize.sm },
  // Category grid
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  catCard: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.lg, padding: Spacing.md,
    alignItems: 'center', width: '22%', aspectRatio: 1,
    justifyContent: 'center', gap: 4,
    overflow: 'hidden',
  },
  catCardActive: { backgroundColor: Colors.carbonBlack },
  catCardAdd: { backgroundColor: Colors.ghostGray, borderWidth: 1.5, borderColor: Colors.mutedStone, borderStyle: 'dashed' },
  catTick: {
    position: 'absolute', top: 4, right: 4,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: Colors.lilacPink,
    alignItems: 'center', justifyContent: 'center',
  },
  catTickText: { fontSize: 8, color: Colors.carbonBlack, fontWeight: '700' },
  catEmoji: { fontSize: 20 },
  catLabel: { ...Typography.bodyMedium, fontSize: 10, color: Colors.carbonBlack, textAlign: 'center' },
  catLabelActive: { color: Colors.polarWhite },
  catAddPlus: { fontSize: 22, color: Colors.mutedStone },
  catAddLabel: { ...Typography.bodyMedium, fontSize: 10, color: Colors.mutedStone },
  noteInput: {
    backgroundColor: Colors.ghostGray, borderRadius: Radius.md,
    paddingHorizontal: Spacing.base, paddingVertical: 12,
    ...Typography.bodyMedium, fontSize: FontSize.base,
    color: Colors.carbonBlack, marginBottom: Spacing.base,
  },
  saveBtn: {
    backgroundColor: Colors.carbonBlack, borderRadius: Radius.full,
    height: 56, alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.sm, marginBottom: Spacing.sm,
  },
  saveBtnText: { ...Typography.bodyBold, fontSize: FontSize.lg, color: Colors.polarWhite },
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
