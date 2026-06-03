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
  Colors, FontSize, Radius, Spacing, Typography, getWalletColors,
} from '../../constants/theme';
import { Wallet } from '../../types/models';
import { BigWalletSkeleton } from '../../components/Skeleton';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

// ── Wallet Card ───────────────────────────────
function BigWalletCard({
  wallet,
  spentThisMonth,
  isSelectionMode,
  isSelected,
  onPress,
  onLongPress,
}: {
  wallet: Wallet;
  spentThisMonth: number;
  isSelectionMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const colors = getWalletColors(wallet.type, wallet.bankName);
  const isLight = wallet.type !== 'credit';
  const icon = wallet.type === 'cash' ? '💵'
    : wallet.type === 'credit' ? '💳'
    : '🏦';

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
    >
      <View style={[styles.bigCard, { backgroundColor: colors.bg }]}>
        {/* Top row */}
        <View style={styles.bigCardTop}>
          {isSelectionMode && (
            <View style={[
              styles.checkbox,
              { borderColor: colors.text },
              isSelected && { backgroundColor: colors.text }
            ]}>
              {isSelected && <Text style={[styles.checkMark, { color: colors.bg }]}>✓</Text>}
            </View>
          )}
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

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const walletSpend: Record<string, number> = {};
  monthly.forEach((e) => {
    walletSpend[e.walletId] = (walletSpend[e.walletId] ?? 0) + e.amount;
  });

  const handleToggleSelect = (walletId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(walletId)) {
        next.delete(walletId);
      } else {
        next.add(walletId);
      }
      return next;
    });
  };

  const handleLongPress = (wallet: Wallet) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isSelectionMode) {
      handleToggleSelect(wallet.id);
    } else {
      setSelectedWallet(wallet);
    }
  };

  const handleCardPress = (wallet: Wallet) => {
    if (isSelectionMode) {
      handleToggleSelect(wallet.id);
    } else {
      router.push({ pathname: '/modals/wallet-report', params: { walletId: wallet.id } });
    }
  };

  const handleDelete = () => {
    if (!selectedWallet || !user) return;
    const w = selectedWallet;
    setSelectedWallet(null);

    Alert.alert(
      'Delete Wallet',
      `Delete "${w.name}"? All expenses, EMIs, and recurring payments linked to this wallet will also be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const batch = writeBatch(db);
              
              // 1. Delete all expenses for this wallet
              const expSnap = await getDocs(
                query(
                  collection(db, 'expenses'),
                  where('uid', '==', user.uid),
                  where('walletId', '==', w.id),
                ),
              );
              expSnap.docs.forEach((d) => batch.delete(d.ref));

              // 2. Delete all EMIs for this wallet
              const emiSnap = await getDocs(
                query(
                  collection(db, 'emis'),
                  where('uid', '==', user.uid),
                  where('walletId', '==', w.id),
                ),
              );
              emiSnap.docs.forEach((d) => batch.delete(d.ref));

              // 3. Delete all recurring payments for this wallet
              const recSnap = await getDocs(
                query(
                  collection(db, 'recurring'),
                  where('uid', '==', user.uid),
                  where('walletId', '==', w.id),
                ),
              );
              recSnap.docs.forEach((d) => batch.delete(d.ref));

              // 4. Delete the wallet itself
              batch.delete(doc(db, 'wallets', w.id));

              // 5. Update user's defaultWalletId if it was deleted
              if (w.isDefault) {
                const nextDefault = wallets.find((wl) => wl.id !== w.id);
                if (nextDefault) {
                  batch.update(doc(db, 'wallets', nextDefault.id), { isDefault: true });
                  batch.update(doc(db, 'users', user.uid), { defaultWalletId: nextDefault.id });
                } else {
                  batch.update(doc(db, 'users', user.uid), { defaultWalletId: '' });
                }
              }

              await batch.commit();
              try {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (e) {}
              Toast.show({ type: 'success', text1: `"${w.name}" deleted` });
            } catch (err: any) {
              Toast.show({ type: 'error', text1: 'Delete failed', text2: err.message });
            }
          },
        },
      ],
    );
  };

  const handleDeleteMultiple = () => {
    if (selectedIds.size === 0 || !user) return;
    const idsToDelete = Array.from(selectedIds);

    Alert.alert(
      'Delete Wallets',
      `Delete the ${idsToDelete.length} selected wallets? All associated expenses, EMIs, and recurring payments will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              const batch = writeBatch(db);

              // 1. Fetch and delete expenses in chunks of 10
              const expRefs: any[] = [];
              for (let i = 0; i < idsToDelete.length; i += 10) {
                const chunk = idsToDelete.slice(i, i + 10);
                const expSnap = await getDocs(
                  query(
                    collection(db, 'expenses'),
                    where('uid', '==', user.uid),
                    where('walletId', 'in', chunk),
                  ),
                );
                expRefs.push(...expSnap.docs.map(d => d.ref));
              }
              expRefs.forEach((ref) => batch.delete(ref));

              // 2. Fetch and delete EMIs in chunks of 10
              const emiRefs: any[] = [];
              for (let i = 0; i < idsToDelete.length; i += 10) {
                const chunk = idsToDelete.slice(i, i + 10);
                const emiSnap = await getDocs(
                  query(
                    collection(db, 'emis'),
                    where('uid', '==', user.uid),
                    where('walletId', 'in', chunk),
                  ),
                );
                emiRefs.push(...emiSnap.docs.map(d => d.ref));
              }
              emiRefs.forEach((ref) => batch.delete(ref));

              // 3. Fetch and delete recurring payments in chunks of 10
              const recRefs: any[] = [];
              for (let i = 0; i < idsToDelete.length; i += 10) {
                const chunk = idsToDelete.slice(i, i + 10);
                const recSnap = await getDocs(
                  query(
                    collection(db, 'recurring'),
                    where('uid', '==', user.uid),
                    where('walletId', 'in', chunk),
                  ),
                );
                recRefs.push(...recSnap.docs.map(d => d.ref));
              }
              recRefs.forEach((ref) => batch.delete(ref));

              // 4. Delete the wallets themselves
              idsToDelete.forEach((id) => {
                batch.delete(doc(db, 'wallets', id));
              });

              // 5. Update user's defaultWalletId if it was deleted
              const defaultWalletToDelete = wallets.find((w) => w.isDefault && idsToDelete.includes(w.id));
              if (defaultWalletToDelete) {
                const nextDefault = wallets.find((wl) => !idsToDelete.includes(wl.id));
                if (nextDefault) {
                  batch.update(doc(db, 'wallets', nextDefault.id), { isDefault: true });
                  batch.update(doc(db, 'users', user.uid), { defaultWalletId: nextDefault.id });
                } else {
                  batch.update(doc(db, 'users', user.uid), { defaultWalletId: '' });
                }
              }

              await batch.commit();
              try {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (e) {}

              Toast.show({ type: 'success', text1: `${idsToDelete.length} wallets deleted` });
              setIsSelectionMode(false);
              setSelectedIds(new Set());
            } catch (err: any) {
              Toast.show({ type: 'error', text1: 'Deletion failed', text2: err.message });
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
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
      Toast.show({ type: 'success', text1: `"${w.name}" is now your default` });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: err.message });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isSelectionMode
            ? (selectedIds.size === 0 ? 'Select' : `${selectedIds.size} Selected`)
            : 'Wallets'
          }
        </Text>
        <View style={styles.headerRight}>
          {isSelectionMode ? (
            <>
              {selectedIds.size > 0 && (
                <TouchableOpacity
                  style={[styles.headerBtn, { marginRight: Spacing.sm }]}
                  onPress={handleDeleteMultiple}
                >
                  <Text style={[styles.headerBtnText, { color: Colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => {
                  setIsSelectionMode(false);
                  setSelectedIds(new Set());
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={styles.headerBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {wallets.length > 0 && (
                <TouchableOpacity
                  style={[styles.headerBtn, { marginRight: Spacing.sm }]}
                  onPress={() => {
                    setIsSelectionMode(true);
                    setSelectedIds(new Set());
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={styles.headerBtnText}>Select</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => router.push('/modals/add-wallet')}
              >
                <Text style={styles.addBtnText}>+ Add</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
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
          <Text style={styles.hint}>
            {isSelectionMode ? 'Tap cards to select' : 'Hold a wallet for options'}
          </Text>
          {wallets.map((w) => (
            <BigWalletCard
              key={w.id}
              wallet={w}
              spentThisMonth={walletSpend[w.id] ?? 0}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIds.has(w.id)}
              onPress={() => handleCardPress(w)}
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
    fontSize: FontSize['4xl'],
    color: Colors.carbonBlack,
    letterSpacing: -1.5,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  headerBtnText: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.carbonBlack,
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
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: 11,
    fontWeight: 'bold',
    lineHeight: 12,
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
