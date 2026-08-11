// ─────────────────────────────────────────────
//  SPENDNOT — Budgets & To-Do Screen (Screen 5)
//  app/(tabs)/budgets.tsx
// ─────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  doc, updateDoc, setDoc, Timestamp, collection, addDoc, deleteDoc, query, where, onSnapshot, increment, writeBatch
} from 'firebase/firestore';
import { useBudgets } from '../../hooks/useBudgets';
import { useWallets } from '../../hooks/useWallets';
import { useEmis } from '../../hooks/useEmis';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  CATEGORIES, getCategoryDef, CategoryKey, WalletColors
} from '../../constants/theme';
import { Budget, Expense, ChecklistItem } from '../../types/models';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { BudgetCardSkeleton } from '../../components/Skeleton';
import { useChecklist } from '../../hooks/useChecklist';
import { EditChecklistItemSheet, ManageTemplatesSheet } from '../../components/ChecklistSheets';
import { useTabBarVisibility } from '../../context/TabBarVisibilityContext';
import { useCustomCategories } from '../../hooks/useCustomCategories';

type BudgetTab = 'budgets' | 'checklist' | 'emis';
type Period = 'weekly' | 'monthly';

// ── Add Category Modal ─────────────────────────
interface AddCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (emoji: string, label: string) => Promise<string | undefined>;
}

