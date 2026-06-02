// ─────────────────────────────────────────────
//  SPENDNOT — Add EMI Modal
//  app/modals/add-emi.tsx
// ─────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator,
  Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { collection, addDoc, doc, getDoc, arrayUnion, updateDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useWallets } from '../../hooks/useWallets';
import { useExpenses } from '../../hooks/useExpenses';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  CATEGORIES, CategoryDef, WalletColors,
} from '../../constants/theme';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

export default function AddEmiModal() {
  const { wallets } = useWallets();
  const { bottom } = useSafeAreaInsets();
  const { expenses } = useExpenses(100);

  const [name, setName] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [walletId, setWalletId] = useState<string>('');
  const [category, setCategory] = useState<string>('shopping');
  const [totalInstallments, setTotalInstallments] = useState('12');
  const [startDay, setStartDay] = useState('5');
  const [saving, setSaving] = useState(false);

  // Custom categories setup
  const [dbCustomCats, setDbCustomCats] = useState<string[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists() && snap.data()?.customCategories) {
        setDbCustomCats(snap.data().customCategories);
      }
    });
  }, [user?.uid]);

  useEffect(() => {
    if (wallets.length > 0 && !walletId) {
      const def = wallets.find((w) => w.isDefault)?.id ?? wallets[0]?.id;
      if (def) setWalletId(def);
    }
  }, [wallets]);

  const parsedCustomCategories = useMemo(() => {
    return dbCustomCats.map((item) => {
      const [emoji, ...rest] = item.split(':');
      return { key: item, label: rest.join(':'), emoji } as CategoryDef;
    });
  }, [dbCustomCats]);

  const allCategories = useMemo(() => {
    return [...CATEGORIES, ...parsedCustomCategories];
  }, [parsedCustomCategories]);

  const sortedCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    expenses.forEach((e) => {
      counts[e.category] = (counts[e.category] ?? 0) + 1;
    });
    return [...allCategories].sort((a, b) => {
      const countA = counts[a.key] ?? 0;
      const countB = counts[b.key] ?? 0;
      if (countA !== countB) return countB - countA;
      return 0;
    });
  }, [allCategories, expenses]);

  const handleSave = async () => {
    if (!user) {
      Toast.show({ type: 'error', text1: 'Not logged in', text2: 'Please log in first.' });
      return;
    }
    const cleanName = name.trim();
    const amt = parseFloat(monthlyAmount.replace(/,/g, ''));
    const instCount = parseInt(totalInstallments);
    const dueDay = parseInt(startDay);

    if (!cleanName) {
      Toast.show({ type: 'error', text1: 'Name required', text2: 'Please name this EMI.' });
      return;
    }
    if (!amt || amt <= 0) {
      Toast.show({ type: 'error', text1: 'Invalid amount', text2: 'Please enter monthly installment amount.' });
      return;
    }
    if (!walletId) {
      Toast.show({ type: 'error', text1: 'No wallet', text2: 'Please select a source wallet.' });
      return;
    }
    if (!instCount || instCount <= 0) {
      Toast.show({ type: 'error', text1: 'Invalid installments', text2: 'Please specify total installment months.' });
      return;
    }
    if (!dueDay || dueDay < 1 || dueDay > 31) {
      Toast.show({ type: 'error', text1: 'Invalid billing day', text2: 'Enter a day of the month between 1 and 31.' });
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, 'emis'), {
        uid: user.uid,
        name: cleanName,
        walletId,
        category,
        monthlyAmount: amt,
        totalInstallments: instCount,
        currentInstallment: 0,
        startDay: dueDay,
        active: true,
        createdAt: Timestamp.now(),
      });

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
      Toast.show({ type: 'success', text1: 'EMI created ✓', text2: `${cleanName} — ₹${amt.toLocaleString('en-IN')}/mo` });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/budgets');
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Could not create EMI.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />
          
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Add EMI Plan</Text>
            <TouchableOpacity onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)/budgets');
              }
            }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* EMI Name */}
            <Text style={styles.fieldLabel}>EMI NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. iPhone 15 Pro, MacBook, Car Loan"
              placeholderTextColor={Colors.mutedStone}
              value={name}
              onChangeText={setName}
            />

            {/* Monthly Installment Amount */}
            <Text style={styles.fieldLabel}>MONTHLY INSTALLMENT (₹)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={Colors.mutedStone}
              keyboardType="decimal-pad"
              value={monthlyAmount}
              onChangeText={setMonthlyAmount}
            />

            {/* Source Wallet */}
            <Text style={styles.fieldLabel}>CHARGE FROM WALLET</Text>
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
            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScrollRow}>
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
            </ScrollView>

            {/* Total installments & start day */}
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>TOTAL MONTHS</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 12"
                  placeholderTextColor={Colors.mutedStone}
                  keyboardType="number-pad"
                  value={totalInstallments}
                  onChangeText={setTotalInstallments}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>DUE DAY OF MONTH</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 5"
                  placeholderTextColor={Colors.mutedStone}
                  keyboardType="number-pad"
                  value={startDay}
                  onChangeText={setStartDay}
                  maxLength={2}
                />
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }, { marginBottom: Math.max(bottom - 8, 8) }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={Colors.polarWhite} /> : <Text style={styles.saveBtnText}>Create EMI Plan</Text>}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  headerTitle: { ...Typography.bodyBold, fontSize: FontSize.xl, color: Colors.carbonBlack },
  cancelText: { ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.mutedStone },
  fieldLabel: {
    ...Typography.bodyBold, fontSize: FontSize.xs,
    color: Colors.mutedStone, letterSpacing: 0.8,
    marginBottom: Spacing.sm, marginTop: Spacing.base,
  },
  input: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    ...Typography.bodyMedium, fontSize: FontSize.base,
    color: Colors.carbonBlack, marginBottom: Spacing.sm,
  },
  walletPillsRow: { gap: Spacing.sm, marginBottom: Spacing.md },
  walletPill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.full, paddingHorizontal: Spacing.base, paddingVertical: 9,
    borderWidth: 2, borderColor: 'transparent',
  },
  walletPillSelected: { borderColor: Colors.carbonBlack },
  walletTick: { ...Typography.bodyBold, fontSize: FontSize.sm },
  walletPillText: { ...Typography.bodyBold, fontSize: FontSize.sm },
  catScrollRow: { gap: Spacing.sm, paddingBottom: 4, marginBottom: Spacing.md },
  catCard: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    alignItems: 'center',
    width: 76, height: 76,
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  catCardActive: { backgroundColor: Colors.carbonBlack },
  catEmoji: { fontSize: 20 },
  catLabel: { ...Typography.bodyMedium, fontSize: 10, color: Colors.carbonBlack, textAlign: 'center' },
  catLabelActive: { color: Colors.polarWhite },
  catTick: {
    position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: 7,
    backgroundColor: Colors.lilacPink, alignItems: 'center', justifyContent: 'center',
  },
  catTickText: { fontSize: 8, color: Colors.carbonBlack, fontWeight: '700' },
  rowInputs: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  saveBtn: {
    backgroundColor: Colors.carbonBlack, borderRadius: Radius.full,
    height: 56, alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  saveBtnText: { ...Typography.bodyBold, fontSize: FontSize.lg, color: Colors.polarWhite },
});
