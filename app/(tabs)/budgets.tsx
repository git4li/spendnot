// ─────────────────────────────────────────────
//  SPENDNOT — Budgets Screen (Screen 5)
//  app/(tabs)/budgets.tsx
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  doc, updateDoc, setDoc, Timestamp, collection, addDoc,
} from 'firebase/firestore';
import { useBudgets } from '../../hooks/useBudgets';
import { useMonthlyExpenses } from '../../hooks/useExpenses';
import { useRecurring } from '../../hooks/useRecurring';
import { useWallets } from '../../hooks/useWallets';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  CATEGORIES, getCategoryDef, CategoryKey,
} from '../../constants/theme';
import { Recurring } from '../../types/models';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { BudgetCardSkeleton } from '../../components/Skeleton';

type BudgetTab = 'budgets' | 'recurring';
type Period = 'weekly' | 'monthly';
type Frequency = 'weekly' | 'monthly' | 'yearly';

// ── Progress Bar ─────────────────────────────
function ProgressBar({ value, max, color = Colors.carbonBlack }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={barStyles.track}>
      <View style={[barStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const barStyles = StyleSheet.create({
  track: {
    height: 8, backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full, overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: Radius.full },
});

// ── Recurring Card ───────────────────────────
function RecurringCard({ item, walletName }: { item: Recurring; walletName: string }) {
  const { user } = useAuth();
  const due = item.nextDueDate.toDate();
  const isOverdue = due < new Date();
  const dateStr = due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const [marking, setMarking] = useState(false);

  const handleMarkPaid = async () => {
    if (!user) return;
    setMarking(true);
    try {
      await addDoc(collection(db, 'expenses'), {
        uid: user.uid,
        walletId: item.walletId,
        type: 'expense',
        category: 'bills',
        amount: item.amount,
        note: item.name,
        date: Timestamp.now(),
        isRecurring: true,
        recurringId: item.id,
        createdAt: Timestamp.now(),
      });

      const next = new Date(item.nextDueDate.toDate());
      if (item.frequency === 'monthly') next.setMonth(next.getMonth() + 1);
      else if (item.frequency === 'weekly') next.setDate(next.getDate() + 7);
      else next.setFullYear(next.getFullYear() + 1);

      await updateDoc(doc(db, 'recurring', item.id), {
        isPaid: true,
        lastPaidDate: Timestamp.now(),
        nextDueDate: Timestamp.fromDate(next),
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Marked as paid ✓', text2: item.name });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setMarking(false);
    }
  };

  return (
    <View style={[rcStyles.card, isOverdue && rcStyles.overdueCard]}>
      <View style={rcStyles.icon}>
        <Text style={{ fontSize: 20 }}>📋</Text>
      </View>
      <View style={rcStyles.info}>
        <Text style={rcStyles.name}>{item.name}</Text>
        <Text style={rcStyles.sub}>
          {item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1)} · {walletName}
        </Text>
        <Text style={[rcStyles.due, isOverdue && { color: Colors.powerPink }]}>
          Due {dateStr}
        </Text>
      </View>
      <View style={rcStyles.right}>
        <Text style={rcStyles.amount}>₹{item.amount.toLocaleString('en-IN')}</Text>
        {item.isAutoDeduct ? (
          <View style={rcStyles.autoBadge}>
            <Text style={rcStyles.autoBadgeText}>AUTO</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={rcStyles.markBtn}
            onPress={handleMarkPaid}
            disabled={marking || item.isPaid}
          >
            <Text style={rcStyles.markBtnText}>
              {item.isPaid ? '✓ Paid' : marking ? '...' : 'Mark Paid'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const rcStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.ghostGray,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  overdueCard: { borderLeftWidth: 4, borderLeftColor: Colors.powerPink },
  icon: {
    width: 40, height: 40,
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1 },
  name: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.carbonBlack },
  sub: { ...Typography.body, fontSize: FontSize.sm, color: Colors.mutedStone, marginTop: 2 },
  due: { ...Typography.bodyBold, fontSize: FontSize.sm, color: Colors.skyBlue, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 6 },
  amount: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.carbonBlack },
  markBtn: {
    backgroundColor: Colors.limePop,
    borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  markBtnText: { ...Typography.bodyBold, fontSize: FontSize.xs, color: Colors.carbonBlack },
  autoBadge: {
    backgroundColor: Colors.skyBlue,
    borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  autoBadgeText: { ...Typography.bodyBold, fontSize: 10, color: Colors.carbonBlack },
});

// ── Add Budget Sheet ──────────────────────────
function AddBudgetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [category, setCategory] = useState<CategoryKey>('food');
  const [limit, setLimit] = useState('');
  const [period, setPeriod] = useState<Period>('monthly');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    const amt = parseFloat(limit);
    if (!limit || isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid amount', 'Enter a budget limit greater than 0.');
      return;
    }
    setSaving(true);
    try {
      // Budget ID is uid_category_period so it's one per category per period
      const budgetId = `${user.uid}_${category}_${period}`;
      await setDoc(doc(db, 'budgets', budgetId), {
        uid: user.uid,
        category,
        limit: amt,
        period,
        createdAt: Timestamp.now(),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Budget set ✓' });
      setLimit('');
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetStyles.wrapper}>
        <View style={sheetStyles.sheet}>
          {/* Handle */}
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.sheetTitle}>Set Budget</Text>

          {/* Period toggle */}
          <Text style={sheetStyles.label}>Period</Text>
          <View style={sheetStyles.row}>
            {(['weekly', 'monthly'] as Period[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[sheetStyles.pill, period === p && sheetStyles.pillActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[sheetStyles.pillText, period === p && sheetStyles.pillTextActive]}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Category grid */}
          <Text style={sheetStyles.label}>Category</Text>
          <View style={sheetStyles.catGrid}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[sheetStyles.catCell, category === c.key && sheetStyles.catCellActive]}
                onPress={() => setCategory(c.key)}
              >
                <Text style={sheetStyles.catEmoji}>{c.emoji}</Text>
                <Text style={[sheetStyles.catLabel, category === c.key && sheetStyles.catLabelActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Limit input */}
          <Text style={sheetStyles.label}>Limit (₹)</Text>
          <View style={sheetStyles.amountBox}>
            <Text style={sheetStyles.rupee}>₹</Text>
            <TextInput
              style={sheetStyles.amountInput}
              value={limit}
              onChangeText={setLimit}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={Colors.softStone}
            />
          </View>

          <TouchableOpacity
            style={[sheetStyles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={sheetStyles.saveBtnText}>{saving ? 'Saving…' : 'Set Budget'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Add Recurring Sheet ───────────────────────
function AddRecurringSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { wallets } = useWallets();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [walletId, setWalletId] = useState('');
  const [saving, setSaving] = useState(false);

  const defaultWallet = wallets.find((w) => w.isDefault) ?? wallets[0];
  const selectedWallet = walletId || defaultWallet?.id || '';

  const handleSave = async () => {
    if (!user) return;
    const amt = parseFloat(amount);
    if (!name.trim()) { Alert.alert('Name required', 'Enter a name for this recurring item.'); return; }
    if (!amount || isNaN(amt) || amt <= 0) { Alert.alert('Invalid amount', 'Enter an amount greater than 0.'); return; }
    if (!selectedWallet) { Alert.alert('No wallet', 'Add a wallet first.'); return; }

    setSaving(true);
    try {
      const nextDue = new Date();
      if (frequency === 'monthly') nextDue.setMonth(nextDue.getMonth() + 1);
      else if (frequency === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
      else nextDue.setFullYear(nextDue.getFullYear() + 1);

      await addDoc(collection(db, 'recurring'), {
        uid: user.uid,
        name: name.trim(),
        amount: amt,
        frequency,
        walletId: selectedWallet,
        nextDueDate: Timestamp.fromDate(nextDue),
        isPaid: false,
        isAutoDeduct: false,
        createdAt: Timestamp.now(),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Recurring added ✓', text2: name.trim() });
      setName(''); setAmount('');
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetStyles.wrapper}>
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.sheetTitle}>Add Recurring</Text>

          {/* Name */}
          <Text style={sheetStyles.label}>Name</Text>
          <TextInput
            style={sheetStyles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="Netflix, Rent, Insurance…"
            placeholderTextColor={Colors.softStone}
          />

          {/* Amount */}
          <Text style={sheetStyles.label}>Amount (₹)</Text>
          <View style={sheetStyles.amountBox}>
            <Text style={sheetStyles.rupee}>₹</Text>
            <TextInput
              style={sheetStyles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={Colors.softStone}
            />
          </View>

          {/* Frequency */}
          <Text style={sheetStyles.label}>Frequency</Text>
          <View style={sheetStyles.row}>
            {(['weekly', 'monthly', 'yearly'] as Frequency[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[sheetStyles.pill, frequency === f && sheetStyles.pillActive]}
                onPress={() => setFrequency(f)}
              >
                <Text style={[sheetStyles.pillText, frequency === f && sheetStyles.pillTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Wallet picker */}
          {wallets.length > 1 && (
            <>
              <Text style={sheetStyles.label}>Wallet</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.base }}>
                <View style={sheetStyles.row}>
                  {wallets.map((w) => (
                    <TouchableOpacity
                      key={w.id}
                      style={[sheetStyles.pill, selectedWallet === w.id && sheetStyles.pillActive]}
                      onPress={() => setWalletId(w.id)}
                    >
                      <Text style={[sheetStyles.pillText, selectedWallet === w.id && sheetStyles.pillTextActive]}>
                        {w.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          <TouchableOpacity
            style={[sheetStyles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={sheetStyles.saveBtnText}>{saving ? 'Saving…' : 'Add Recurring'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  wrapper: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.polarWhite,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: Spacing.xl,
    paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  sheetTitle: {
    ...Typography.heading,
    fontSize: FontSize['3xl'],
    color: Colors.carbonBlack,
    letterSpacing: -1,
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  pill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.ghostGray,
  },
  pillActive: { backgroundColor: Colors.carbonBlack },
  pillText: { ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.mutedStone },
  pillTextActive: { color: Colors.polarWhite },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  catCell: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.ghostGray,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  catCellActive: { backgroundColor: Colors.carbonBlack },
  catEmoji: { fontSize: 20 },
  catLabel: { ...Typography.body, fontSize: 9, color: Colors.mutedStone },
  catLabelActive: { color: Colors.polarWhite },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.lg,
  },
  rupee: { ...Typography.heading, fontSize: FontSize['2xl'], color: Colors.mutedStone, marginRight: 4 },
  amountInput: {
    flex: 1,
    ...Typography.heading,
    fontSize: FontSize['4xl'],
    color: Colors.carbonBlack,
    letterSpacing: -1,
    paddingVertical: Spacing.base,
  },
  textInput: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    ...Typography.body,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
    marginBottom: Spacing.lg,
  },
  saveBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  saveBtnText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.polarWhite },
});

// ── Main Screen ──────────────────────────────
export default function BudgetsScreen() {
  const [tab, setTab] = useState<BudgetTab>('budgets');
  const [period, setPeriod] = useState<Period>('monthly');
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [showAddRecurring, setShowAddRecurring] = useState(false);

  const { budgets, loading: bLoading } = useBudgets();
  const { monthly } = useMonthlyExpenses();
  const { recurring, overdue, upcoming, loading: rLoading } = useRecurring();
  const { wallets } = useWallets();

  const walletMap: Record<string, string> = {};
  wallets.forEach((w) => { walletMap[w.id] = w.name; });

  const catSpend: Record<string, number> = {};
  monthly.forEach((e) => { catSpend[e.category] = (catSpend[e.category] ?? 0) + e.amount; });

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + (catSpend[b.category] ?? 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {tab === 'budgets' ? 'Budgets' : 'Recurring'}
        </Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => tab === 'budgets' ? setShowAddBudget(true) : setShowAddRecurring(true)}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Sub-tabs */}
      <View style={styles.subTabs}>
        <TouchableOpacity
          style={[styles.subTab, tab === 'budgets' && styles.subTabActive]}
          onPress={() => setTab('budgets')}
        >
          <Text style={[styles.subTabText, tab === 'budgets' && styles.subTabTextActive]}>
            Budgets
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, tab === 'recurring' && styles.subTabActive]}
          onPress={() => setTab('recurring')}
        >
          <Text style={[styles.subTabText, tab === 'recurring' && styles.subTabTextActive]}>
            Recurring
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── BUDGETS TAB ── */}
        {tab === 'budgets' && (
          <>
            {/* Period filter */}
            <View style={styles.periodRow}>
              {(['weekly', 'monthly'] as Period[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodPill, period === p && styles.periodPillActive]}
                  onPress={() => setPeriod(p)}
                >
                  <Text style={[styles.periodPillText, period === p && styles.periodPillTextActive]}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Summary card */}
            {budgets.length > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Total Budget</Text>
                <Text style={styles.summaryAmount}>₹{totalBudget.toLocaleString('en-IN')}</Text>
                <ProgressBar value={totalSpent} max={totalBudget} />
                <Text style={styles.summaryMeta}>
                  ₹{totalSpent.toLocaleString('en-IN')} spent ·{' '}
                  ₹{Math.max(0, totalBudget - totalSpent).toLocaleString('en-IN')} remaining
                </Text>
              </View>
            )}

            {bLoading ? (
              <>
                <BudgetCardSkeleton />
                <BudgetCardSkeleton />
                <BudgetCardSkeleton />
              </>
            ) : budgets.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>📋</Text>
                <Text style={styles.emptyTitle}>No budgets set</Text>
                <Text style={styles.emptyText}>Tap + Add to set a spending limit per category.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAddBudget(true)}>
                  <Text style={styles.emptyBtnText}>Set First Budget</Text>
                </TouchableOpacity>
              </View>
            ) : (
              budgets.map((b) => {
                const spent = catSpend[b.category] ?? 0;
                const over = spent > b.limit;
                const cat = getCategoryDef(b.category);
                return (
                  <View key={b.id} style={styles.budgetCard}>
                    <View style={styles.budgetCardTop}>
                      <Text style={styles.budgetCatLabel}>
                        {cat.emoji} {cat.label}
                      </Text>
                      <Text style={[styles.budgetAmounts, over && { color: Colors.powerPink }]}>
                        ₹{spent.toLocaleString('en-IN')} / ₹{b.limit.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <ProgressBar
                      value={spent}
                      max={b.limit}
                      color={over ? Colors.powerPink : Colors.carbonBlack}
                    />
                    {over && (
                      <Text style={styles.overLabel}>
                        ⚠ Over by ₹{(spent - b.limit).toLocaleString('en-IN')}
                      </Text>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ── RECURRING TAB ── */}
        {tab === 'recurring' && (
          <>
            {rLoading ? (
              <ActivityIndicator color={Colors.carbonBlack} style={{ marginTop: 40 }} />
            ) : recurring.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🔄</Text>
                <Text style={styles.emptyTitle}>No recurring items</Text>
                <Text style={styles.emptyText}>Track subscriptions and regular bills.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAddRecurring(true)}>
                  <Text style={styles.emptyBtnText}>Add First Recurring</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {overdue.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { color: Colors.powerPink }]}>Overdue</Text>
                    {overdue.map((r) => (
                      <RecurringCard key={r.id} item={r} walletName={walletMap[r.walletId] ?? '—'} />
                    ))}
                  </>
                )}
                {upcoming.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Due Soon</Text>
                    {upcoming.map((r) => (
                      <RecurringCard key={r.id} item={r} walletName={walletMap[r.walletId] ?? '—'} />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Modals */}
      <AddBudgetSheet visible={showAddBudget} onClose={() => setShowAddBudget(false)} />
      <AddRecurringSheet visible={showAddRecurring} onClose={() => setShowAddRecurring(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvasIce },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.md,
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
  addBtnText: { ...Typography.bodyBold, fontSize: FontSize.sm, color: Colors.polarWhite },
  subTabs: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.base,
  },
  subTab: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.ghostGray,
  },
  subTabActive: { backgroundColor: Colors.carbonBlack },
  subTabText: { ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.mutedStone },
  subTabTextActive: { color: Colors.polarWhite },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  periodRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  periodPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.ghostGray,
  },
  periodPillActive: { backgroundColor: Colors.carbonBlack },
  periodPillText: { ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.mutedStone },
  periodPillTextActive: { color: Colors.polarWhite },
  summaryCard: {
    backgroundColor: Colors.creamCard,
    borderRadius: Radius['4xl'],
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  summaryLabel: { ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.mutedStone },
  summaryAmount: {
    ...Typography.heading,
    fontSize: FontSize['6xl'],
    color: Colors.carbonBlack,
    letterSpacing: -1.5,
  },
  summaryMeta: { ...Typography.body, fontSize: FontSize.sm, color: Colors.mutedStone },
  budgetCard: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.ghostGray,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  budgetCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetCatLabel: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.carbonBlack },
  budgetAmounts: { ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.mutedStone },
  overLabel: { ...Typography.bodyBold, fontSize: FontSize.sm, color: Colors.powerPink },
  sectionLabel: {
    ...Typography.bodyBold,
    fontSize: FontSize.lg,
    color: Colors.carbonBlack,
    marginBottom: Spacing.sm,
    marginTop: Spacing.base,
  },
  emptyBox: { alignItems: 'center', paddingVertical: Spacing['4xl'] },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: {
    ...Typography.bodyBold, fontSize: FontSize.xl,
    color: Colors.carbonBlack, marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.body, fontSize: FontSize.base,
    color: Colors.mutedStone, textAlign: 'center', marginBottom: Spacing.lg,
  },
  emptyBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  emptyBtnText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.polarWhite },
});
