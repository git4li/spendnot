// ─────────────────────────────────────────────
//  SPENDNOT — Wallet Report Modal
//  app/modals/wallet-report.tsx
// ─────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, TextInput, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import {
  collection, query, where, orderBy, getDocs, doc, updateDoc, addDoc, increment,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { auth } from '../../lib/firebase';
import Toast from 'react-native-toast-message';
import { useWallets } from '../../hooks/useWallets';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  getCategoryDef, getWalletColors, getCurrencySymbol,
} from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { Expense } from '../../types/models';

import { Timestamp } from 'firebase/firestore';

function formatDate(ts: Timestamp): string {
  const d = ts.toDate();
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  
  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = isToday
    ? `Today, ${timeStr}`
    : isYesterday
    ? `Yesterday, ${timeStr}`
    : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}, ${timeStr}`;
  return dateStr;
}

const getCreditCycleInfo = (cycleStart: number, dueDay: number) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed
  const currentDate = today.getDate();

  let start: Date;
  let end: Date;
  let due: Date;

  if (currentDate >= cycleStart) {
    start = new Date(currentYear, currentMonth, cycleStart);
    end = new Date(currentYear, currentMonth + 1, cycleStart - 1, 23, 59, 59);
    due = new Date(currentYear, currentMonth + 1, dueDay);
  } else {
    start = new Date(currentYear, currentMonth - 1, cycleStart);
    end = new Date(currentYear, currentMonth, cycleStart - 1, 23, 59, 59);
    due = new Date(currentYear, currentMonth, dueDay);
  }

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const periodStr = `${start.toLocaleDateString('en-IN', options)} – ${end.toLocaleDateString('en-IN', options)}`;
  const dueStr = due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return { periodStr, dueStr, diffDays, start, end };
};

export default function WalletReportModal() {
  const { walletId } = useLocalSearchParams<{ walletId: string }>();
  const { wallets } = useWallets();
  const { bottom } = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const currencySymbol = getCurrencySymbol(profile?.currency);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Credit Card Bill payment states
  const [showPayBill, setShowPayBill] = useState(false);
  const [sourceWalletId, setSourceWalletId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  // Manual outstanding adjustment states
  const [showSetOutstanding, setShowSetOutstanding] = useState(false);
  const [outstandingAmount, setOutstandingAmount] = useState('');
  const [settingOutstanding, setSettingOutstanding] = useState(false);

  // Manual last bill states
  const [showSetLastBill, setShowSetLastBill] = useState(false);
  const [lastBillInput, setLastBillInput] = useState('');
  const [settingLastBill, setSettingLastBill] = useState(false);

  const wallet = wallets.find((w) => w.id === walletId);
  const colors = wallet ? getWalletColors(wallet.type, wallet.bankName) : { bg: Colors.ghostGray, text: Colors.carbonBlack };
  const isLight = wallet?.type !== 'credit';

  useEffect(() => {
    if (!walletId || !user) return;
    const q = query(
      collection(db, 'expenses'),
      where('uid', '==', user.uid),
      orderBy('date', 'desc'),
    );
    getDocs(q).then((snap) => {
      const allExpenses = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
      const filtered = allExpenses.filter(e => e.walletId === walletId || e.toWalletId === walletId);
      setExpenses(filtered);
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

  useEffect(() => {
    if (wallet) {
      setPayAmount(String(wallet.balance));
    }
  }, [wallet]);

  useEffect(() => {
    if (wallets.length > 0 && !sourceWalletId) {
      const def = wallets.find(w => w.isDefault && w.id !== walletId) || wallets.find(w => w.id !== walletId);
      if (def) setSourceWalletId(def.id);
    }
  }, [wallets, walletId]);

  const handlePayBill = async () => {
    const amt = parseFloat(payAmount.replace(/,/g, ''));
    if (!amt || amt <= 0) {
      Toast.show({ type: 'error', text1: 'Invalid Amount', text2: 'Please enter a valid payment amount.' });
      return;
    }
    if (!sourceWalletId) {
      Toast.show({ type: 'error', text1: 'No Source Wallet', text2: 'Please select a funding source.' });
      return;
    }

    setProcessingPayment(true);
    try {
      if (!user) {
        Toast.show({ type: 'error', text1: 'Not logged in', text2: 'Please log in again.' });
        return;
      }
      const dateNow = Timestamp.now();
      const sourceName = wallets.find(w => w.id === sourceWalletId)?.name ?? 'Wallet';

      // Log as a proper Transfer: Bank → CC wallet
      // This correctly reduces bank balance and reduces CC debt (balance goes toward 0)
      // It is NOT counted as income or expense in budget calculations — just debt settlement.
      await addDoc(collection(db, 'expenses'), {
        uid: user.uid,
        walletId: sourceWalletId,          // FROM: bank/source wallet
        toWalletId: walletId,              // TO: credit card wallet
        type: 'transfer',
        category: 'transfer',
        amount: amt,
        note: `CC Repayment → ${wallet?.name ?? 'Card'} from ${sourceName}`,
        date: dateNow,
        isRecurring: false,
        createdAt: dateNow,
      });

      // Deduct from bank/source wallet
      await updateDoc(doc(db, 'wallets', sourceWalletId), {
        balance: increment(-amt),
      });

      // Reduce CC outstanding balance (balance was positive representing owed amount, now decreases)
      await updateDoc(doc(db, 'wallets', walletId), {
        balance: increment(-amt),
      });

      Toast.show({ type: 'success', text1: 'CC Bill Paid ✓', text2: `${currencySymbol}${amt.toLocaleString('en-IN')} repaid. Debt reduced.` });
      setShowPayBill(false);

      // Refresh local transaction list
      const q = query(
        collection(db, 'expenses'),
        where('uid', '==', user.uid),
        orderBy('date', 'desc'),
      );
      const snap = await getDocs(q);
      const allExpenses = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
      setExpenses(allExpenses.filter(e => e.walletId === walletId || e.toWalletId === walletId));
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Payment Failed', text2: err.message });
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleSetOutstanding = async () => {
    const amt = parseFloat(outstandingAmount.replace(/,/g, ''));
    if (isNaN(amt) || amt < 0) {
      Toast.show({ type: 'error', text1: 'Invalid Amount', text2: 'Enter a valid outstanding amount (0 or more).' });
      return;
    }
    if (!user || !wallet) return;
    setSettingOutstanding(true);
    try {
      await updateDoc(doc(db, 'wallets', walletId), {
        balance: amt,
      });
      Toast.show({ type: 'success', text1: 'Outstanding Updated ✓', text2: `${wallet.name} outstanding set to ${currencySymbol}${amt.toLocaleString('en-IN')}.` });
      setShowSetOutstanding(false);
      setOutstandingAmount('');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Update Failed', text2: err.message });
    } finally {
      setSettingOutstanding(false);
    }
  };

  const handleSetLastBill = async () => {
    const amt = parseFloat(lastBillInput.replace(/,/g, ''));
    if (isNaN(amt) || amt < 0) {
      Toast.show({ type: 'error', text1: 'Invalid Amount', text2: 'Enter a valid bill amount (0 or more).' });
      return;
    }
    if (!user || !wallet) return;
    setSettingLastBill(true);
    try {
      await updateDoc(doc(db, 'wallets', walletId), {
        lastBillAmount: amt,
      });
      Toast.show({ type: 'success', text1: 'Last Bill Updated ✓', text2: `${currencySymbol}${amt.toLocaleString('en-IN')} saved.` });
      setShowSetLastBill(false);
      setLastBillInput('');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Update Failed', text2: err.message });
    } finally {
      setSettingLastBill(false);
    }
  };

  const cycleInfo = wallet?.type === 'credit' && wallet.billingCycleStartDay && wallet.paymentDueDay
    ? getCreditCycleInfo(wallet.billingCycleStartDay, wallet.paymentDueDay)
    : null;

  // Billing cycle charged & paid amounts
  const cycleCharged = cycleInfo
    ? expenses
        .filter(e => e.type === 'expense' && e.walletId === walletId)
        .filter(e => {
          const d = e.date.toDate();
          return d >= cycleInfo.start && d <= cycleInfo.end;
        })
        .reduce((s, e) => s + e.amount, 0)
    : totalSpent;

  const cyclePaid = cycleInfo
    ? expenses
        .filter(e => e.type === 'transfer' && e.toWalletId === walletId)
        .filter(e => {
          const d = e.date.toDate();
          return d >= cycleInfo.start && d <= cycleInfo.end;
        })
        .reduce((s, e) => s + e.amount, 0)
    : 0;

  // Last bill = total charged in current cycle (before any payments)
  const lastBillTotal = cycleCharged;
  const lastBillUnpaid = Math.max(0, lastBillTotal - cyclePaid);

  // Use manual lastBillAmount if set, otherwise fall back to auto-calculated cycle total
  const displayLastBill = wallet?.lastBillAmount ?? lastBillTotal;

  const catBreakdown: Record<string, number> = {};
  monthlyExpenses.filter((e) => e.type === 'expense').forEach((e) => {
    catBreakdown[e.category] = (catBreakdown[e.category] ?? 0) + e.amount;
  });
  const topCats = Object.entries(catBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.bg }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backArrow, { color: colors.text }]}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push({ pathname: '/modals/add-wallet', params: { walletId } } as any)}>
            <Text style={{ ...Typography.bodyBold, fontSize: FontSize.sm, color: colors.text, opacity: 0.8 }}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View>
          <Text style={[styles.walletName, { color: colors.text }]}>{wallet?.name ?? 'Wallet'}</Text>
          {wallet?.type === 'credit' ? (
            <>
              <Text style={[styles.walletBalance, { color: '#FF3B30' }]}>
                −{currencySymbol}{(wallet?.balance ?? 0).toLocaleString('en-IN')}
              </Text>
              <Text style={[styles.walletBalanceLabel, { color: colors.text, opacity: 0.7 }]}>
                💳 Owing — repay to reduce debt
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.walletBalance, { color: colors.text }]}>
                {currencySymbol}{(wallet?.balance ?? 0).toLocaleString('en-IN')}
              </Text>
              <Text style={[styles.walletBalanceLabel, { color: colors.text, opacity: 0.6 }]}>
                Current balance
              </Text>
            </>
          )}
        </View>
        {/* This month / cycle summary */}
        {wallet?.type === 'credit' ? (
          <View style={styles.monthRow}>
            <View style={[styles.monthChip, { backgroundColor: 'rgba(255,59,48,0.18)' }]}>
              <Text style={[styles.monthChipLabel, { color: '#FF3B30' }]}>OUTSTANDING</Text>
              <Text style={[styles.monthChipVal, { color: '#FF3B30', fontWeight: '700' }]}>
                {currencySymbol}{(wallet?.balance ?? 0).toLocaleString('en-IN')}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.monthChip, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]}
              onPress={() => {
                setLastBillInput(String(displayLastBill));
                setShowSetLastBill(true);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.monthChipLabel, { color: colors.text, opacity: 0.7 }]}>LAST BILL ✏️</Text>
              <Text style={[styles.monthChipVal, { color: colors.text }]}>
                {currencySymbol}{displayLastBill.toLocaleString('en-IN')}
              </Text>
              {cyclePaid > 0 && (
                <Text style={{ fontSize: 9, color: colors.text, opacity: 0.6, marginTop: 1 }}>
                  Paid {currencySymbol}{cyclePaid.toLocaleString('en-IN')} • Remaining {currencySymbol}{Math.max(0, displayLastBill - cyclePaid).toLocaleString('en-IN')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.monthRow}>
            <View style={[styles.monthChip, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]}>
              <Text style={[styles.monthChipLabel, { color: colors.text, opacity: 0.7 }]}>SPENT</Text>
              <Text style={[styles.monthChipVal, { color: colors.text }]}>{currencySymbol}{totalSpent.toLocaleString('en-IN')}</Text>
            </View>
            <View style={[styles.monthChip, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]}>
              <Text style={[styles.monthChipLabel, { color: colors.text, opacity: 0.7 }]}>RECEIVED</Text>
              <Text style={[styles.monthChipVal, { color: colors.text }]}>{currencySymbol}{totalReceived.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.carbonBlack} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Credit Limit & Utilization */}
          {wallet?.type === 'credit' && wallet.creditLimit ? (
            <View style={styles.creditLimitCard}>
              <View style={styles.limitHeader}>
                <Text style={styles.limitTitle}>Monthly Usage Cap</Text>
                <Text style={styles.limitValue}>{currencySymbol}{wallet.creditLimit.toLocaleString('en-IN')}</Text>
              </View>
              
              <View style={styles.progressContainer}>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min((wallet.balance / wallet.creditLimit) * 100, 100)}%`,
                        backgroundColor: (wallet.balance / wallet.creditLimit) > 0.8 ? Colors.danger : Colors.carbonBlack,
                      },
                    ]}
                  />
                </View>
                <View style={styles.limitSubRow}>
                  <Text style={styles.limitSubText}>
                    {Math.round(Math.min((wallet.balance / wallet.creditLimit) * 100, 100))}% Utilized
                  </Text>
                  <Text style={styles.limitSubText}>
                    {currencySymbol}{Math.max(wallet.creditLimit - wallet.balance, 0).toLocaleString('en-IN')} Available
                  </Text>
                </View>
              </View>

              {/* Warning if over limit or > 80% */}
              {(wallet.balance / wallet.creditLimit) > 0.8 && (
                <View style={styles.limitWarningBox}>
                  <Text style={styles.limitWarningText}>
                    ⚠️ High Utilization! Try to keep it below 80% to maintain a good credit score.
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Credit Cycle Info */}
          {cycleInfo && (
            <View style={styles.cycleCard}>
              <Text style={styles.cycleTitle}>Billing Cycle & Due Date</Text>
              <View style={styles.cycleGrid}>
                <View style={styles.cycleItem}>
                  <Text style={styles.cycleLabel}>Statement Period</Text>
                  <Text style={styles.cycleValue}>{cycleInfo.periodStr}</Text>
                </View>
                <View style={styles.cycleItem}>
                  <Text style={styles.cycleLabel}>Due Date</Text>
                  <Text style={[styles.cycleValue, cycleInfo.diffDays <= 5 && { color: Colors.danger }]}>
                    {cycleInfo.dueStr}
                  </Text>
                  <Text style={styles.cycleCountdown}>
                    {cycleInfo.diffDays > 0
                      ? `⏳ ${cycleInfo.diffDays} days left`
                      : cycleInfo.diffDays === 0
                      ? '🚨 Due Today!'
                      : '⚠️ Overdue'}
                  </Text>
                </View>
              </View>

              {/* Pay Bill + Set Outstanding buttons */}
              <View style={styles.billActionsRow}>
                <TouchableOpacity
                  style={[styles.payBillBtn, { flex: 1 }]}
                  onPress={() => setShowPayBill(true)}
                >
                  <Text style={styles.payBillBtnText}>Pay Card Bill</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.setOutstandingBtn, { flex: 1 }]}
                  onPress={() => {
                    setOutstandingAmount(String(wallet?.balance ?? ''));
                    setShowSetOutstanding(true);
                  }}
                >
                  <Text style={styles.setOutstandingBtnText}>Set Outstanding</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

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
                      <Text style={styles.catAmt}>{currencySymbol}{amt.toLocaleString('en-IN')}</Text>
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
                let displayCatLabel = cat.label;
                let isTransferIn = false;
                if (e.type === 'transfer') {
                  if (e.toWalletId === walletId) {
                    // Money coming INTO this wallet via transfer
                    isTransferIn = true;
                    const fromName = wallets.find(w => w.id === e.walletId)?.name ?? 'Other Wallet';
                    // If this is a CC wallet, incoming transfer = repayment
                    if (wallet?.type === 'credit') {
                      displayCatLabel = `💳 CC Repayment from ${fromName}`;
                    } else {
                      displayCatLabel = `Transfer from ${fromName}`;
                    }
                  } else {
                    const toName = wallets.find(w => w.id === e.toWalletId)?.name ?? 'Other Wallet';
                    // If destination is CC, this is a CC repayment logged from bank side
                    const destWallet = wallets.find(w => w.id === e.toWalletId);
                    if (destWallet?.type === 'credit') {
                      displayCatLabel = `💳 CC Repayment → ${toName}`;
                    } else {
                      displayCatLabel = `Transfer to ${toName}`;
                    }
                  }
                }

                const isIncoming = e.type === 'income' || (e.type === 'transfer' && isTransferIn);
                const sign = isIncoming ? '+' : '−';
                const amountColor = isIncoming ? Colors.income : Colors.expense;

                return (
                  <View key={e.id} style={styles.txRow}>
                    <View style={styles.txEmoji}>
                      <Text style={{ fontSize: 16 }}>{cat.emoji}</Text>
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={styles.txCat}>{displayCatLabel}</Text>
                      {e.note ? <Text style={styles.txNote}>{e.note}</Text> : null}
                      {e.photoUri ? (
                        <Text style={{ fontSize: 12, color: Colors.mutedStone, marginTop: 2 }}>📎 Image attached</Text>
                      ) : null}
                      <Text style={styles.txDate}>{formatDate(e.date)}</Text>
                    </View>
                    <Text style={[
                      styles.txAmt,
                      { color: amountColor },
                    ]}>
                      {sign}{currencySymbol}{e.amount.toLocaleString('en-IN')}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
      {/* Pay Bill Modal */}
      <Modal visible={showPayBill} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => { setShowPayBill(false); Keyboard.dismiss(); }}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Pay Card Bill</Text>
                
                <Text style={styles.modalLabel}>AMOUNT TO PAY ({currencySymbol})</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="0"
                  placeholderTextColor={Colors.mutedStone}
                  keyboardType="decimal-pad"
                  value={payAmount}
                  onChangeText={setPayAmount}
                />

                <Text style={styles.modalLabel}>PAY FROM WALLET</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: Spacing.xs }}>
                  <View style={styles.walletSelectRow}>
                    {wallets
                      .filter((w) => w.id !== walletId)
                      .map((w) => {
                        const wColors = getWalletColors(w.type, w.bankName);
                        const isSel = sourceWalletId === w.id;
                        return (
                          <TouchableOpacity
                            key={w.id}
                            style={[
                              styles.walletSelectPill,
                              { backgroundColor: wColors.bg },
                              isSel && styles.walletSelectPillActive,
                            ]}
                            onPress={() => setSourceWalletId(w.id)}
                          >
                            {isSel && <Text style={{ color: wColors.text, fontWeight: 'bold' }}>✓ </Text>}
                            <Text style={{ color: wColors.text, fontWeight: '700', fontSize: 12 }}>{w.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                </ScrollView>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setShowPayBill(false)}
                    disabled={processingPayment}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalPayBtn}
                    onPress={handlePayBill}
                    disabled={processingPayment}
                  >
                    {processingPayment ? (
                      <ActivityIndicator color={Colors.polarWhite} />
                    ) : (
                      <Text style={styles.modalPayText}>Confirm Payment</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Set Outstanding Modal */}
      <Modal visible={showSetOutstanding} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => { setShowSetOutstanding(false); Keyboard.dismiss(); }}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Set Outstanding Amount</Text>
                <Text style={[styles.modalLabel, { marginBottom: Spacing.sm, color: Colors.mutedStone, textTransform: 'none', fontSize: FontSize.sm }]}>
                  Enter the actual amount owed on your CC bill (from your bank statement). This overrides the app-calculated balance.
                </Text>

                <Text style={styles.modalLabel}>ACTUAL OUTSTANDING ({currencySymbol})</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="0"
                  placeholderTextColor={Colors.mutedStone}
                  keyboardType="decimal-pad"
                  value={outstandingAmount}
                  onChangeText={setOutstandingAmount}
                  autoFocus
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setShowSetOutstanding(false)}
                    disabled={settingOutstanding}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalPayBtn}
                    onPress={handleSetOutstanding}
                    disabled={settingOutstanding}
                  >
                    {settingOutstanding ? (
                      <ActivityIndicator color={Colors.polarWhite} />
                    ) : (
                      <Text style={styles.modalPayText}>Update</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Set Last Bill Modal */}
      <Modal visible={showSetLastBill} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => { setShowSetLastBill(false); Keyboard.dismiss(); }}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Edit Last Bill</Text>
                <Text style={[styles.modalLabel, { marginBottom: Spacing.sm, color: Colors.mutedStone, textTransform: 'none', fontSize: FontSize.sm }]}>
                  Set the actual CC bill amount from your statement. Leave blank or tap Reset to use auto-calculated value.
                </Text>

                <Text style={styles.modalLabel}>BILL AMOUNT ({currencySymbol})</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="0"
                  placeholderTextColor={Colors.mutedStone}
                  keyboardType="decimal-pad"
                  value={lastBillInput}
                  onChangeText={setLastBillInput}
                  autoFocus
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { flex: 0.6 }]}
                    onPress={async () => {
                      // Reset to auto-calculated (remove override)
                      if (user && wallet) {
                        await updateDoc(doc(db, 'wallets', walletId), { lastBillAmount: null });
                        Toast.show({ type: 'success', text1: 'Reset to auto ✓' });
                      }
                      setShowSetLastBill(false);
                    }}
                    disabled={settingLastBill}
                  >
                    <Text style={[styles.modalCancelText, { fontSize: FontSize.xs }]}>Reset to auto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalPayBtn}
                    onPress={handleSetLastBill}
                    disabled={settingLastBill}
                  >
                    {settingLastBill ? (
                      <ActivityIndicator color={Colors.polarWhite} />
                    ) : (
                      <Text style={styles.modalPayText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  creditLimitCard: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  limitTitle: { ...Typography.bodyBold, fontSize: FontSize.sm, color: Colors.mutedStone },
  limitValue: { ...Typography.bodyBold, fontSize: FontSize.md, color: Colors.carbonBlack },
  progressContainer: { gap: Spacing.xs },
  progressBarTrack: {
    height: 8,
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', borderRadius: Radius.full },
  limitSubRow: { flexDirection: 'row', justifyContent: 'space-between' },
  limitSubText: { ...Typography.bodyMedium, fontSize: 11, color: Colors.mutedStone },
  limitWarningBox: {
    backgroundColor: 'rgba(224,92,92,0.1)',
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  limitWarningText: { ...Typography.bodyMedium, fontSize: 11, color: Colors.danger },
  cycleCard: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  cycleTitle: { ...Typography.bodyBold, fontSize: FontSize.lg, color: Colors.carbonBlack, marginBottom: Spacing.md },
  cycleGrid: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  cycleItem: { flex: 1, gap: Spacing.xs },
  cycleLabel: { ...Typography.bodyMedium, fontSize: 10, color: Colors.mutedStone, textTransform: 'uppercase' },
  cycleValue: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.carbonBlack },
  cycleCountdown: { ...Typography.bodyMedium, fontSize: 11, color: Colors.mutedStone },
  billActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  payBillBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBillBtnText: { ...Typography.bodyBold, fontSize: FontSize.sm, color: Colors.polarWhite },
  setOutstandingBtn: {
    borderWidth: 1.5,
    borderColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setOutstandingBtnText: { ...Typography.bodyBold, fontSize: FontSize.sm, color: Colors.carbonBlack },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 380,
    gap: Spacing.base,
  },
  modalTitle: { ...Typography.bodyBold, fontSize: FontSize.xl, color: Colors.carbonBlack },
  modalLabel: { ...Typography.bodyBold, fontSize: FontSize.xs, color: Colors.mutedStone, letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  modalCancelBtn: {
    flex: 1,
    borderRadius: Radius.full,
    paddingVertical: 12,
    backgroundColor: Colors.ghostGray,
    alignItems: 'center',
  },
  modalCancelText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.mutedStone },
  modalPayBtn: {
    flex: 1,
    borderRadius: Radius.full,
    paddingVertical: 12,
    backgroundColor: Colors.carbonBlack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPayText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.polarWhite },
  walletSelectRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: 4 },
  walletSelectPill: {
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletSelectPillActive: { borderColor: Colors.carbonBlack },
});
