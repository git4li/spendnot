// ─────────────────────────────────────────────
//  SPENDNOT — Add Wallet Modal
//  app/modals/add-wallet.tsx
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { collection, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  WalletType, WalletColors,
} from '../../constants/theme';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

type UpiApp = 'gpay' | 'phonepe' | 'other';

export default function AddWalletModal() {
  const [walletType, setWalletType] = useState<WalletType>('cash');
  const [bankName, setBankName] = useState('');
  const [upiApp, setUpiApp] = useState<UpiApp>('gpay');
  const [walletName, setWalletName] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [saving, setSaving] = useState(false);
  const user = auth.currentUser!;

  const resolvedName = (): string => {
    if (walletName.trim()) return walletName.trim();
    switch (walletType) {
      case 'cash': return 'Cash';
      case 'credit': return bankName.trim() ? `${bankName.trim()} Credit` : 'Credit Card';
      case 'upi-gpay': return bankName.trim() ? `GPay – ${bankName.trim()}` : 'GPay';
      case 'upi-phonepe': return 'PhonePe';
      case 'upi-other': return bankName.trim() ? `UPI – ${bankName.trim()}` : 'UPI';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const balance = parseFloat(initialBalance.replace(/,/g, '')) || 0;
      const ref = await addDoc(collection(db, 'wallets'), {
        uid: user.uid,
        name: resolvedName(),
        type: walletType,
        upiApp: walletType.startsWith('upi') ? upiApp : null,
        bankName: bankName.trim() || null,
        balance,
        isDefault: false,
        createdAt: Timestamp.now(),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Wallet added ✓' });
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save wallet.');
    } finally {
      setSaving(false);
    }
  };

  const walletOptions: { type: WalletType; icon: string; label: string }[] = [
    { type: 'cash', icon: '💵', label: 'Cash' },
    { type: 'credit', icon: '💳', label: 'Credit Card' },
    { type: 'upi-gpay', icon: '📱', label: 'UPI' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.sheet}>
        <View style={styles.dragHandle} />
        <Text style={styles.sheetTitle}>Add Wallet</Text>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Type picker */}
          <Text style={styles.fieldLabel}>TYPE</Text>
          <View style={styles.typeGrid}>
            {walletOptions.map(({ type, icon, label }) => {
              const colors = WalletColors[type];
              const sel = type === 'upi-gpay'
                ? walletType.startsWith('upi')
                : walletType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeCard, { backgroundColor: colors.bg }, sel && styles.typeCardSelected]}
                  onPress={() => {
                    if (type === 'upi-gpay') { setWalletType('upi-gpay'); setUpiApp('gpay'); }
                    else setWalletType(type);
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
            </>
          )}

          {/* UPI app */}
          {walletType.startsWith('upi') && (
            <>
              <Text style={styles.fieldLabel}>UPI APP</Text>
              <View style={styles.pillRow}>
                {(['gpay', 'phonepe', 'other'] as UpiApp[]).map((app) => (
                  <TouchableOpacity
                    key={app}
                    style={[styles.pill, upiApp === app && styles.pillActive]}
                    onPress={() => {
                      setUpiApp(app);
                      const map: Record<UpiApp, WalletType> = { gpay: 'upi-gpay', phonepe: 'upi-phonepe', other: 'upi-other' };
                      setWalletType(map[app]);
                      Haptics.selectionAsync();
                    }}
                  >
                    <Text style={[styles.pillText, upiApp === app && styles.pillTextActive]}>
                      {app === 'gpay' ? 'GPay' : app === 'phonepe' ? 'PhonePe' : 'Other'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
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

          {/* Starting balance */}
          <Text style={styles.fieldLabel}>STARTING BALANCE (₹)</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor={Colors.mutedStone}
            keyboardType="decimal-pad"
            value={initialBalance}
            onChangeText={setInitialBalance}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={Colors.polarWhite} /> : <Text style={styles.saveBtnText}>Add Wallet</Text>}
          </TouchableOpacity>
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
  sheetTitle: {
    ...Typography.heading,
    fontSize: FontSize['4xl'],
    color: Colors.carbonBlack,
    letterSpacing: -1,
    marginBottom: Spacing.xl,
  },
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
});
