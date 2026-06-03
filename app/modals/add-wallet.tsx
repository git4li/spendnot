// ─────────────────────────────────────────────
//  SPENDNOT — Add Wallet Modal
//  app/modals/add-wallet.tsx
// ─────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, ScrollView, Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, addDoc, updateDoc, deleteDoc, doc, Timestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useWallets } from '../../hooks/useWallets';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  WalletType, getWalletColors,
} from '../../constants/theme';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

export default function AddWalletModal() {
  const { walletId } = useLocalSearchParams<{ walletId?: string }>();
  const isEdit = !!walletId;
  const { wallets } = useWallets();
  const { bottom } = useSafeAreaInsets();

  const [walletType, setWalletType] = useState<WalletType>('cash');
  const [bankName, setBankName] = useState('');
  const [walletName, setWalletName] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [billingCycleStartDay, setBillingCycleStartDay] = useState('');
  const [paymentDueDay, setPaymentDueDay] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (isEdit && wallets.length > 0) {
      const existing = wallets.find((w) => w.id === walletId);
      if (existing) {
        let resolvedType = existing.type;
        if (resolvedType !== 'cash' && resolvedType !== 'credit' && resolvedType !== 'bank') {
          resolvedType = 'bank';
        }
        setWalletType(resolvedType as WalletType);
        setBankName(existing.bankName || '');
        setWalletName(existing.name);
        setInitialBalance(String(existing.balance));
        setIsDefault(!!existing.isDefault);
        if (existing.creditLimit !== undefined && existing.creditLimit !== null) {
          setCreditLimit(String(existing.creditLimit));
        }
        if (existing.billingCycleStartDay !== undefined && existing.billingCycleStartDay !== null) {
          setBillingCycleStartDay(String(existing.billingCycleStartDay));
        }
        if (existing.paymentDueDay !== undefined && existing.paymentDueDay !== null) {
          setPaymentDueDay(String(existing.paymentDueDay));
        }
      }
    }
  }, [isEdit, walletId, wallets]);

  const resolvedName = (): string => {
    if (walletName.trim()) return walletName.trim();
    switch (walletType) {
      case 'cash': return 'Cash';
      case 'credit': return bankName.trim() ? `${bankName.trim()} Credit` : 'Credit Card';
      case 'bank': return bankName.trim() ? `${bankName.trim()}` : 'Bank Account';
    }
  };

  const handleSave = async () => {
    if (!user) {
      Toast.show({ type: 'error', text1: 'Not logged in', text2: 'Please log in first.' });
      return;
    }
    setSaving(true);
    try {
      if (walletType === 'credit') {
        const cycleDay = parseInt(billingCycleStartDay);
        const dueDay = parseInt(paymentDueDay);
        if (!cycleDay || cycleDay < 1 || cycleDay > 31) {
          Toast.show({ type: 'error', text1: 'Invalid Statement Day', text2: 'Please enter a day between 1 and 31.' });
          setSaving(false);
          return;
        }
        if (!dueDay || dueDay < 1 || dueDay > 31) {
          Toast.show({ type: 'error', text1: 'Invalid Due Day', text2: 'Please enter a day between 1 and 31.' });
          setSaving(false);
          return;
        }
      }

      const balance = parseFloat(initialBalance.replace(/,/g, '')) || 0;
      const creditLimitNum = walletType === 'credit' ? (parseFloat(creditLimit.replace(/,/g, '')) || 0) : null;
      const billingCycleStartNum = walletType === 'credit' ? (parseInt(billingCycleStartDay) || 1) : null;
      const paymentDueNum = walletType === 'credit' ? (parseInt(paymentDueDay) || 1) : null;

      const dataPayload = {
        name: resolvedName(),
        type: walletType,
        bankName: bankName.trim() || null,
        balance,
        isDefault,
        ...(walletType === 'credit' ? {
          creditLimit: creditLimitNum,
          billingCycleStartDay: billingCycleStartNum,
          paymentDueDay: paymentDueNum,
        } : {
          creditLimit: null,
          billingCycleStartDay: null,
          paymentDueDay: null,
        }),
      };

      const batch = writeBatch(db);

      if (isEdit) {
        const walletRef = doc(db, 'wallets', walletId!);
        batch.update(walletRef, dataPayload);

        if (isDefault) {
          wallets.forEach((w) => {
            if (w.id !== walletId) {
              batch.update(doc(db, 'wallets', w.id), { isDefault: false });
            }
          });
          batch.update(doc(db, 'users', user.uid), { defaultWalletId: walletId });
        } else {
          const remainingDefault = wallets.find((w) => w.id !== walletId && w.isDefault);
          batch.update(doc(db, 'users', user.uid), {
            defaultWalletId: remainingDefault ? remainingDefault.id : '',
          });
        }
      } else {
        const newWalletRef = doc(collection(db, 'wallets'));
        batch.set(newWalletRef, {
          uid: user.uid,
          ...dataPayload,
          createdAt: Timestamp.now(),
        });

        if (isDefault) {
          wallets.forEach((w) => {
            batch.update(doc(db, 'wallets', w.id), { isDefault: false });
          });
          batch.update(doc(db, 'users', user.uid), { defaultWalletId: newWalletRef.id });
        }
      }

      await batch.commit();
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
      Toast.show({ type: 'success', text1: isEdit ? 'Wallet updated ✓' : 'Wallet added ✓' });
      
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Could not save wallet.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !walletId || !user) return;
    Alert.alert(
      'Delete Wallet',
      'Are you sure you want to delete this wallet? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const batch = writeBatch(db);
              batch.delete(doc(db, 'wallets', walletId));

              const wasDefault = wallets.find((w) => w.id === walletId)?.isDefault;
              if (wasDefault) {
                const remainingDefault = wallets.find((w) => w.id !== walletId && w.isDefault);
                batch.update(doc(db, 'users', user.uid), {
                  defaultWalletId: remainingDefault ? remainingDefault.id : '',
                });
              }

              await batch.commit();
              Toast.show({ type: 'success', text1: 'Wallet deleted ✓' });
              
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            } catch (err: any) {
              Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Could not delete wallet.' });
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  const walletOptions: { type: WalletType; icon: string; label: string }[] = [
    { type: 'cash', icon: '💵', label: 'Cash' },
    { type: 'bank', icon: '🏦', label: 'Bank Account' },
    { type: 'credit', icon: '💳', label: 'Credit Card' },
  ];

  const POPULAR_BANKS = ['HDFC', 'SBI', 'ICICI', 'Axis', 'Kotak'];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.sheet}>
        <View style={styles.dragHandle} />
        <View style={styles.header}>
          <Text style={styles.sheetTitle}>{isEdit ? 'Edit Wallet' : 'Add Wallet'}</Text>
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

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Type picker */}
          <Text style={styles.fieldLabel}>TYPE</Text>
          <View style={styles.typeGrid}>
            {walletOptions.map(({ type, icon, label }) => {
              const colors = getWalletColors(type, bankName);
              const sel = walletType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeCard, { backgroundColor: colors.bg }, sel && styles.typeCardSelected]}
                  onPress={() => {
                    setWalletType(type);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={{ fontSize: 24 }}>{icon}</Text>
                  <Text style={[styles.typeCardLabel, { color: colors.text }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Bank name */}
          {walletType !== 'cash' && (
            <>
              <Text style={styles.fieldLabel}>BANK NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. HDFC, SBI"
                placeholderTextColor={Colors.mutedStone}
                value={bankName}
                onChangeText={setBankName}
                autoCapitalize="words"
              />
              {/* Popular Banks */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bankPillRow}>
                {POPULAR_BANKS.map((b) => {
                  const isActive = bankName.toLowerCase().includes(b.toLowerCase());
                  return (
                    <TouchableOpacity
                      key={b}
                      style={[styles.bankPill, isActive && styles.bankPillActive]}
                      onPress={() => {
                        setBankName(b);
                        Haptics.selectionAsync();
                      }}
                    >
                      <Text style={[styles.bankPillText, isActive && styles.bankPillTextActive]}>
                        {b}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* Custom name */}
          <Text style={styles.fieldLabel}>NICKNAME (OPTIONAL)</Text>
          <TextInput
            style={styles.input}
            placeholder={resolvedName()}
            placeholderTextColor={Colors.mutedStone}
            value={walletName}
            onChangeText={setWalletName}
          />

          {/* Starting balance / Owed */}
          <Text style={styles.fieldLabel}>
            {walletType === 'credit' ? 'OUTSTANDING BALANCE / AMOUNT OWED (₹)' : 'STARTING BALANCE (₹)'}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor={Colors.mutedStone}
            keyboardType="decimal-pad"
            value={initialBalance}
            onChangeText={setInitialBalance}
          />

          {/* Credit Limit fields */}
          {walletType === 'credit' && (
            <>
              <Text style={styles.fieldLabel}>MONTHLY USAGE CAP / LIMIT (₹)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 50,000"
                placeholderTextColor={Colors.mutedStone}
                keyboardType="decimal-pad"
                value={creditLimit}
                onChangeText={setCreditLimit}
              />

              <View style={styles.rowInputs}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>STATEMENT DAY (1–31)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 15"
                    placeholderTextColor={Colors.mutedStone}
                    keyboardType="number-pad"
                    value={billingCycleStartDay}
                    onChangeText={setBillingCycleStartDay}
                    maxLength={2}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>PAYMENT DUE DAY (1–31)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 5"
                    placeholderTextColor={Colors.mutedStone}
                    keyboardType="number-pad"
                    value={paymentDueDay}
                    onChangeText={setPaymentDueDay}
                    maxLength={2}
                  />
                </View>
              </View>
            </>
          )}

          {/* Default Wallet Option */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Set as Default</Text>
              <Text style={styles.toggleSub}>Used automatically for new transactions</Text>
            </View>
            <Switch
              value={isDefault}
              onValueChange={setIsDefault}
              trackColor={{ true: Colors.carbonBlack, false: Colors.ghostGray }}
              thumbColor={Colors.polarWhite}
              ios_backgroundColor={Colors.ghostGray}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={Colors.polarWhite} />
            ) : (
              <Text style={styles.saveBtnText}>{isEdit ? 'Save Changes' : 'Add Wallet'}</Text>
            )}
          </TouchableOpacity>

          {isEdit && (
            <TouchableOpacity
              style={[styles.deleteBtn, saving && { opacity: 0.6 }]}
              onPress={handleDelete}
              disabled={saving}
            >
              <Text style={styles.deleteBtnText}>Delete Wallet</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
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
    marginBottom: Spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  sheetTitle: {
    ...Typography.heading,
    fontSize: FontSize['4xl'],
    color: Colors.carbonBlack,
    letterSpacing: -1,
  },
  cancelText: { ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.mutedStone },
  fieldLabel: {
    ...Typography.bodyBold,
    fontSize: FontSize.xs,
    color: Colors.mutedStone,
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.base,
  },
  typeGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.base,
  },
  typeCard: {
    flex: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeCardSelected: { borderColor: Colors.carbonBlack },
  typeCardLabel: { ...Typography.bodyBold, fontSize: FontSize.sm },
  input: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
    marginBottom: Spacing.sm,
  },
  pillRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  pill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.ghostGray,
  },
  pillActive: { backgroundColor: Colors.carbonBlack },
  pillText: { ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.carbonBlack },
  pillTextActive: { color: Colors.polarWhite },
  saveBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  saveBtnText: { ...Typography.bodyBold, fontSize: FontSize.lg, color: Colors.polarWhite },
  rowInputs: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  deleteBtn: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  deleteBtnText: { ...Typography.bodyBold, fontSize: FontSize.lg, color: Colors.danger },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  toggleTitle: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  toggleSub: {
    ...Typography.body,
    fontSize: FontSize.xs,
    color: Colors.mutedStone,
    marginTop: 2,
  },
  bankPillRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  bankPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: Colors.ghostGray,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bankPillActive: {
    backgroundColor: Colors.carbonBlack,
  },
  bankPillText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.carbonBlack,
  },
  bankPillTextActive: {
    color: Colors.polarWhite,
  },
});
