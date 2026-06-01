// ─────────────────────────────────────────────
//  SPENDNOT — Edit Expense Modal
//  app/modals/edit-expense.tsx
// ─────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
  Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  doc, getDoc, updateDoc, increment, Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useWallets } from '../../hooks/useWallets';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  CATEGORIES, getCategoryDef, WalletColors,
} from '../../constants/theme';
import { TransactionType } from '../../types/models';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

export default function EditExpenseModal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wallets } = useWallets();
  const { bottom } = useSafeAreaInsets();

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
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(/,/g, ''));
    if (!amt || amt <= 0) { Alert.alert('Invalid amount', 'Please enter a valid amount.'); return; }
    if (!walletId) { Alert.alert('No wallet', 'Please select a wallet.'); return; }

    setSaving(true);
    try {
      // Update the document
      await updateDoc(doc(db, 'expenses', id), {
        type, amount: amt, walletId, category,
        note: note.trim() || null, isRecurring,
        updatedAt: Timestamp.now(),
      });

      // Reverse original transaction, apply new one
      const originalDelta = originalType === 'expense' ? originalAmount : -originalAmount;
      const newDelta = type === 'expense' ? -amt : amt;

      if (originalWalletId === walletId) {
        await updateDoc(doc(db, 'wallets', walletId), {
          balance: increment(originalDelta + newDelta),
        });
      } else {
        await updateDoc(doc(db, 'wallets', originalWalletId), { balance: increment(originalDelta) });
        await updateDoc(doc(db, 'wallets', walletId), { balance: increment(newDelta) });
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Updated ✓' });
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not update.');
    } finally {
      setSaving(false);
    }
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
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Type pill */}
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
            <Text style={styles.howMuch}>Amount</Text>
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

            {/* Category */}
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map((c) => {
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
            style={[styles.saveBtn, saving && { opacity: 0.6 }, { marginBottom: Math.max(bottom - 8, 8) }]}
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
        </View>
      </TouchableWithoutFeedback>
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
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  catCard: {
    backgroundColor: Colors.ghostGray, borderRadius: Radius.lg, padding: Spacing.md,
    alignItems: 'center', width: '22%', aspectRatio: 1, justifyContent: 'center', gap: 4,
    overflow: 'hidden',
  },
  catCardActive: { backgroundColor: Colors.carbonBlack },
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
});
