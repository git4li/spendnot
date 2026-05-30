// ─────────────────────────────────────────────
//  SPENDNOT — Wallets Screen (Screen 3)
//  app/(tabs)/wallets.tsx
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Modal,
  Pressable, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  doc, deleteDoc, updateDoc, writeBatch, collection,
  getDocs, query, where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useWallets } from '../../hooks/useWallets';
import { useMonthlyExpenses } from '../../hooks/useExpenses';
import {
  Colors, FontSize, Radius, Spacing, Typography, WalletColors,
} from '../../constants/theme';
import { Wallet } from '../../types/models';
import { BigWalletSkeleton } from '../../components/Skeleton';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

// ── Wallet Card ───────────────────────────────
function BigWalletCard({
  wallet,
  spentThisMonth,
  onLongPress,
}: {
  wallet: Wallet;
  spentThisMonth: number;
  onLongPress: () => void;
}) {
  const colors = WalletColors[wallet.type] ?? { bg: Colors.ghostGray, text: Colors.carbonBlack };
  const isLight = wallet.type !== 'credit';
  const icon = wallet.type === 'cash' ? '💵'
    : wallet.type === 'credit' ? '💳'
    : wallet.type === 'upi-gpay' ? '📱'
    : wallet.type === 'upi-phonepe' ? '📲'
    : '📳';

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <View style={[styles.bigCard, { backgroundColor: colors.bg }]}>
        {/* Top row */}
        <View style={styles.bigCardTop}>
          <Text style={{ fontSize: 18 }}>{icon}</Text>
          <Text style={[styles.bigCardName, { color: colors.text }]}>{wallet.name}</Text>
          {wallet.isDefault && (
            <View style={[
              styles.defaultBadge,
              { backgroundColor: isLight ? Colors.carbonBlack : Colors.polarWhite },
            ]}>
              <Text style={[
                styles.defaultBadgeText,
                { color: isLight ? Colors.polarWhite : Colors.carbonBlack },
              ]}>DEFAULT</Text>
            </View>
          )}
        </View>

        {/* Balance */}
        <Text style={[styles.bigCardAmount, { color: colors.text }]}>
          ₹{wallet.balance.toLocaleString('en-IN')}
        </Text>

        {/* Bottom row — Balance label + Spent this month */}
        <View style={styles.bigCardBottom}>
          <View>
            <Text style={[styles.bigCardLabel, { color: colors.text }]}>Balance</Text>
          </View>
          <View style={[
            styles.spentChip,
            { backgroundColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)' },
          ]}>
            <Text style={[styles.spentChipText, { color: colors.text }]}>
              ₹{spentThisMonth.toLocaleString('en-IN')} spent
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Action Sheet Modal ────────────────────────
function WalletActionSheet({
  wallet,
  visible,
  onClose,
  onDelete,
  onMakeDefault,
}: {
  wallet: Wallet | null;
  visible: boolean;
  onClose: () => void;
  onDelete: () => void;
  onMakeDefault: () => void;
}) {
  if (!wallet) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheet.backdrop} onPress={onClose} />
      <View style={sheet.container}>
        {/* Handle */}
        <View style={sheet.handle} />

        {/* Wallet name header */}
        <Text style={sheet.walletName}>{wallet.name}</Text>
        <Text style={sheet.walletSub}>₹{wallet.balance.toLocaleString('en-IN')} balance</Text>

        <View style={sheet.divider} />

        {/* Make Default */}
        {!wallet.isDefault && (
          <TouchableOpacity style={sheet.action} onPress={onMakeDefault} activeOpacity={0.7}>
            <Text style={sheet.actionIcon}>⭐</Text>
            <Text style={sheet.actionLabel}>Make Default</Text>
          </TouchableOpacity>
        )}

        {/* Delete */}
        <TouchableOpacity style={sheet.action} onPress={onDelete} activeOpacity={0.7}>
          <Text style={sheet.actionIcon}>🗑️</Text>
          <Text style={[sheet.actionLabel, { color: Colors.danger }]}>Delete Wallet</Text>
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity style={sheet.cancelBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={sheet.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────
export default function WalletsScreen() {
  const { user } = useAuth();
  const { wallets, loading } = useWallets();
  const { monthly } = useMonthlyExpenses();
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);

  const walletSpend: Record<string, number> = {};
  monthly.forEach((e) => {
    walletSpend[e.walletId] = (walletSpend[e.walletId] ?? 0) + e.amount;
  });

  const handleLongPress = (wallet: Wallet) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedWallet(wallet);
  };

  const handleDelete = () => {
    if (!selectedWallet || !user) return;
    const w = selectedWallet;
    setSelectedWallet(null);

    Alert.alert(
      'Delete Wallet',
      `Delete "${w.name}"? All expenses linked to this wallet will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const batch = writeBatch(db);
              // Delete all expenses for this wallet
              const expSnap = await getDocs(
                query(
                  collection(db, 'expenses'),
                  where('uid', '==', user.uid),
                  where('walletId', '==', w.id),
                ),
              );
              expSnap.docs.forEach((d) => batch.delete(d.ref));
              // Delete the wallet itself
              batch.delete(doc(db, 'wallets', w.id));
              await batch.commit();
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Toast.show({ type: 'success', text1: `"${w.name}" deleted` });
            } catch (err: any) {
              Toast.show({ type: 'error', text1: 'Delete failed', text2: err.message });
            }
          },
        },
      ],
    );
  };

  const handleMakeDefault = async () => {
    if (!selectedWallet || !user) return;
    const w = selectedWallet;
    setSelectedWallet(null);
    try {
      // Remove default from all wallets, then set new default
      const batch = writeBatch(db);
      wallets.forEach((wl) => {
        batch.update(doc(db, 'wallets', wl.id), { isDefault: wl.id === w.id });
      });
      await batch.commit();
      await updateDoc(doc(db, 'users', user.uid), { defaultWalletId: w.id });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: `"${w.name}" is now your default` });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: err.message });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Wallets</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/modals/add-wallet')}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ScrollView contentContainerStyle={styles.listContent}>
          <BigWalletSkeleton />
          <BigWalletSkeleton />
        </ScrollView>
      ) : wallets.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>👛</Text>
          <Text style={styles.emptyTitle}>No wallets yet</Text>
          <Text style={styles.emptyText}>Add your first wallet to start tracking.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/modals/add-wallet')}>
            <Text style={styles.emptyBtnText}>+ Add Wallet</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.hint}>Hold a wallet for options</Text>
          {wallets.map((w) => (
            <BigWalletCard
              key={w.id}
              wallet={w}
              spentThisMonth={walletSpend[w.id] ?? 0}
              onLongPress={() => handleLongPress(w)}
            />
          ))}
        </ScrollView>
      )}

      <WalletActionSheet
        wallet={selectedWallet}
        visible={!!selectedWallet}
        onClose={() => setSelectedWallet(null)}
        onDelete={handleDelete}
        onMakeDefault={handleMakeDefault}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvasIce },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.lg,
  },
  title: {
    ...Typography.heading,
    fontSize: FontSize['5xl'],
    color: Colors.carbonBlack,
    letterSpacing: -1.5,
  },
  addBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  addBtnText: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.polarWhite,
  },
  hint: {
    ...Typography.body,
    fontSize: FontSize.xs,
    color: Colors.mutedStone,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 120,
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  bigCard: {
    borderRadius: Radius['4xl'],
    height: 150,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    justifyContent: 'space-between',
  },
  bigCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bigCardName: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    flex: 1,
  },
  bigCardAmount: {
    ...Typography.heading,
    fontSize: FontSize['6xl'],
    letterSpacing: -1.5,
  },
  bigCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bigCardLabel: {
    ...Typography.body,
    fontSize: FontSize.xs,
    opacity: 0.6,
  },
  spentChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
  },
  spentChipText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.xs,
  },
  defaultBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  defaultBadgeText: {
    ...Typography.bodyBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: {
    ...Typography.bodyBold,
    fontSize: FontSize.xl,
    color: Colors.carbonBlack,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  emptyBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
  },
  emptyBtnText: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.polarWhite,
  },
});

const sheet = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  container: {
    backgroundColor: Colors.polarWhite,
    borderTopLeftRadius: Radius['4xl'],
    borderTopRightRadius: Radius['4xl'],
    paddingHorizontal: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    paddingTop: Spacing.base,
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.base,
  },
  walletName: {
    ...Typography.bodyBold,
    fontSize: FontSize.xl,
    color: Colors.carbonBlack,
    textAlign: 'center',
  },
  walletSub: {
    ...Typography.body,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: Spacing.base,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.ghostGray,
    marginBottom: Spacing.base,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  actionIcon: { fontSize: 20 },
  actionLabel: {
    ...Typography.bodyMedium,
    fontSize: FontSize.lg,
    color: Colors.carbonBlack,
  },
  cancelBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    ...Typography.bodyBold,
    fontSize: FontSize.md,
    color: Colors.carbonBlack,
  },
});
