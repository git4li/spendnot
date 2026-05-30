// ─────────────────────────────────────────────
//  SPENDNOT — Wallet Report Modal
//  app/modals/wallet-report.tsx
// ─────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import {
  collection, query, where, orderBy, getDocs,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { auth } from '../../lib/firebase';
import { useWallets } from '../../hooks/useWallets';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  WalletColors, getCategoryDef,
} from '../../constants/theme';
import { Expense } from '../../types/models';

import { Timestamp } from 'firebase/firestore';

function formatDate(ts: Timestamp): string {
  const d = ts.toDate();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function WalletReportModal() {
  const { walletId } = useLocalSearchParams<{ walletId: string }>();
  const { wallets } = useWallets();
  const { bottom } = useSafeAreaInsets();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const wallet = wallets.find((w) => w.id === walletId);
  const colors = wallet ? (WalletColors[wallet.type] ?? { bg: Colors.ghostGray, text: Colors.carbonBlack }) : { bg: Colors.ghostGray, text: Colors.carbonBlack };
  const isLight = wallet?.type !== 'credit';

  useEffect(() => {
    if (!walletId || !auth.currentUser) return;
    const q = query(
      collection(db, 'expenses'),
      where('uid', '==', auth.currentUser.uid),
      where('walletId', '==', walletId),
      orderBy('date', 'desc'),
    );
    getDocs(q).then((snap) => {
      setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense)));
      setLoading(false);
    });
  }, [walletId]);

  // This month stats
  const now = new Date();
  const monthlyExpenses = expenses.filter((e) => {
    const d = e.date.toDate();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalSpent = monthlyExpenses.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const totalReceived = monthlyExpenses.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);

  // Category breakdown
  const catBreakdown: Record<string, number> = {};
  monthlyExpenses.filter((e) => e.type === 'expense').forEach((e) => {
    catBreakdown[e.category] = (catBreakdown[e.category] ?? 0) + e.amount;
  });
  const topCats = Object.entries(catBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header card with wallet colours */}
      <View style={[styles.header, { backgroundColor: colors.bg }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={[styles.backArrow, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={[styles.walletName, { color: colors.text }]}>{wallet?.name ?? 'Wallet'}</Text>
          <Text style={[styles.walletBalance, { color: colors.text }]}>
            ₹{(wallet?.balance ?? 0).toLocaleString('en-IN')}
          </Text>
          <Text style={[styles.walletBalanceLabel, { color: colors.text, opacity: 0.6 }]}>Current balance</Text>
        </View>
        {/* This month summary */}
        <View style={styles.monthRow}>
          <View style={[styles.monthChip, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]}>
            <Text style={[styles.monthChipLabel, { color: colors.text, opacity: 0.7 }]}>SPENT</Text>
            <Text style={[styles.monthChipVal, { color: colors.text }]}>₹{totalSpent.toLocaleString('en-IN')}</Text>
          </View>
          <View style={[styles.monthChip, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]}>
            <Text style={[styles.monthChipLabel, { color: colors.text, opacity: 0.7 }]}>RECEIVED</Text>
            <Text style={[styles.monthChipVal, { color: colors.text }]}>₹{totalReceived.toLocaleString('en-IN')}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.carbonBlack} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Category breakdown */}
          {topCats.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>This Month — by Category</Text>
              <View style={styles.catGrid}>
                {topCats.map(([key, amt]) => {
                  const cat = getCategoryDef(key as any);
                  const pct = totalSpent > 0 ? Math.round((amt / totalSpent) * 100) : 0;
                  return (
                    <View key={key} style={styles.catCard}>
                      <Text style={styles.catEmoji}>{cat.emoji}</Text>
                      <Text style={styles.catLabel}>{cat.label}</Text>
                      <Text style={styles.catAmt}>₹{amt.toLocaleString('en-IN')}</Text>
                      <View style={styles.catBarBg}>
                        <View style={[styles.catBar, { width: `${pct}%` }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* All transactions */}
          <Text style={styles.sectionTitle}>All Transactions</Text>
          {expenses.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🧾</Text>
              <Text style={styles.emptyText}>No transactions yet for this wallet.</Text>
            </View>
          ) : (
            <View style={styles.txList}>
              {expenses.map((e) => {
                const cat = getCategoryDef(e.category);
                return (
                  <View key={e.id} style={styles.txRow}>
                    <View style={styles.txEmoji}>
                      <Text style={{ fontSize: 16 }}>{cat.emoji}</Text>
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={styles.txCat}>{cat.label}</Text>
                      {e.note ? <Text style={styles.txNote}>{e.note}</Text> : null}
                      <Text style={styles.txDate}>{formatDate(e.date)}</Text>
                    </View>
                    <Text style={[
                      styles.txAmt,
                      { color: e.type === 'income' ? Colors.income : Colors.expense },
                    ]}>
                      {e.type === 'income' ? '+' : '−'}₹{e.amount.toLocaleString('en-IN')}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvasIce },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  backBtn: { marginBottom: Spacing.md },
  backArrow: { fontSize: 22 },
  walletName: { ...Typography.bodyBold, fontSize: FontSize.base, opacity: 0.7 },
  walletBalance: {
    ...Typography.heading,
    fontSize: FontSize['7xl'],
    letterSpacing: -2,
    marginTop: 2,
  },
  walletBalanceLabel: { ...Typography.body, fontSize: FontSize.xs },
  monthRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.base },
  monthChip: {
    flex: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 2,
  },
  monthChipLabel: { ...Typography.bodyBold, fontSize: 9, letterSpacing: 0.6 },
  monthChipVal: { ...Typography.bodyBold, fontSize: FontSize.lg },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  sectionTitle: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
    marginBottom: Spacing.md,
    marginTop: Spacing.base,
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  catCard: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    width: '47%',
    gap: 4,
  },
  catEmoji: { fontSize: 20 },
  catLabel: { ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.carbonBlack },
  catAmt: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.carbonBlack },
  catBarBg: {
    height: 4, backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full, overflow: 'hidden', marginTop: 4,
  },
  catBar: { height: 4, backgroundColor: Colors.carbonBlack, borderRadius: Radius.full },
  txList: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.base,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ghostGray,
    gap: Spacing.md,
  },
  txEmoji: {
    width: 36, height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.ghostGray,
    alignItems: 'center', justifyContent: 'center',
  },
  txInfo: { flex: 1 },
  txCat: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.carbonBlack },
  txNote: { ...Typography.body, fontSize: FontSize.sm, color: Colors.mutedStone, marginTop: 1 },
  txDate: { ...Typography.body, fontSize: FontSize.xs, color: Colors.mutedStone, marginTop: 2 },
  txAmt: { ...Typography.bodyBold, fontSize: FontSize.base },
  emptyBox: { alignItems: 'center', paddingVertical: Spacing['3xl'] },
  emptyEmoji: { fontSize: 36, marginBottom: Spacing.sm },
  emptyText: { ...Typography.body, fontSize: FontSize.base, color: Colors.mutedStone, textAlign: 'center' },
});
