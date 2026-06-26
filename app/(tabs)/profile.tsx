// ─────────────────────────────────────────────
//  SPENDNOT — Profile & Settings Screen (Screen 8)
//  app/(tabs)/profile.tsx
// ─────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, deleteDoc, collection, getDocs, query, where, writeBatch, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useWallets } from '../../hooks/useWallets';
import {
  Colors, FontSize, Radius, Spacing, Typography, CATEGORIES,
} from '../../constants/theme';
import Toast from 'react-native-toast-message';
import { exportToExcel } from '../../lib/export';
import { useExpenses } from '../../hooks/useExpenses';
import { confirmAction } from '../../lib/confirm';
import { Wallet } from '../../types/models';

function SectionLabel({ label }: { label: string }) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionLabelText}>{label}</Text>
    </View>
  );
}

function SettingsRow({
  label,
  right,
  danger = false,
  onPress,
  isLast = false,
}: {
  label: string;
  right?: React.ReactNode;
  danger?: boolean;
  onPress?: () => void;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.settingsRow, isLast && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <Text style={[styles.settingsRowLabel, danger && styles.dangerText]}>{label}</Text>
      <View style={styles.settingsRowRight}>
        {right}
        {onPress && <Text style={[styles.chevron, danger && { color: Colors.powerPink }]}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, profile } = useAuth();
  const { wallets } = useWallets();
  const { expenses } = useExpenses(1000);
  const displayName = user?.displayName ?? 'User';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const defaultWallet = wallets.find((w) => w.isDefault);

  const currencyCode = profile?.currency ?? 'INR';
  const currencyLabel = currencyCode === 'INR' ? '₹ INR' : currencyCode === 'USD' ? '$ USD' : currencyCode === 'EUR' ? '€ EUR' : '£ GBP';

  const updateCurrency = async (curr: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { currency: curr });
      Toast.show({ type: 'success', text1: 'Currency updated ✓', text2: `Set to ${curr}` });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: e.message });
    }
  };

  const handleCurrencyPress = () => {
    Alert.alert(
      'Select Currency',
      'Choose your preferred currency:',
      [
        { text: '₹ INR', onPress: () => updateCurrency('INR') },
        { text: '$ USD', onPress: () => updateCurrency('USD') },
        { text: '€ EUR', onPress: () => updateCurrency('EUR') },
        { text: '£ GBP', onPress: () => updateCurrency('GBP') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const updateDefaultWallet = async (w: Wallet) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      wallets.forEach((wl) => {
        batch.update(doc(db, 'wallets', wl.id), { isDefault: wl.id === w.id });
      });
      await batch.commit();
      await updateDoc(doc(db, 'users', user.uid), { defaultWalletId: w.id });
      Toast.show({ type: 'success', text1: 'Default wallet updated ✓', text2: `Set to ${w.name}` });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: e.message });
    }
  };

  const handleDefaultWalletPress = () => {
    if (wallets.length === 0) {
      Toast.show({ type: 'info', text1: 'No wallets', text2: 'Please create a wallet first.' });
      return;
    }
    Alert.alert(
      'Select Default Wallet',
      'Choose the wallet to be used by default:',
      [
        ...wallets.map((w) => ({
          text: w.name,
          onPress: () => updateDefaultWallet(w),
        })),
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const handleSignOut = () => {
    confirmAction(
      'Sign Out',
      'Are you sure you want to sign out?',
      () => signOut(auth),
      'Sign Out'
    );
  };

  const handleDeleteAccount = () => {
    confirmAction(
      'Delete Account',
      'This will permanently delete your account and ALL your data (expenses, wallets, budgets). This cannot be undone.',
      async () => {
        if (!user) return;
        try {
          // Delete all user data first
          const batch = writeBatch(db);
          const colls = ['expenses', 'wallets', 'budgets', 'recurring'];
          for (const coll of colls) {
            const snap = await getDocs(
              query(collection(db, coll), where('uid', '==', user.uid)),
            );
            snap.docs.forEach((d) => batch.delete(d.ref));
          }
          // Delete user doc
          batch.delete(doc(db, 'users', user.uid));
          await batch.commit();
          // Delete the Firebase Auth account
          await user.delete();
        } catch (err: any) {
          if (err.code === 'auth/requires-recent-login') {
            confirmAction(
              'Re-authentication required',
              'Please sign out and sign back in, then try deleting your account again.',
              () => signOut(auth),
              'Sign Out'
            );
          } else {
            Toast.show({ type: 'error', text1: 'Error', text2: err.message });
          }
        }
      },
      'Delete Forever'
    );
  };

  const handleClearData = () => {
    confirmAction(
      'Clear All Data',
      'This will permanently delete all your expenses, wallets, and budgets. This cannot be undone.',
      async () => {
        if (!user) return;
        try {
          const batch = writeBatch(db);
          const colls = ['expenses', 'wallets', 'budgets', 'recurring'];
          for (const coll of colls) {
            const snap = await getDocs(
              query(collection(db, coll), where('uid', '==', user.uid)),
            );
            snap.docs.forEach((d) => batch.delete(d.ref));
          }
          await batch.commit();
          Toast.show({ type: 'success', text1: 'All data cleared ✓' });
        } catch (e: any) {
          Toast.show({ type: 'error', text1: 'Error', text2: e.message });
        }
      },
      'Delete Everything'
    );
  };

  const handleExport = async () => {
    try {
      await exportToExcel(expenses, wallets, []);
      Toast.show({ type: 'success', text1: 'Export ready!', text2: 'Check your Files app.' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Export failed', text2: e.message });
    }
  };

  const handleChangePassword = async () => {
    if (!user || !user.email) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      Toast.show({
        type: 'success',
        text1: 'Reset email sent ✓',
        text2: 'Check your inbox to change password.',
      });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Failed to send reset email', text2: e.message });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Profile</Text>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* User card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{displayName}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </View>

        {/* PREFERENCES */}
        <SectionLabel label="PREFERENCES" />
        <View style={styles.card}>
          <SettingsRow
            label="Currency"
            right={<Text style={styles.rowValue}>{currencyLabel}</Text>}
            onPress={handleCurrencyPress}
          />
          <SettingsRow
            label="Default Wallet"
            right={<Text style={styles.rowValue}>{defaultWallet?.name ?? 'None'}</Text>}
            onPress={handleDefaultWalletPress}
            isLast={true}
          />
        </View>

        {/* DATA */}
        <SectionLabel label="DATA" />
        <View style={styles.card}>
          <SettingsRow label="Export All Data" onPress={handleExport} />
          <SettingsRow label="Clear All Data" danger onPress={handleClearData} isLast={true} />
        </View>

        {/* ACCOUNT */}
        <SectionLabel label="ACCOUNT" />
        <View style={styles.card}>
          <SettingsRow label="Change Password" onPress={handleChangePassword} />
          <SettingsRow label="Sign Out" danger onPress={handleSignOut} />
          <SettingsRow label="Delete Account" danger onPress={handleDeleteAccount} isLast={true} />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvasIce },
  title: {
    ...Typography.heading,
    fontSize: FontSize['5xl'],
    color: Colors.carbonBlack,
    letterSpacing: -1.5,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.lg,
  },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  userCard: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.ghostGray,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 56, height: 56,
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: {
    ...Typography.heading,
    fontSize: FontSize['2xl'],
    color: Colors.polarWhite,
  },
  userName: {
    ...Typography.bodyBold,
    fontSize: FontSize.xl,
    color: Colors.carbonBlack,
  },
  userEmail: {
    ...Typography.body,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
    marginTop: 2,
  },
  sectionLabel: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    marginBottom: Spacing.xs,
    marginTop: Spacing.base,
    alignSelf: 'flex-start',
  },
  sectionLabelText: {
    ...Typography.bodyBold,
    fontSize: FontSize.xs,
    color: Colors.mutedStone,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.ghostGray,
    paddingHorizontal: Spacing.base,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ghostGray,
  },
  settingsRowLabel: {
    ...Typography.bodyMedium,
    fontSize: FontSize.md,
    color: Colors.carbonBlack,
  },
  settingsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowValue: {
    ...Typography.body,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
  },
  chevron: {
    fontSize: FontSize.xl,
    color: Colors.mutedStone,
  },
  dangerText: { color: Colors.powerPink },
  limeDot: {
    width: 10, height: 10,
    backgroundColor: Colors.limePop,
    borderRadius: Radius.full,
  },
});
