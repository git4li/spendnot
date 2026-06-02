// ─────────────────────────────────────────────
//  SPENDNOT — Dashboard (Screen 2)
//  app/(tabs)/index.tsx
// ─────────────────────────────────────────────
import React, { useState, useMemo } from 'react';
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
import { useEmis } from '../../hooks/useEmis';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  WalletColors, getCategoryDef,
} from '../../constants/theme';
import { Wallet, Expense } from '../../types/models';
import { doc, updateDoc, increment, collection, addDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';

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
    <TouchableOpacity
      style={styles.expenseRow}
      onPress={() => router.push({ pathname: '/modals/edit-expense', params: { id: expense.id } } as any)}
      activeOpacity={0.65}
    >
      <View style={styles.expenseEmoji}>
        <Text style={{ fontSize: 18 }}>{cat.emoji}</Text>
      </View>
      <View style={styles.expenseInfo}>
        <Text style={styles.expenseCat}>{cat.label}</Text>
        <Text style={styles.expenseWallet}>{walletName}</Text>
      </View>
      <View style={styles.expenseRight}>
        <Text style={[styles.expenseAmount, { color: expense.type === 'income' ? Colors.incomeText : expense.type === 'savings' ? Colors.savingsText : Colors.expenseText }]}>
          {expense.type === 'income' ? '+' : '−'}₹{expense.amount.toLocaleString('en-IN')}
        </Text>
        <Text style={styles.expenseTime}>{dateStr}</Text>
      </View>
    </TouchableOpacity>
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
  const { totalSpent, totalIncome, totalSavings } = useMonthlyExpenses();
  const { active: activeEmis } = useEmis();
  
  const [approvingEmiId, setApprovingEmiId] = useState<string | null>(null);

  const currentMonthKey = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }, []);

  const pendingEmis = useMemo(() => {
    return activeEmis.filter((e) => e.lastPaidMonth !== currentMonthKey);
  }, [activeEmis, currentMonthKey]);

  const handleApproveEmi = async (emi: any) => {
    if (!user) return;
    setApprovingEmiId(emi.id);
    try {
      const dateNow = Timestamp.now();

      await addDoc(collection(db, 'expenses'), {
        uid: user.uid,
        walletId: emi.walletId,
        type: 'expense',
        category: emi.category,
        amount: emi.monthlyAmount,
        note: `${emi.name} (Installment ${emi.currentInstallment + 1}/${emi.totalInstallments})`,
        date: dateNow,
        isRecurring: true,
        recurringId: emi.id,
        createdAt: dateNow,
      });

      await updateDoc(doc(db, 'wallets', emi.walletId), {
        balance: increment(-emi.monthlyAmount),
      });

      const nextInstallment = emi.currentInstallment + 1;
      const isFinished = nextInstallment >= emi.totalInstallments;
      
      await updateDoc(doc(db, 'emis', emi.id), {
        currentInstallment: nextInstallment,
        lastPaidMonth: currentMonthKey,
        active: !isFinished,
      });

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
      Toast.show({
        type: 'success',
        text1: 'Installment paid ✓',
        text2: `${emi.name} — ${nextInstallment}/${emi.totalInstallments} recorded.`,
      });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Approval failed', text2: err.message });
    } finally {
      setApprovingEmiId(null);
    }
  };

  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

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
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => {
              if (pendingEmis.length > 0) {
                Toast.show({
                  type: 'info',
                  text1: 'Pending EMIs',
                  text2: `You have ${pendingEmis.length} pending EMI payment(s) to approve below.`,
                });
              } else {
                Toast.show({
                  type: 'info',
                  text1: 'Notifications',
                  text2: 'No new notifications.',
                });
              }
            }}
          >
            <Text style={{ fontSize: 18 }}>🔔</Text>
            {pendingEmis.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingEmis.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Pending EMI Approvals Banner */}
        {pendingEmis.length > 0 && (
          <View style={styles.emiBannerList}>
            {pendingEmis.map((emi) => {
              const today = new Date();
              const isDueNow = today.getDate() >= emi.startDay;
              const isApproving = approvingEmiId === emi.id;
              
              return (
                <View key={emi.id} style={styles.notifCard}>
                  <View style={styles.notifHeader}>
                    <View style={styles.notifBrand}>
                      <Text style={styles.notifIcon}>🔔</Text>
                      <Text style={styles.notifAppName}>SPENDNOT</Text>
                      <Text style={styles.notifDot}>•</Text>
                      <Text style={[styles.notifTime, { color: isDueNow ? Colors.powerPink : Colors.mutedStone }]}>
                        {isDueNow ? 'DUE NOW' : 'UPCOMING'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.notifBody}>
                    <View style={styles.notifTextContainer}>
                      <Text style={styles.notifTitle}>{emi.name} EMI</Text>
                      <Text style={styles.notifDescription}>
                        ₹{emi.monthlyAmount.toLocaleString('en-IN')} due via {walletMap[emi.walletId] ?? 'Wallet'}.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.notifActionBtn, isApproving && { opacity: 0.6 }]}
                      onPress={() => handleApproveEmi(emi)}
                      disabled={isApproving}
                      activeOpacity={0.85}
                    >
                      {isApproving ? (
                        <ActivityIndicator size="small" color={Colors.polarWhite} />
                      ) : (
                        <Text style={styles.notifActionBtnText}>Approve</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

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
                ₹{totalSavings.toLocaleString('en-IN')}
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
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: Colors.danger,
    borderRadius: Radius.full,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: Colors.polarWhite,
  },
  badgeText: {
    color: Colors.polarWhite,
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 11,
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
  emiBannerList: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  notifCard: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.ghostGray,
    shadowColor: Colors.carbonBlack,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: Spacing.xs,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  notifBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notifIcon: {
    fontSize: 12,
  },
  notifAppName: {
    ...Typography.bodyBold,
    fontSize: 10,
    color: Colors.mutedStone,
    letterSpacing: 0.8,
  },
  notifDot: {
    fontSize: 10,
    color: Colors.mutedStone,
  },
  notifTime: {
    ...Typography.bodyBold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  notifBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  notifTextContainer: {
    flex: 1,
    gap: 2,
  },
  notifTitle: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  notifDescription: {
    ...Typography.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
  },
  notifActionBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifActionBtnText: {
    ...Typography.bodyBold,
    fontSize: FontSize.xs,
    color: Colors.polarWhite,
  },
});
