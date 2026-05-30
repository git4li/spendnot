// ─────────────────────────────────────────────
//  SPENDNOT — Add Expense / Income Modal (Screen 4)
//  app/modals/add-expense.tsx
// ─────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
  Keyboard, TouchableWithoutFeedback, Platform,
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
  CATEGORIES, CategoryKey, WalletColors,
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
  const [category, setCategory] = useState<CategoryKey>('food');
  const [note, setNote] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  const user = auth.currentUser!;

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(/,/g, ''));
    if (!amt || amt <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    if (!walletId) {
      Alert.alert('No wallet', 'Please select a wallet.');
      return;
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

      // Update wallet balance
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

          {/* Type toggle */}
          <View style={styles.typeToggle}>
            {(['expense', 'income'] as TransactionType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typePill, type === t && styles.typePillActive]}
                onPress={() => { setType(t); Haptics.selectionAsync(); }}
              >
                <Text style={[styles.typePillText, type === t && styles.typePillTextActive]}>
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
                const colors = WalletColors[w.type] ?? { bg: Colors.ghostGray, text: Colors.carbonBlack };
                const selected = walletId === w.id;
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={[
                      styles.walletPill,
                      { backgroundColor: colors.bg },
                      selected && styles.walletPillSelected,
                    ]}
                    onPress={() => { setWalletId(w.id); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.walletPillText, { color: colors.text }]}>{w.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Category grid */}
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.catCard, category === c.key && styles.catCardActive]}
                  onPress={() => { setCategory(c.key); Haptics.selectionAsync(); }}
                >
                  <Text style={styles.catEmoji}>{c.emoji}</Text>
                  <Text style={[styles.catLabel, category === c.key && styles.catLabelActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
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

            {/* Recurring toggle */}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Mark as recurring</Text>
              <TouchableOpacity
                style={[styles.toggle, !isRecurring && styles.toggleOff]}
                onPress={() => { setIsRecurring(!isRecurring); Haptics.selectionAsync(); }}
                activeOpacity={0.8}
              >
                <View style={[styles.toggleThumb, !isRecurring && styles.toggleThumbOff]} />
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Save button — outside ScrollView, above home indicator */}
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
  typeToggle: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  typePill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 10,
    backgroundColor: Colors.ghostGray,
  },
  typePillActive: { backgroundColor: Colors.carbonBlack },
  typePillText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.mutedStone },
  typePillTextActive: { color: Colors.polarWhite },
  howMuch: {
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
    marginBottom: Spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: Colors.carbonBlack,
    paddingBottom: Spacing.md,
    marginBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  amountCurrency: {
    ...Typography.body,
    fontSize: FontSize['3xl'],
    color: Colors.mutedStone,
    paddingBottom: 4,
  },
  amountInput: {
    ...Typography.heading,
    fontSize: FontSize['9xl'],
    color: Colors.carbonBlack,
    letterSpacing: -3,
    flex: 1,
    padding: 0,
    lineHeight: undefined,
  },
  fieldLabel: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  walletPillsRow: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  walletPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: 9,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  walletPillSelected: { borderColor: Colors.carbonBlack },
  walletPillText: { ...Typography.bodyBold, fontSize: FontSize.sm },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  catCard: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    width: '22%',
    aspectRatio: 1,
    justifyContent: 'center',
    gap: 4,
  },
  catCardActive: { backgroundColor: Colors.carbonBlack },
  catEmoji: { fontSize: 20 },
  catLabel: {
    ...Typography.bodyMedium,
    fontSize: 10,
    color: Colors.carbonBlack,
    textAlign: 'center',
  },
  catLabelActive: { color: Colors.polarWhite },
  noteInput: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
    marginBottom: Spacing.base,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.ghostGray,
    marginBottom: Spacing.base,
  },
  toggleLabel: { ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.carbonBlack },
  toggle: {
    width: 48, height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.carbonBlack,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOff: { backgroundColor: Colors.ghostGray },
  toggleThumb: {
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: Colors.polarWhite,
    alignSelf: 'flex-end',
  },
  toggleThumbOff: { alignSelf: 'flex-start' },
  saveBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  saveBtnText: { ...Typography.bodyBold, fontSize: FontSize.lg, color: Colors.polarWhite },
});
