// ─────────────────────────────────────────────
//  SPENDNOT — Dashboard (Screen 2)
//  app/(tabs)/index.tsx
// ─────────────────────────────────────────────
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { WalletCardSkeleton, SummaryCardSkeleton, ExpenseRowSkeleton } from '../../components/Skeleton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTabBarVisibility } from '../../context/TabBarVisibilityContext';
import { useWallets } from '../../hooks/useWallets';
import { useExpenses, useMonthlyExpenses } from '../../hooks/useExpenses';
import { useEmis } from '../../hooks/useEmis';
import { useBudgets } from '../../hooks/useBudgets';
import { useChecklist } from '../../hooks/useChecklist';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  getCategoryDef, getWalletColors, getCurrencySymbol,
} from '../../constants/theme';
import { Wallet, Expense } from '../../types/models';
import { doc, updateDoc, increment, collection, addDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';

// ── Wallet Mini Card ─────────────────────────
function WalletMiniCard({ wallet, onPress }: { wallet: Wallet; onPress: () => void }) {
  const { profile } = useAuth();
  const currencySymbol = getCurrencySymbol(profile?.currency);
  const colors = getWalletColors(wallet.type, wallet.bankName);
  const isCredit = wallet.type === 'credit';
  return (
    <TouchableOpacity
      style={[
        styles.walletMiniCard,
        { backgroundColor: colors.bg },
        isCredit && wallet.balance > 0 && styles.walletMiniCardDebt,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Top row: wallet name + OWING badge for CC */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
        <Text
          style={[styles.walletMiniLabel, { color: isCredit ? '#FF3B30' : colors.text, opacity: isCredit ? 1 : 0.6 }]}
          numberOfLines={1}
        >
          {wallet.name}
        </Text>
        {isCredit && (
          <View style={styles.owingBadge}>
            <Text style={styles.owingBadgeText}>OWING</Text>
          </View>
        )}
      </View>
      {/* Balance */}
      <Text style={[styles.walletMiniAmount, { color: isCredit && wallet.balance > 0 ? '#FF3B30' : colors.text }]}>
        {isCredit && wallet.balance > 0 ? '−' : ''}{currencySymbol}{wallet.balance.toLocaleString('en-IN')}
      </Text>
      {/* Default badge for non-CC */}
      {wallet.isDefault && !isCredit && (
        <View style={styles.defaultBadge}>
          <Text style={styles.defaultBadgeText}>DEFAULT</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}


// ── Expense Row ──────────────────────────────
function ExpenseRow({ expense, walletMap, wallets }: { expense: Expense; walletMap: Record<string, string>; wallets: Wallet[] }) {
  const { profile } = useAuth();
  const currencySymbol = getCurrencySymbol(profile?.currency);
  const cat = getCategoryDef(expense.category);
  const date = expense.date.toDate();
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  
  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = isToday
    ? `Today, ${timeStr}`
    : isYesterday
    ? `Yesterday, ${timeStr}`
    : `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${timeStr}`;

  const sourceWalletName = walletMap[expense.walletId] ?? 'Wallet';
  const toWallet = wallets.find(w => w.id === expense.toWalletId);
  const isCCRepayment = expense.type === 'transfer' && toWallet?.type === 'credit';

  const displayWalletName = expense.type === 'transfer'
    ? isCCRepayment
      ? `💳 CC Repayment → ${walletMap[expense.toWalletId ?? ''] ?? 'Card'}`
      : `${sourceWalletName} ➤ ${walletMap[expense.toWalletId ?? ''] ?? 'Wallet'}`
    : sourceWalletName;

  const sign = expense.type === 'income' ? '+' : expense.type === 'transfer' ? '⇄ ' : '−';
  const amountColor = expense.type === 'income'
    ? Colors.incomeText
    : expense.type === 'savings'
    ? Colors.savingsText
    : expense.type === 'transfer'
    ? Colors.mutedStone
    : Colors.expenseText;

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
        {expense.note ? (
          <Text style={styles.expenseNote} numberOfLines={1}>{expense.note}</Text>
        ) : null}
        {expense.photoUri ? (
          <Text style={{ fontSize: 12, color: Colors.mutedStone, marginTop: 2 }}>📎 Image attached</Text>
        ) : null}
        <Text style={styles.expenseWallet}>{displayWalletName}</Text>
      </View>
      <View style={styles.expenseRight}>
        <Text style={[styles.expenseAmount, { color: amountColor }]}>
          {sign}{currencySymbol}{expense.amount.toLocaleString('en-IN')}
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

// ── EMI Approval Modal ───────────────────────
interface EmiApproveSheetProps {
  visible: boolean;
  onClose: () => void;
  emi: any;
  onConfirm: (amount: number, walletId: string) => Promise<void>;
  wallets: Wallet[];
}

function EmiApproveSheet({ visible, onClose, emi, onConfirm, wallets }: EmiApproveSheetProps) {
  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (emi) {
      setAmount(emi.monthlyAmount.toString());
      setWalletId(emi.walletId);
    }
  }, [emi]);

  const handleConfirm = async () => {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await onConfirm(amt, walletId);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!emi) return null;

  const selectedWallet = walletId || wallets.find(w => w.isDefault)?.id || wallets[0]?.id || '';

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrapper}>
        <View style={styles.sheetContent}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Approve EMI Payment</Text>
          <Text style={styles.sheetSubTitle}>
            {emi.name} — Installment {emi.currentInstallment + 1} of {emi.totalInstallments}
          </Text>

          <Text style={styles.sheetLabel}>Installment Amount (₹)</Text>
          <View style={styles.sheetAmountBox}>
            <Text style={styles.sheetRupee}>₹</Text>
            <TextInput
              style={styles.sheetAmountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={Colors.softStone}
            />
          </View>

          <Text style={styles.sheetLabel}>Pay From Wallet</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.base }}>
            <View style={styles.sheetRow}>
              {wallets.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={[styles.sheetPill, selectedWallet === w.id && styles.sheetPillActive]}
                  onPress={() => setWalletId(w.id)}
                >
                  <Text style={[styles.sheetPillText, selectedWallet === w.id && styles.sheetPillTextActive]}>
                    {w.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.sheetSaveBtn, saving && { opacity: 0.6 }]}
            onPress={handleConfirm}
            disabled={saving}
          >
            <Text style={styles.sheetSaveBtnText}>{saving ? 'Approving…' : 'Approve Installment'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Dashboard ────────────────────────────────
export default function DashboardScreen() {
  const { user, profile } = useAuth();
  const currencySymbol = getCurrencySymbol(profile?.currency);
  const { wallets, loading: walletsLoading } = useWallets();
  const { expenses, loading: expensesLoading } = useExpenses(10);
  const { totalSpent, totalIncome, totalSavings } = useMonthlyExpenses();
  const { active: activeEmis } = useEmis();
  const { onScroll: tabBarOnScroll } = useTabBarVisibility();
  
  const [approvingEmiId, setApprovingEmiId] = useState<string | null>(null);
  const [emiToApprove, setEmiToApprove] = useState<any | null>(null);

  const currentMonthKey = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }, []);

  // Net Available = all non-credit wallet balances minus all credit wallet debt
  const netAvailable = useMemo(() => {
    const assets = wallets.filter(w => w.type !== 'credit').reduce((s, w) => s + w.balance, 0);
    const debt = wallets.filter(w => w.type === 'credit').reduce((s, w) => s + w.balance, 0);
    return assets - debt;
  }, [wallets]);

  const totalCCDebt = useMemo(() => {
    return wallets.filter(w => w.type === 'credit').reduce((s, w) => s + w.balance, 0);
  }, [wallets]);

  const { budgets } = useBudgets();
  const { checklist } = useChecklist(currentMonthKey);

  const totalBudgetLimit = useMemo(() => budgets.reduce((s, b) => s + b.limit, 0), [budgets]);
  const budgetProgressText = useMemo(() => {
    if (totalBudgetLimit === 0) return 'No limits set';
    const pct = Math.round((totalSpent / totalBudgetLimit) * 100);
    return `${pct}% Spent`;
  }, [totalSpent, totalBudgetLimit]);

  const checklistProgressText = useMemo(() => {
    const totalItems = checklist.length;
    if (totalItems === 0) return 'No bills set';
    const paidItems = checklist.filter((item) => item.isPaid).length;
    return `${paidItems} of ${totalItems} paid`;
  }, [checklist]);

  const pendingEmis = useMemo(() => {
    return activeEmis.filter((e) => e.lastPaidMonth !== currentMonthKey);
  }, [activeEmis, currentMonthKey]);

  const handleApproveEmi = async (emi: any, amount: number, walletId: string) => {
    if (!user) return;
    setApprovingEmiId(emi.id);
    try {
      const dateNow = Timestamp.now();

      await addDoc(collection(db, 'expenses'), {
        uid: user.uid,
        walletId: walletId,
        type: 'expense',
        category: emi.category,
        amount: amount,
        note: `${emi.name} (Installment ${emi.currentInstallment + 1}/${emi.totalInstallments})`,
        date: dateNow,
        isRecurring: true,
        recurringId: emi.id,
        createdAt: dateNow,
      });

      await updateDoc(doc(db, 'wallets', walletId), {
        balance: increment(-amount),
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
        onScroll={tabBarOnScroll}
        scrollEventThrottle={16}
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
                        {currencySymbol}{emi.monthlyAmount.toLocaleString('en-IN')} due via {walletMap[emi.walletId] ?? 'Wallet'}.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.notifActionBtn, isApproving && { opacity: 0.6 }]}
                      onPress={() => setEmiToApprove(emi)}
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
          <Text style={styles.summaryAmount}>{currencySymbol}{totalSpent.toLocaleString('en-IN')}</Text>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryStatLabel}>Income</Text>
              <Text style={[styles.summaryStatVal, { color: Colors.income }]}>
                {currencySymbol}{totalIncome.toLocaleString('en-IN')}
              </Text>
            </View>
            <View>
              <Text style={styles.summaryStatLabel}>Expenses</Text>
              <Text style={[styles.summaryStatVal, { color: Colors.expense }]}>
                {currencySymbol}{totalSpent.toLocaleString('en-IN')}
              </Text>
            </View>
            <View>
              <Text style={styles.summaryStatLabel}>Savings</Text>
              <Text style={[styles.summaryStatVal, { color: Colors.savings }]}>
                {currencySymbol}{totalSavings.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
          {totalCCDebt > 0 && (
            <View style={styles.netAvailableRow}>
              <View style={styles.netAvailableDivider} />
              <View style={styles.netAvailableContent}>
                <View>
                  <Text style={styles.netAvailableLabel}>CC Owing</Text>
                  <Text style={[styles.netAvailableVal, { color: '#FF3B30' }]}>
                    −{currencySymbol}{totalCCDebt.toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.netAvailableLabel}>Net Available</Text>
                  <Text style={[styles.netAvailableVal, { color: netAvailable >= 0 ? Colors.income : '#FF3B30' }]}>
                    {currencySymbol}{netAvailable.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Budget & Checklist Widget */}
        {!walletsLoading && (
          <TouchableOpacity
            style={styles.trackerCard}
            onPress={() => router.push('/(tabs)/budgets')}
            activeOpacity={0.85}
          >
            <View style={styles.trackerHeader}>
              <Text style={styles.trackerTitle}>Limits & To-Dos</Text>
              <Text style={styles.trackerArrow}>➔</Text>
            </View>
            <View style={styles.trackerRow}>
              <View style={styles.trackerItem}>
                <Text style={styles.trackerLabel}>BUDGETS</Text>
                <Text style={styles.trackerValue}>{budgetProgressText}</Text>
              </View>
              <View style={styles.trackerDivider} />
              <View style={styles.trackerItem}>
                <Text style={styles.trackerLabel}>MONTHLY TO-DO</Text>
                <Text style={styles.trackerValue}>{checklistProgressText}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

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
              <ExpenseRow key={e.id} expense={e} walletMap={walletMap} wallets={wallets} />
            ))}
          </View>
        )}
      </ScrollView>
      <EmiApproveSheet
        visible={!!emiToApprove}
        onClose={() => setEmiToApprove(null)}
        emi={emiToApprove}
        onConfirm={async (amount, walletId) => {
          if (emiToApprove) {
            await handleApproveEmi(emiToApprove, amount, walletId);
          }
        }}
        wallets={wallets}
      />
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
  walletMiniCardDebt: {
    borderWidth: 1.5,
    borderColor: '#FF3B30',
  },
  walletMiniLabel: {
    ...Typography.bodyBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  owingBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  owingBadgeText: {
    ...Typography.bodyBold,
    fontSize: 7,
    color: '#fff',
    letterSpacing: 0.5,
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
  netAvailableRow: {
    marginTop: Spacing.md,
  },
  netAvailableDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: Spacing.md,
  },
  netAvailableContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  netAvailableLabel: {
    ...Typography.bodyBold,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  netAvailableVal: {
    ...Typography.heading,
    fontSize: FontSize.xl,
    letterSpacing: -0.5,
    marginTop: 2,
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
  expenseNote: {
    ...Typography.body,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    marginTop: 1,
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
  // Tracker Card
  trackerCard: {
    backgroundColor: Colors.creamCard,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  trackerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  trackerTitle: {
    ...Typography.heading,
    fontSize: FontSize.lg,
    color: Colors.carbonBlack,
    letterSpacing: -0.5,
  },
  trackerArrow: {
    fontSize: FontSize.lg,
    color: Colors.carbonBlack,
  },
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackerItem: {
    flex: 1,
  },
  trackerLabel: {
    ...Typography.bodyBold,
    fontSize: 9,
    color: Colors.mutedStone,
    letterSpacing: 0.5,
  },
  trackerValue: {
    ...Typography.heading,
    fontSize: FontSize.xl,
    color: Colors.carbonBlack,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  trackerDivider: {
    width: 2,
    height: 32,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginHorizontal: Spacing.md,
  },
  // EMI Approval Sheet styles
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrapper: { justifyContent: 'flex-end' },
  sheetContent: {
    backgroundColor: Colors.polarWhite,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: Spacing.xl,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 40, height: 4,
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  sheetTitle: {
    ...Typography.heading,
    fontSize: FontSize['2xl'],
    color: Colors.carbonBlack,
    letterSpacing: -0.5,
  },
  sheetSubTitle: {
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
    marginTop: 4,
    marginBottom: Spacing.lg,
  },
  sheetLabel: {
    ...Typography.bodyBold,
    fontSize: FontSize.xs,
    color: Colors.mutedStone,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
  },
  sheetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xs },
  sheetPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.ghostGray,
  },
  sheetPillActive: { backgroundColor: Colors.carbonBlack },
  sheetPillText: { ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.mutedStone },
  sheetPillTextActive: { color: Colors.polarWhite },
  sheetAmountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.md,
  },
  sheetRupee: { ...Typography.heading, fontSize: FontSize['xl'], color: Colors.mutedStone, marginRight: 4 },
  sheetAmountInput: {
    flex: 1,
    ...Typography.heading,
    fontSize: FontSize['2xl'],
    color: Colors.carbonBlack,
    letterSpacing: -0.5,
    paddingVertical: Spacing.sm,
  },
  sheetSaveBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  sheetSaveBtnText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.polarWhite },
});
