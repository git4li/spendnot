// ─────────────────────────────────────────────
//  SPENDNOT — Dashboard (Screen 2)
//  app/(tabs)/index.tsx
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { WalletCardSkeleton, SummaryCardSkeleton, ExpenseRowSkeleton } from '../../components/Skeleton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useWallets } from '../../hooks/useWallets';
import { useExpenses, useMonthlyExpenses } from '../../hooks/useExpenses';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  WalletColors, getCategoryDef,
} from '../../constants/theme';
import { Wallet, Expense } from '../../types/models';
import { Timestamp } from 'firebase/firestore';

// ── Wallet Mini Card ─────────────────────────
function WalletMiniCard({ wallet, onPress }: { wallet: Wallet; onPress: () => void }) {
  const colors = WalletColors[wallet.type] ?? { bg: Colors.ghostGray, text: Colors.carbonBlack };
  return (
    <TouchableOpacity
      style={[styles.walletMiniCard, { backgroundColor: colors.bg }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.walletMiniLabel, { color: colors.text, opacity: 0.6 }]}>
        {wallet.name}
      </Text>
      <Text style={[styles.walletMiniAmount, { color: colors.text }]}>
        ₹{wallet.balance.toLocaleString('en-IN')}
      </Text>
      {wallet.isDefault && (
        <View style={styles.defaultBadge}>
          <Text style={styles.defaultBadgeText}>DEFAULT</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Expense Row ──────────────────────────────
function ExpenseRow({ expense, walletName }: { expense: Expense; walletName: string }) {
  const cat = getCategoryDef(expense.category);
  const date = expense.date.toDate();
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const dateStr = isToday
    ? `Today, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    : isYesterday
    ? 'Yesterday'
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <View style={styles.expenseRow}>
      <View style={styles.expenseEmoji}>
        <Text style={{ fontSize: 18 }}>{cat.emoji}</Text>
      </View>
      <View style={styles.expenseInfo}>
        <Text style={styles.expenseCat}>{cat.label}</Text>
        <Text style={styles.expenseWallet}>{walletName}</Text>
      </View>
      <View style={styles.expenseRight}>
        <Text style={[styles.expenseAmount, { color: expense.type === 'income' ? Colors.income : Colors.expense }]}>
          {expense.type === 'income' ? '+' : '−'}₹{expense.amount.toLocaleString('en-IN')}
        </Text>
        <Text style={styles.expenseTime}>{dateStr}</Text>
      </View>
    </View>
  );
}

// ── Empty State ──────────────────────────────
function EmptyExpenses() {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyEmoji}>🧾</Text>
      <Text style={styles.emptyTitle}>No expenses yet</Text>
      <Text style={styles.emptyText}>Tap the + button to log your first transaction.</Text>
    </View>
  );
}

// ── Dashboard ────────────────────────────────
export default function DashboardScreen() {
  const { user } = useAuth();
  const { wallets, loading: walletsLoading } = useWallets();
  const { expenses, loading: expensesLoading } = useExpenses(10);
  const { totalSpent, totalIncome } = useMonthlyExpenses();

  const firstName = user?.displayName?.split(' ')[0] ?? 'there';
  const savings = totalIncome - totalSpent;

  const walletMap: Record<string, string> = {};
  wallets.forEach((w) => { walletMap[w.id] = w.name; });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greeting}>Hi, {firstName}! 👋</Text>
            <Text style={styles.greetingSub}>Let's see where it went.</Text>
          </View>
          <TouchableOpacity style={styles.bellBtn}>
            <Text style={{ fontSize: 18 }}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Wallet Cards Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.walletScroll}
          style={styles.walletScrollOuter}
        >
          {walletsLoading ? (
            <>
              <WalletCardSkeleton />
              <WalletCardSkeleton />
            </>
          ) : (
            <>
              {wallets.map((w) => (
                <WalletMiniCard
                  key={w.id}
                  wallet={w}
                  onPress={() => router.push({ pathname: '/modals/wallet-report', params: { walletId: w.id } })}
                />
              ))}
              <TouchableOpacity
                style={styles.addWalletCard}
                onPress={() => router.push('/modals/add-wallet')}
                activeOpacity={0.7}
              >
                <Text style={styles.addWalletText}>+ Add{'\n'}Wallet</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        {/* Summary Card */}
        {walletsLoading ? (
          <SummaryCardSkeleton />
        ) : null}
        <View style={[styles.summaryCard, walletsLoading && { display: 'none' }]}>
          <Text style={styles.summaryMonth}>This Month</Text>
          <Text style={styles.summaryAmount}>₹{totalSpent.toLocaleString('en-IN')}</Text>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryStatLabel}>Income</Text>
              <Text style={[styles.summaryStatVal, { color: Colors.income }]}>
                ₹{totalIncome.toLocaleString('en-IN')}
              </Text>
            </View>
            <View>
              <Text style={styles.summaryStatLabel}>Expenses</Text>
              <Text style={[styles.summaryStatVal, { color: Colors.expense }]}>
                ₹{totalSpent.toLocaleString('en-IN')}
              </Text>
            </View>
            <View>
              <Text style={styles.summaryStatLabel}>Savings</Text>
              <Text style={[styles.summaryStatVal, { color: Colors.savings }]}>
                ₹{savings.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        </View>

        {/* Recent Expenses */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/reports')}>
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>

        {expensesLoading ? (
          <View style={styles.expenseList}>
            {[1,2,3].map(i => <ExpenseRowSkeleton key={i} />)}
          </View>
        ) : expenses.length === 0 ? (
          <EmptyExpenses />
        ) : (
          <View style={styles.expenseList}>
            {expenses.slice(0, 5).map((e) => (
              <ExpenseRow key={e.id} expense={e} walletName={walletMap[e.walletId] ?? '—'} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvasIce },
  scrollContent: { paddingBottom: 120 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    marginBottom: Spacing.lg,
  },
  greeting: {
    ...Typography.heading,
    fontSize: FontSize['4xl'],
    color: Colors.carbonBlack,
    letterSpacing: -1,
  },
  greetingSub: {
    ...Typography.body,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
    marginTop: 2,
  },
  bellBtn: {
    width: 40, height: 40,
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.ghostGray,
  },
  walletScrollOuter: { marginHorizontal: 0 },
  walletScroll: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  walletMiniCard: {
    width: 160,
    height: 90,
    borderRadius: 20,
    padding: Spacing.md,
    justifyContent: 'space-between',
    position: 'relative',
  },
  walletMiniLabel: {
    ...Typography.bodyBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  walletMiniAmount: {
    ...Typography.heading,
    fontSize: FontSize['2xl'],
    letterSpacing: -0.5,
  },
  defaultBadge: {
    position: 'absolute',
    top: 8, right: 8,
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    ...Typography.bodyBold,
    fontSize: 8,
    color: Colors.polarWhite,
    letterSpacing: 0.5,
  },
  addWalletCard: {
    width: 100,
    height: 90,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.ghostGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addWalletText: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.base,
  },
  summaryMonth: {
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.softStone,
  },
  summaryAmount: {
    ...Typography.heading,
    fontSize: FontSize['7xl'],
    color: Colors.polarWhite,
    letterSpacing: -2,
    marginVertical: Spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryStatLabel: {
    ...Typography.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.softStone,
  },
  summaryStatVal: {
    ...Typography.heading,
    fontSize: FontSize.lg,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.bodyBold,
    fontSize: FontSize.lg,
    color: Colors.carbonBlack,
  },
  seeAll: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
  },
  expenseList: { paddingHorizontal: Spacing.lg },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ghostGray,
    gap: Spacing.md,
  },
  expenseEmoji: {
    width: 38, height: 38,
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseInfo: { flex: 1 },
  expenseCat: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  expenseWallet: {
    ...Typography.body,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    marginTop: 2,
  },
  expenseRight: { alignItems: 'flex-end' },
  expenseAmount: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
  },
  expenseTime: {
    ...Typography.body,
    fontSize: FontSize.xs,
    color: Colors.mutedStone,
    marginTop: 2,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
  },
  emptyEmoji: { fontSize: 40, marginBottom: Spacing.base },
  emptyTitle: {
    ...Typography.bodyBold,
    fontSize: FontSize.lg,
    color: Colors.carbonBlack,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
    textAlign: 'center',
  },
});