function AddCategoryModal({ visible, onClose, onAdd }: AddCategoryModalProps) {
  const [emoji, setEmoji] = useState('⭐');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) { Alert.alert('Name required', 'Enter a category name.'); return; }
    setSaving(true);
    try {
      await onAdd(emoji.trim() || '⭐', label.trim());
      setEmoji('⭐');
      setLabel('');
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen">
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <View style={{ flex: 1, justifyContent: 'center', padding: Spacing.xl, backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: Colors.polarWhite, borderRadius: Radius['2xl'], padding: Spacing.xl, gap: Spacing.base }}>
          <Text style={{ ...Typography.bodyBold, fontSize: FontSize.xl, color: Colors.carbonBlack }}>Add Category</Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <TextInput
              style={[sheetStyles.textInput, { width: 60, textAlign: 'center', fontSize: 24, marginBottom: 0 }]}
              value={emoji}
              onChangeText={setEmoji}
              placeholder="⭐"
              maxLength={4}
            />
            <TextInput
              style={[sheetStyles.textInput, { flex: 1, marginBottom: 0 }]}
              value={label}
              onChangeText={setLabel}
              placeholder="Category Name"
              autoFocus
            />
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
            <TouchableOpacity style={[sheetStyles.saveBtn, { flex: 1, backgroundColor: Colors.ghostGray }]} onPress={onClose}>
              <Text style={[sheetStyles.saveBtnText, { color: Colors.mutedStone }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sheetStyles.saveBtn, { flex: 1 }]} onPress={handleSave} disabled={saving}>
              <Text style={sheetStyles.saveBtnText}>{saving ? 'Adding…' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

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


// ── Budget Sheet (Add + Edit) ─────────────────
interface BudgetSheetProps {
  visible: boolean;
  onClose: () => void;
  existingBudget?: Budget | null; // if set → edit mode
}

function BudgetSheet({ visible, onClose, existingBudget }: BudgetSheetProps) {
  const { user } = useAuth();
  const isEdit = !!existingBudget;
  const { categories, addCustomCategory } = useCustomCategories();
  const [category, setCategory] = useState<string>('food');
  const [limit, setLimit] = useState('');
  const [period, setPeriod] = useState<Period>('monthly');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);

  // Pre-fill when editing
  useEffect(() => {
    if (existingBudget) {
      setCategory(existingBudget.category);
      setLimit(existingBudget.limit.toString());
      setPeriod(existingBudget.period as Period);
    } else {
      setCategory('food');
      setLimit('');
      setPeriod('monthly');
    }
  }, [existingBudget, visible]);

  const handleSave = async () => {
    if (!user) return;
    const amt = parseFloat(limit);
    if (!limit || isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid amount', 'Enter a budget limit greater than 0.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && existingBudget) {
        // Update existing budget
        await updateDoc(doc(db, 'budgets', existingBudget.id), { limit: amt, period });
      } else {
        // Create new (or overwrite with setDoc using deterministic ID)
        const budgetId = `${user.uid}_${category.replace(/:/g, '_')}_${period}`;
        await setDoc(doc(db, 'budgets', budgetId), {
          uid: user.uid,
          category,
          limit: amt,
          period,
          startDate: Timestamp.now(),
          createdAt: Timestamp.now(),
        });
      }
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
      Toast.show({ type: 'success', text1: isEdit ? 'Budget updated ✓' : 'Budget set ✓' });
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existingBudget) return;
    Alert.alert('Delete Budget', 'Remove this spending limit?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteDoc(doc(db, 'budgets', existingBudget.id));
            Toast.show({ type: 'success', text1: 'Budget deleted ✓' });
            onClose();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          } finally {
            setDeleting(false);
          }
        }
      }
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetStyles.wrapper}>
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.base }}>
            <Text style={sheetStyles.sheetTitle}>{isEdit ? 'Edit Budget' : 'Set Budget'}</Text>
            {isEdit && (
              <TouchableOpacity onPress={handleDelete} disabled={deleting}>
                <Text style={{ fontSize: 22, opacity: deleting ? 0.4 : 0.8 }}>🗑️</Text>
              </TouchableOpacity>
            )}
          </View>

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

          {!isEdit && (
            <>
              <Text style={sheetStyles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sheetStyles.catScroll}>
                <TouchableOpacity
                  style={sheetStyles.catCell}
                  onPress={() => setShowAddCat(true)}
                >
                  <Text style={sheetStyles.catEmoji}>＋</Text>
                  <Text style={sheetStyles.catLabel}>Add New</Text>
                </TouchableOpacity>
                {categories.map((c) => (
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
              </ScrollView>
            </>
          )}

          {isEdit && existingBudget && (
            <View style={{ backgroundColor: Colors.ghostGray, borderRadius: Radius.md, padding: Spacing.base, marginBottom: Spacing.base }}>
              <Text style={{ ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.mutedStone }}>Category</Text>
              <Text style={{ ...Typography.bodyBold, fontSize: FontSize.md, color: Colors.carbonBlack, marginTop: 4 }}>
                {getCategoryDef(existingBudget.category).emoji} {getCategoryDef(existingBudget.category).label}
              </Text>
            </View>
          )}

          <AddCategoryModal
            visible={showAddCat}
            onClose={() => setShowAddCat(false)}
            onAdd={async (emoji, label) => {
              const addedKey = await addCustomCategory(emoji, label);
              if (addedKey) setCategory(addedKey);
              return addedKey;
            }}
          />

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
              autoFocus={isEdit}
            />
          </View>

          <TouchableOpacity
            style={[sheetStyles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={sheetStyles.saveBtnText}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Set Budget'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Add Checklist Item Sheet ──────────────────
function AddChecklistItemSheet({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (name: string, amount: number, category: string, walletId: string) => Promise<void> }) {
  const { wallets } = useWallets();
  const { categories, addCustomCategory } = useCustomCategories();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('bills');
  const [walletId, setWalletId] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);

  useEffect(() => {
    if (wallets.length > 0 && !walletId) {
      const def = wallets.find(w => w.isDefault)?.id ?? wallets[0]?.id;
      if (def) setWalletId(def);
    }
  }, [wallets]);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!name.trim()) { Alert.alert('Name required', 'Enter a name.'); return; }
    if (!amount || isNaN(amt) || amt <= 0) { Alert.alert('Invalid amount', 'Enter an amount greater than 0.'); return; }
    if (!walletId) { Alert.alert('No wallet', 'Select a wallet.'); return; }

    setSaving(true);
    try {
      await onAdd(name.trim(), amt, category, walletId);
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
      setName(''); setAmount('');
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedWallet = walletId || wallets.find(w => w.isDefault)?.id || wallets[0]?.id || '';

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetStyles.wrapper}>
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.sheetTitle}>Add Monthly Bill</Text>

          <Text style={sheetStyles.label}>Item Name</Text>
          <TextInput
            style={sheetStyles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="Electricity, Gym, Rent..."
            placeholderTextColor={Colors.softStone}
          />

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

          <Text style={sheetStyles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sheetStyles.catScroll}>
            <TouchableOpacity
              style={sheetStyles.catCell}
              onPress={() => setShowAddCat(true)}
            >
              <Text style={sheetStyles.catEmoji}>＋</Text>
              <Text style={sheetStyles.catLabel}>Add New</Text>
            </TouchableOpacity>
            {categories.map((c) => (
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
          </ScrollView>

          <AddCategoryModal
            visible={showAddCat}
            onClose={() => setShowAddCat(false)}
            onAdd={async (emoji, label) => {
              const addedKey = await addCustomCategory(emoji, label);
              if (addedKey) setCategory(addedKey);
              return addedKey;
            }}
          />

          <Text style={sheetStyles.label}>Charge From Wallet</Text>
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

          <TouchableOpacity
            style={[sheetStyles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={sheetStyles.saveBtnText}>{saving ? 'Saving…' : 'Add Item'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Local EMI Approval Sheet ─────────────────
interface LocalEmiApproveSheetProps {
  visible: boolean;
  onClose: () => void;
  emi: any;
  onConfirm: (amount: number, walletId: string) => Promise<void>;
  wallets: any[];
}

function LocalEmiApproveSheet({ visible, onClose, emi, onConfirm, wallets }: LocalEmiApproveSheetProps) {
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
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetStyles.wrapper}>
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.sheetTitle}>Approve EMI Payment</Text>
          <Text style={styles.sheetSubTitle}>
            {emi.name} — Installment {emi.currentInstallment + 1} of {emi.totalInstallments}
          </Text>

          <Text style={sheetStyles.label}>Installment Amount (₹)</Text>
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

          <Text style={sheetStyles.label}>Pay From Wallet</Text>
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

          <TouchableOpacity
            style={[sheetStyles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleConfirm}
            disabled={saving}
          >
            <Text style={sheetStyles.saveBtnText}>{saving ? 'Approving…' : 'Approve Installment'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── EMI Card ─────────────────────────────────
function EmiCard({ item, walletName, onApprove, isPaidThisMonth }: { item: any; walletName: string; onApprove?: () => void; isPaidThisMonth: boolean }) {
  const cat = getCategoryDef(item.category);
  const totalRemaining = (item.totalInstallments - item.currentInstallment) * item.monthlyAmount;
  
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    Alert.alert(
      'Delete EMI Plan',
      'Are you sure you want to stop tracking this EMI? Existing logged transactions will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteDoc(doc(db, 'emis', item.id));
              Toast.show({ type: 'success', text1: 'EMI deleted ✓' });
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setDeleting(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={emiStyles.card}>
      <View style={emiStyles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={emiStyles.name}>{item.name}</Text>
          <Text style={emiStyles.sub}>
            {cat.emoji} {cat.label} · {walletName}
          </Text>
        </View>
        <TouchableOpacity onPress={handleDelete} disabled={deleting}>
          <Text style={emiStyles.deleteText}>🗑️</Text>
        </TouchableOpacity>
      </View>

      <View style={emiStyles.amountRow}>
        <Text style={emiStyles.amount}>₹{item.monthlyAmount.toLocaleString('en-IN')}/mo</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <Text style={emiStyles.due}>Due Day: {item.startDay}</Text>
          {isPaidThisMonth ? (
            <View style={emiStyles.paidBadge}>
              <Text style={emiStyles.paidBadgeText}>✓ Paid</Text>
            </View>
          ) : (
            onApprove && (
              <TouchableOpacity style={emiStyles.approveBtn} onPress={onApprove}>
                <Text style={emiStyles.approveBtnText}>Approve</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </View>

      <View style={emiStyles.progressContainer}>
        <ProgressBar value={item.currentInstallment} max={item.totalInstallments} color={Colors.periwinkle} />
        <View style={emiStyles.progressMeta}>
          <Text style={emiStyles.metaText}>
            Installment {item.currentInstallment} of {item.totalInstallments} paid
          </Text>
          <Text style={emiStyles.metaText}>
            ₹{totalRemaining.toLocaleString('en-IN')} remaining
          </Text>
        </View>
      </View>
    </View>
  );
}

const emiStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.ghostGray,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  name: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.carbonBlack },
  sub: { ...Typography.body, fontSize: FontSize.sm, color: Colors.mutedStone, marginTop: 2 },
  deleteText: { fontSize: 16, opacity: 0.7, padding: 2 },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  amount: { ...Typography.bodyBold, fontSize: FontSize.md, color: Colors.carbonBlack },
  due: { ...Typography.bodyBold, fontSize: FontSize.xs, color: Colors.mutedStone },
  progressContainer: { gap: Spacing.xs, marginTop: Spacing.xs },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { ...Typography.bodyMedium, fontSize: 11, color: Colors.mutedStone },
  approveBtn: {
    backgroundColor: Colors.limePop,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  approveBtnText: {
    ...Typography.bodyBold,
    fontSize: 10,
    color: Colors.carbonBlack,
  },
  paidBadge: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  paidBadgeText: {
    ...Typography.bodyBold,
    fontSize: 10,
    color: Colors.mutedStone,
  },
});

// ── Checklist Checkbox Component ─────────────
function ChecklistCheckbox({ isPaid, onPress }: { isPaid: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[
        styles.checkbox,
        isPaid ? styles.checkboxChecked : styles.checkboxUnchecked
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {isPaid && <Text style={styles.checkMark}>✓</Text>}
    </TouchableOpacity>
  );
}

// ── Main Screen ──────────────────────────────
export default function BudgetsScreen() {
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<BudgetTab>('budgets');
  const [period, setPeriod] = useState<Period>('monthly');
  const [showBudgetSheet, setShowBudgetSheet] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [showEditChecklist, setShowEditChecklist] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedChecklistItem, setSelectedChecklistItem] = useState<ChecklistItem | null>(null);

  // ── Multi-select state (shared between tabs) ──────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedBudgetIds, setSelectedBudgetIds] = useState<Record<string, boolean>>({});
  const [selectedChecklistIds, setSelectedChecklistIds] = useState<Record<string, boolean>>({});
  const { show: showTabBar, hide: hideTabBar, onScroll: tabBarOnScroll } = useTabBarVisibility();

  // Exit select mode when switching tabs
  useEffect(() => {
    setSelectMode(false);
    setSelectedBudgetIds({});
    setSelectedChecklistIds({});
  }, [tab]);

  // Hide tab bar in select mode
  useEffect(() => {
    if (selectMode) hideTabBar();
    else showTabBar();
  }, [selectMode]);

  // Month Tracker
  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [activeMonth, setActiveMonth] = useState(currentMonthStr);

  const activeMonthDate = useMemo(() => {
    const [y, m] = activeMonth.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }, [activeMonth]);

  const activeMonthLabel = useMemo(() => {
    return activeMonthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }, [activeMonthDate]);

  const handlePrevMonth = () => {
    const [y, m] = activeMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setActiveMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = activeMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    setActiveMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  // Expected Income State
  const [editIncome, setEditIncome] = useState(false);
  const [incomeVal, setIncomeVal] = useState('');
  const expectedIncome = profile?.expectedIncome ?? 0;

  useEffect(() => {
    if (expectedIncome) {
      setIncomeVal(expectedIncome.toString());
    } else {
      setIncomeVal('0');
    }
  }, [expectedIncome]);

  const saveExpectedIncome = async () => {
    if (!user) return;
    const val = parseFloat(incomeVal);
    if (isNaN(val) || val < 0) {
      Alert.alert('Invalid income', 'Enter a valid amount.');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', user.uid), { expectedIncome: val });
      setEditIncome(false);
      Toast.show({ type: 'success', text1: 'Expected Income saved ✓' });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  // Hooks data loading
  const { budgets, loading: bLoading } = useBudgets();
  const { emis, active: activeEmis, completed: completedEmis, loading: emiLoading } = useEmis();
  const { wallets } = useWallets();


  // Checklist Hook
  const {
    templates, checklist, loading: clLoading,
    addTemplate, deleteTemplate, addChecklistItem,
    updateChecklistItem, deleteChecklistItem, markPaid, unmarkPaid
  } = useChecklist(activeMonth);

  // EMI approvals details
  const [emiToApprove, setEmiToApprove] = useState<any | null>(null);
  const [approvingEmiId, setApprovingEmiId] = useState<string | null>(null);

  // Real-time monthly expenses/income filter inside screen for dynamic months
  const [actualIncome, setActualIncome] = useState(0);
  const [actualSpent, setActualSpent] = useState(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    if (!user) return;
    const [year, month] = activeMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const q = query(
      collection(db, 'expenses'),
      where('uid', '==', user.uid),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<', Timestamp.fromDate(end)),
      where('type', 'in', ['expense', 'income'])
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
      setMonthlyExpenses(items);

      const spent = items.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
      const inc = items.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
      setActualSpent(spent);
      setActualIncome(inc);
    });
    return unsub;
  }, [user?.uid, activeMonth]);

  const walletMap: Record<string, string> = {};
  wallets.forEach((w) => { walletMap[w.id] = w.name; });

  // Map category spent for budgets list
  const catSpend: Record<string, number> = {};
  monthlyExpenses.filter(e => e.type === 'expense').forEach((e) => {
    catSpend[e.category] = (catSpend[e.category] ?? 0) + e.amount;
  });

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpentInBudgets = budgets.reduce((s, b) => s + (catSpend[b.category] ?? 0), 0);

  // Checklist statistics
  const expectedChecklistTotal = checklist.reduce((s, item) => s + item.amount, 0);
  const paidChecklistTotal = checklist.filter(item => item.isPaid).reduce((s, item) => s + item.amount, 0);
  const paidChecklistCount = checklist.filter(item => item.isPaid).length;

  // Planned Outflows grouped by category to avoid double-counting overlapping budget envelopes and fixed bills/EMIs
  const expectedByCategory: Record<string, number> = {};
  checklist.forEach((item) => {
    expectedByCategory[item.category] = (expectedByCategory[item.category] ?? 0) + item.amount;
  });
  activeEmis.forEach((emi) => {
    expectedByCategory[emi.category] = (expectedByCategory[emi.category] ?? 0) + emi.monthlyAmount;
  });

  const allCategoriesSet = new Set<string>([
    ...budgets.map((b) => b.category),
    ...Object.keys(expectedByCategory),
  ]);

  let totalPlannedOutflow = 0;
  allCategoriesSet.forEach((cat) => {
    const budgetLimit = budgets.find((b) => b.category === cat)?.limit ?? 0;
    const expectedCatAmount = expectedByCategory[cat] ?? 0;
    totalPlannedOutflow += Math.max(budgetLimit, expectedCatAmount);
  });

  // Planned Savings Formula
  const plannedSavings = Math.max(0, expectedIncome - totalPlannedOutflow);
  const actualSavings = Math.max(0, actualIncome - actualSpent);

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
        lastPaidMonth: activeMonth, // prevent multiple approvals in active month
        active: !isFinished,
      });

      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
      Toast.show({
        type: 'success',
        text1: 'Installment paid ✓',
        text2: `${emi.name} recorded.`,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setApprovingEmiId(null);
    }
  };

  const pendingChecklist = checklist.filter(item => !item.isPaid);
  const paidChecklist = checklist.filter(item => item.isPaid);
  // Sorted list: unpaid first, then paid
  const sortedChecklist = [...pendingChecklist, ...paidChecklist];

  // ── Multi-select helpers ──────────────────────────────────
  const enterSelectMode = (type: 'budget' | 'checklist', id: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (_) {}
    setSelectMode(true);
    if (type === 'budget') setSelectedBudgetIds({ [id]: true });
    else setSelectedChecklistIds({ [id]: true });
  };

  const toggleBudgetSelect = (id: string) =>
    setSelectedBudgetIds(prev => ({ ...prev, [id]: !prev[id] }));

  const toggleChecklistSelect = (id: string) =>
    setSelectedChecklistIds(prev => ({ ...prev, [id]: !prev[id] }));

  const selectedBudgetCount = Object.values(selectedBudgetIds).filter(Boolean).length;
  const selectedChecklistCount = Object.values(selectedChecklistIds).filter(Boolean).length;
  const totalSelectedCount = (tab === 'budgets' ? selectedBudgetCount : selectedChecklistCount);

  const handleSelectAll = () => {
    if (tab === 'budgets') {
      const all: Record<string, boolean> = {};
      budgets.forEach(b => { all[b.id] = true; });
      setSelectedBudgetIds(all);
    } else {
      const all: Record<string, boolean> = {};
      sortedChecklist.forEach(c => { all[c.id] = true; });
      setSelectedChecklistIds(all);
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedBudgetIds({});
    setSelectedChecklistIds({});
  };

  const handleDeleteSelected = async () => {
    if (totalSelectedCount === 0) return;
    try {
      if (tab === 'budgets') {
        const ids = Object.keys(selectedBudgetIds).filter(id => selectedBudgetIds[id]);
        const batch = writeBatch(db);
        ids.forEach(id => batch.delete(doc(db, 'budgets', id)));
        await batch.commit();
        Toast.show({ type: 'success', text1: `${ids.length} budget${ids.length > 1 ? 's' : ''} deleted ✓` });
      } else {
        const ids = Object.keys(selectedChecklistIds).filter(id => selectedChecklistIds[id]);
        const batch = writeBatch(db);
        
        for (const id of ids) {
          const item = checklist.find(c => c.id === id);
          if (item) {
            if (item.isPaid) {
              if (item.expenseId) {
                batch.delete(doc(db, 'expenses', item.expenseId));
              }
              batch.update(doc(db, 'wallets', item.walletId), {
                balance: increment(item.amount),
              });
            }
            batch.delete(doc(db, 'checklist_items', id));
          }
        }
        
        await batch.commit();
        Toast.show({ type: 'success', text1: `${ids.length} item${ids.length > 1 ? 's' : ''} deleted ✓` });
      }
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (_) {}
      exitSelectMode();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Delete failed', text2: err.message });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {tab === 'budgets' ? 'Budgets' : tab === 'checklist' ? 'To-Do' : 'EMIs'}
        </Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (tab === 'budgets') { setSelectedBudget(null); setShowBudgetSheet(true); }
            else if (tab === 'checklist') setShowAddChecklist(true);
            else router.push('/modals/add-emi');
          }}
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
            Planning & Limits
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, tab === 'checklist' && styles.subTabActive]}
          onPress={() => setTab('checklist')}
        >
          <Text style={[styles.subTabText, tab === 'checklist' && styles.subTabTextActive]}>
            To-Do Checklist
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, tab === 'emis' && styles.subTabActive]}
          onPress={() => setTab('emis')}
        >
          <Text style={[styles.subTabText, tab === 'emis' && styles.subTabTextActive]}>
            EMIs
          </Text>
        </TouchableOpacity>
      </View>

      {/* Month Selector for Checklist & budgets tracking */}
      <View style={styles.monthSelectorRow}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.monthNavBtn}>
          <Text style={styles.monthNavText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabelText}>{activeMonthLabel}</Text>
        <TouchableOpacity onPress={handleNextMonth} style={styles.monthNavBtn}>
          <Text style={styles.monthNavText}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={tabBarOnScroll}
        scrollEventThrottle={16}
      >
        {/* ── BUDGETS TAB (PLANNING & LIMITS) ── */}
        {tab === 'budgets' && (
          <>
            {/* Income Planning Overview */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Expected Monthly Income</Text>
              {editIncome ? (
                <View style={styles.incomeEditRow}>
                  <Text style={styles.incomeRupee}>₹</Text>
                  <TextInput
                    style={styles.incomeInput}
                    value={incomeVal}
                    onChangeText={setIncomeVal}
                    keyboardType="numeric"
                    autoFocus
                    onBlur={saveExpectedIncome}
                    onSubmitEditing={saveExpectedIncome}
                  />
                  <TouchableOpacity onPress={saveExpectedIncome} style={styles.incomeSaveBtn}>
                    <Text style={{ fontSize: 16 }}>✓</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setEditIncome(true)} style={styles.incomeDisplayRow}>
                  <Text style={styles.summaryAmount}>₹{expectedIncome.toLocaleString('en-IN')}</Text>
                  <Text style={styles.editPen}>✏️</Text>
                </TouchableOpacity>
              )}

              {/* Planning Breakdown stats */}
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownCell}>
                  <Text style={styles.breakdownTitle}>Planned Limits</Text>
                  <Text style={styles.breakdownValue}>₹{totalBudget.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.breakdownCell}>
                  <Text style={styles.breakdownTitle}>Expected Bills</Text>
                  <Text style={styles.breakdownValue}>₹{expectedChecklistTotal.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.breakdownCell}>
                  <Text style={styles.breakdownTitle}>Planned Savings</Text>
                  <Text style={[styles.breakdownValue, { color: Colors.incomeText }]}>
                    ₹{plannedSavings.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              {/* Compare Actual vs Planned */}
              <View style={styles.actualSavingsCard}>
                <Text style={styles.actualSavingsTitle}>Actual Progress this Month</Text>
                <View style={styles.actualSavingsRow}>
                  <View>
                    <Text style={styles.actualSavingsLabel}>Income (Actual)</Text>
                    <Text style={styles.actualSavingsVal}>₹{actualIncome.toLocaleString('en-IN')}</Text>
                  </View>
                  <View>
                    <Text style={styles.actualSavingsLabel}>Spent (Actual)</Text>
                    <Text style={styles.actualSavingsVal}>₹{actualSpent.toLocaleString('en-IN')}</Text>
                  </View>
                  <View>
                    <Text style={styles.actualSavingsLabel}>Savings (Actual)</Text>
                    <Text style={[styles.actualSavingsVal, { color: Colors.incomeText }]}>
                      ₹{actualSavings.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Category Spending Limits</Text>

            {bLoading ? (
              <>
                <BudgetCardSkeleton />
                <BudgetCardSkeleton />
              </>
            ) : budgets.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>📋</Text>
                <Text style={styles.emptyTitle}>No budgets set</Text>
                <Text style={styles.emptyText}>Tap + Add to set a spending limit per category.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => { setSelectedBudget(null); setShowBudgetSheet(true); }}>
                  <Text style={styles.emptyBtnText}>Set First Budget</Text>
                </TouchableOpacity>
              </View>
            ) : (
              budgets.map((b) => {
                const spent = catSpend[b.category] ?? 0;
                const over = spent > b.limit;
                const cat = getCategoryDef(b.category);
                const isBudgetSelected = !!selectedBudgetIds[b.id];
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.budgetCard, isBudgetSelected && styles.cardSelected]}
                    onPress={() => {
                      if (selectMode) { toggleBudgetSelect(b.id); }
                      else { setSelectedBudget(b); setShowBudgetSheet(true); }
                    }}
                    onLongPress={() => enterSelectMode('budget', b.id)}
                    delayLongPress={350}
                    activeOpacity={0.75}
                  >
                    {selectMode && (
                      <View style={[
                        styles.selectionCheckbox,
                        isBudgetSelected && styles.selectionCheckboxActive,
                      ]}>
                        {isBudgetSelected && <Text style={styles.selectionCheckmark}>✓</Text>}
                      </View>
                    )}
                    <View style={styles.budgetCardTop}>
                      <Text style={styles.budgetCatLabel}>
                        {cat.emoji} {cat.label}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                        <Text style={[styles.budgetAmounts, over && { color: Colors.powerPink }]}>
                          ₹{spent.toLocaleString('en-IN')} / ₹{b.limit.toLocaleString('en-IN')}
                        </Text>
                        {!selectMode && <Text style={{ fontSize: 12, color: Colors.mutedStone }}>✏️</Text>}
                      </View>
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
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {/* ── TO-DO CHECKLIST TAB ── */}
        {tab === 'checklist' && (
          <>
            {/* Checklist Statistics */}
            {checklist.length > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>CHECKLIST PROGRESS</Text>
                <Text style={styles.summaryAmount}>
                  ₹{paidChecklistTotal.toLocaleString('en-IN')} / ₹{expectedChecklistTotal.toLocaleString('en-IN')}
                </Text>
                <ProgressBar value={paidChecklistTotal} max={expectedChecklistTotal} color={Colors.income} />
                <Text style={styles.summaryMeta}>
                  {paidChecklistCount} of {checklist.length} items paid
                </Text>
              </View>
            )}

            {clLoading ? (
              <ActivityIndicator color={Colors.carbonBlack} style={{ marginTop: 40 }} />
            ) : checklist.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🔄</Text>
                <Text style={styles.emptyTitle}>Checklist is empty</Text>
                <Text style={styles.emptyText}>Tap + Add to record a monthly bill, or use the Templates button to set up recurring defaults.</Text>
              </View>
            ) : (
              sortedChecklist.map((item) => {
                const cat = getCategoryDef(item.category);
                const isChecklistSelected = !!selectedChecklistIds[item.id];
                return (
                  <View
                    key={item.id}
                    style={[styles.checkRow, isChecklistSelected && styles.cardSelected]}
                  >
                    {selectMode ? (
                      <TouchableOpacity
                        style={[
                          styles.selectionCheckbox,
                          isChecklistSelected && styles.selectionCheckboxActive,
                        ]}
                        onPress={() => toggleChecklistSelect(item.id)}
                      >
                        {isChecklistSelected && <Text style={styles.selectionCheckmark}>✓</Text>}
                      </TouchableOpacity>
                    ) : (
                      <ChecklistCheckbox
                        isPaid={item.isPaid}
                        onPress={() => {
                          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch(e){}
                          if (item.isPaid) unmarkPaid(item); else markPaid(item);
                        }}
                      />
                    )}
                    <TouchableOpacity
                      style={[styles.checkCard, item.isPaid && styles.checkCardPaid]}
                      onPress={() => {
                        if (selectMode) { toggleChecklistSelect(item.id); }
                        else { setSelectedChecklistItem(item); setShowEditChecklist(true); }
                      }}
                      onLongPress={() => enterSelectMode('checklist', item.id)}
                      delayLongPress={350}
                    >
                      <View style={styles.checkLeft}>
                        <View style={[styles.checkEmojiBox, item.isPaid && { backgroundColor: Colors.ghostGray }]}>
                          <Text style={{ fontSize: 18 }}>{cat.emoji}</Text>
                        </View>
                        <View>
                          <Text style={[styles.checkName, item.isPaid && styles.checkNamePaid]}>
                            {item.name}
                          </Text>
                          <Text style={styles.checkWallet}>{walletMap[item.walletId] ?? 'Wallet'}</Text>
                        </View>
                      </View>
                      <View style={styles.checkRight}>
                        <Text style={[styles.checkAmount, item.isPaid && { color: Colors.mutedStone }]}>
                          ₹{item.amount.toLocaleString('en-IN')}
                        </Text>
                        {item.isPaid && <Text style={styles.paidStamp}>✓ Paid</Text>}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ── EMIS TAB ── */}
        {tab === 'emis' && (
          <View>
            {emiLoading ? (
              <ActivityIndicator color={Colors.carbonBlack} style={{ marginTop: 40 }} />
            ) : activeEmis.length === 0 && completedEmis.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>💳</Text>
                <Text style={styles.emptyTitle}>No EMI plans</Text>
                <Text style={styles.emptyText}>Track credit card installments and loans.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/modals/add-emi')}>
                  <Text style={styles.emptyBtnText}>Add First EMI</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {activeEmis.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Active Installments</Text>
                    {activeEmis.map((item) => {
                      const isPaidThisMonth = item.lastPaidMonth === activeMonth;
                      return (
                        <EmiCard
                          key={item.id}
                          item={item}
                          walletName={walletMap[item.walletId] ?? '—'}
                          isPaidThisMonth={isPaidThisMonth}
                          onApprove={!isPaidThisMonth ? () => setEmiToApprove(item) : undefined}
                        />
                      );
                    })}
                  </>
                )}

                {completedEmis.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: Spacing.lg, color: Colors.mutedStone }]}>
                      Completed
                    </Text>
                    {completedEmis.map((item) => (
                      <EmiCard
                        key={item.id}
                        item={item}
                        walletName={walletMap[item.walletId] ?? '—'}
                        isPaidThisMonth={true}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modals & Sheets */}
      <BudgetSheet
        visible={showBudgetSheet}
        onClose={() => { setShowBudgetSheet(false); setSelectedBudget(null); }}
        existingBudget={selectedBudget}
      />
      
      <AddChecklistItemSheet
        visible={showAddChecklist}
        onClose={() => setShowAddChecklist(false)}
        onAdd={addTemplate}
      />

      <EditChecklistItemSheet
        visible={showEditChecklist}
        onClose={() => {
          setShowEditChecklist(false);
          setSelectedChecklistItem(null);
        }}
        item={selectedChecklistItem}
        onUpdate={updateChecklistItem}
        onDelete={deleteChecklistItem}
      />

      <ManageTemplatesSheet
        visible={showTemplates}
        onClose={() => setShowTemplates(false)}
        templates={templates}
        onAdd={addTemplate}
        onDelete={deleteTemplate}
      />

      <LocalEmiApproveSheet
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

      {/* ── Floating Multi-Select Bar ── */}
      {selectMode && (tab === 'budgets' || tab === 'checklist') && (
        <View style={[styles.bulkBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.bulkBarInner}>
            <View style={styles.bulkLeft}>
              <View style={styles.bulkBadge}>
                <Text style={styles.bulkBadgeText}>{totalSelectedCount}</Text>
              </View>
              <Text style={styles.bulkCountLabel}>
                {totalSelectedCount === 0 ? 'Hold to select' : `item${totalSelectedCount > 1 ? 's' : ''} selected`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={handleSelectAll} style={styles.bulkActionBtn}>
                <Text style={styles.bulkActionBtnText}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={exitSelectMode} style={styles.bulkCancelBtn}>
                <Text style={styles.bulkCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              {totalSelectedCount > 0 && (
                <TouchableOpacity onPress={handleDeleteSelected} style={styles.bulkDeleteBtn}>
                  <Text style={styles.bulkDeleteBtnText}>🗑 Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────
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
    marginBottom: Spacing.sm,
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
  monthSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  monthNavBtn: {
    width: 32, height: 32,
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  monthNavText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.carbonBlack,
  },
  monthLabelText: {
    ...Typography.bodyBold,
    fontSize: FontSize.md,
    color: Colors.carbonBlack,
  },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: 120 },
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
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  summaryLabel: { ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.mutedStone },
  summaryAmount: {
    ...Typography.heading,
    fontSize: FontSize['5xl'],
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
  
  // Income edit styles
  incomeDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  editPen: {
    fontSize: 16,
    opacity: 0.6,
  },
  incomeEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
  },
  incomeRupee: {
    ...Typography.heading,
    fontSize: FontSize['2xl'],
    color: Colors.mutedStone,
    marginRight: 4,
  },
  incomeInput: {
    flex: 1,
    ...Typography.heading,
    fontSize: FontSize['3xl'],
    color: Colors.carbonBlack,
    paddingVertical: 4,
  },
  incomeSaveBtn: {
    padding: Spacing.sm,
  },
  
  // Planning Breakdown Table
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingTop: Spacing.md,
  },
  breakdownCell: {
    flex: 1,
    alignItems: 'flex-start',
  },
  breakdownTitle: {
    ...Typography.bodyMedium,
    fontSize: 10,
    color: Colors.mutedStone,
    textTransform: 'uppercase',
  },
  breakdownValue: {
    ...Typography.heading,
    fontSize: FontSize.md,
    color: Colors.carbonBlack,
    marginTop: 2,
  },
  
  // Actual progress card
  actualSavingsCard: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  actualSavingsTitle: {
    ...Typography.bodyBold,
    fontSize: 11,
    color: Colors.mutedStone,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  actualSavingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actualSavingsLabel: {
    ...Typography.body,
    fontSize: 10,
    color: Colors.mutedStone,
  },
  actualSavingsVal: {
    ...Typography.heading,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
    marginTop: 2,
  },

  // Checklist specific styles
  checklistActionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: Spacing.md,
  },
  outlineActionBtn: {
    borderWidth: 1,
    borderColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: Spacing.sm,
  },
  outlineActionBtnText: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.carbonBlack,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  checkCard: {
    flex: 1,
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.ghostGray,
    padding: Spacing.base,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkCardPaid: {
    flex: 1,
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.ghostGray,
    padding: Spacing.base,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    opacity: 0.65,
  },
  checkNamePaid: {
    textDecorationLine: 'line-through' as const,
    color: Colors.mutedStone,
  },
  paidStamp: {
    ...Typography.bodyBold,
    fontSize: 10,
    color: Colors.mutedStone,
    marginTop: 2,
  },
  checkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  checkEmojiBox: {
    width: 38, height: 38,
    backgroundColor: Colors.creamCard,
    borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  checkName: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  checkWallet: {
    ...Typography.body,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    marginTop: 2,
  },
  checkRight: {
    alignItems: 'flex-end',
  },
  checkAmount: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxUnchecked: {
    borderColor: Colors.mutedStone,
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    borderColor: Colors.limePop,
    backgroundColor: Colors.limePop,
  },
  checkMark: {
    color: Colors.carbonBlack,
    fontSize: FontSize.sm,
    fontWeight: '900',
  },
  sheetSubTitle: {
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
    marginTop: 4,
    marginBottom: Spacing.lg,
  },
  // ── Multi-select styles ────────────────────────────────
  cardSelected: {
    borderWidth: 2,
    borderColor: Colors.periwinkle,
    backgroundColor: '#EEF0FF',
  },
  selectionCheckbox: {
    width: 24, height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.softStone,
    backgroundColor: Colors.polarWhite,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: Spacing.sm,
    flexShrink: 0,
  },
  selectionCheckboxActive: {
    backgroundColor: Colors.periwinkle,
    borderColor: Colors.periwinkle,
  },
  selectionCheckmark: {
    ...Typography.bodyBold,
    fontSize: 13,
    color: Colors.polarWhite,
  },
  bulkBar: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.carbonBlack,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
  },
  bulkBarInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  bulkLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: Spacing.sm },
  bulkBadge: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: Colors.periwinkle,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  bulkBadgeText: { ...Typography.bodyBold, fontSize: 13, color: Colors.polarWhite },
  bulkCountLabel: { ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.polarWhite },
  bulkActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  bulkActionBtnText: { ...Typography.bodyBold, fontSize: FontSize.sm, color: Colors.polarWhite },
  bulkCancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  bulkCancelBtnText: { ...Typography.bodyBold, fontSize: FontSize.sm, color: Colors.polarWhite },
  bulkDeleteBtn: {
    backgroundColor: Colors.powerPink,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  bulkDeleteBtnText: { ...Typography.bodyBold, fontSize: FontSize.sm, color: Colors.polarWhite },
});

// ── Shared Add/Edit Sheet styles ───────────────
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
  catScroll: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
  },
  catCell: {
    width: 76,
    height: 76,
    borderRadius: Radius.md,
    backgroundColor: Colors.ghostGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
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
