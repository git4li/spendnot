// ─────────────────────────────────────────────
//  SPENDNOT — Profile & Settings Screen (Screen 8)
//  app/(tabs)/profile.tsx
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { doc, deleteDoc, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useWallets } from '../../hooks/useWallets';
import {
  Colors, FontSize, Radius, Spacing, Typography,
} from '../../constants/theme';
import Toast from 'react-native-toast-message';
import { exportToExcel } from '../../lib/export';
import { useExpenses } from '../../hooks/useExpenses';

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
}: {
  label: string;
  right?: React.ReactNode;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.settingsRow}
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
  const { user } = useAuth();
  const { wallets } = useWallets();
  const { expenses } = useExpenses(1000);
  const [notifs, setNotifs] = useState(true);

  const displayName = user?.displayName ?? 'User';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const defaultWallet = wallets.find((w) => w.isDefault);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and ALL your data (expenses, wallets, budgets). This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
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
              // Auth state change will redirect to login automatically
            } catch (err: any) {
              if (err.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Re-authentication required',
                  'Please sign out and sign back in, then try deleting your account again.',
                );
              } else {
                Alert.alert('Error', err.message);
              }
            }
          },
        },
      ],
    );
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all your expenses, wallets, and budgets. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            const batch = writeBatch(db);
            const colls = ['expenses', 'wallets', 'budgets', 'recurring'];
            for (const coll of colls) {
              const snap = await getDocs(
                query(collection(db, coll), where('uid', '==', user.uid)),
              );
              snap.docs.forEach((d) => batch.delete(d.ref));
            }
            await batch.commit();
            Toast.show({ type: 'success', text1: 'All data cleared.' });
          },
        },
      ],
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
          <TouchableOpacity>
            <Text style={{ fontSize: 18 }}>✏️</Text>
          </TouchableOpacity>
        </View>

        {/* PREFERENCES */}
        <SectionLabel label="PREFERENCES" />
        <View style={styles.card}>
          <SettingsRow
            label="Currency"
            right={<Text style={styles.rowValue}>₹ INR</Text>}
          />
          <SettingsRow
            label="Default Wallet"
            right={
              defaultWallet ? (
                <View style={styles.limeDot} />
              ) : null
            }
            onPress={() => {}}
          />
          <View style={[styles.settingsRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.settingsRowLabel}>Notifications</Text>
            <Switch
              value={notifs}
              onValueChange={setNotifs}
              trackColor={{ true: Colors.carbonBlack, false: Colors.ghostGray }}
              thumbColor={Colors.polarWhite}
              ios_backgroundColor={Colors.ghostGray}
            />
          </View>
        </View>

        {/* CATEGORIES */}
        <SectionLabel label="CATEGORIES" />
        <View style={styles.card}>
          <SettingsRow
            label="Manage Categories"
            right={<Text style={styles.rowValue}>8 categories</Text>}
            onPress={() => {}}
          />
        </View>

        {/* DATA */}
        <SectionLabel label="DATA" />
        <View style={styles.card}>
          <SettingsRow label="Export All Data" onPress={handleExport} />
          <SettingsRow label="Import Data" onPress={() => {}} />
          <SettingsRow label="Clear All Data" danger onPress={handleClearData} />
        </View>

        {/* ACCOUNT */}
        <SectionLabel label="ACCOUNT" />
        <View style={styles.card}>
          <SettingsRow label="Change Password" onPress={() => {}} />
          <SettingsRow
            label="Sign Out"
            danger
            onPress={handleSignOut}
          />
          <View style={[styles.settingsRow, { borderBottomWidth: 0 }]}>
            <TouchableOpacity onPress={handleDeleteAccount}>
              <Text style={[styles.settingsRowLabel, { color: Colors.danger, fontSize: FontSize.md }]}>
                Delete Account
              </Text>
            </TouchableOpacity>
          </View>
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
