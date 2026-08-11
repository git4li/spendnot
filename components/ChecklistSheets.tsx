// ─────────────────────────────────────────────
//  SPENDNOT — Checklist Modals & Sheets
//  components/ChecklistSheets.tsx
// ─────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Modal,
  KeyboardAvoidingView, Platform, Pressable, Alert
} from 'react-native';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  CATEGORIES, getCategoryDef, CategoryKey, WalletColors
} from '../constants/theme';
import { useWallets } from '../hooks/useWallets';
import { ChecklistItem, ChecklistTemplate } from '../types/models';
import * as Haptics from 'expo-haptics';
import { useCustomCategories } from '../hooks/useCustomCategories';

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

// ── Edit Checklist Item Sheet ─────────────────
interface EditChecklistItemSheetProps {
  visible: boolean;
  onClose: () => void;
  item: ChecklistItem | null;
  onUpdate: (id: string, updates: Partial<ChecklistItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function EditChecklistItemSheet({
  visible,
  onClose,
  item,
  onUpdate,
  onDelete,
}: EditChecklistItemSheetProps) {
  const { wallets } = useWallets();
  const { categories, addCustomCategory } = useCustomCategories();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('food');
  const [walletId, setWalletId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setAmount(item.amount.toString());
      setCategory(item.category);
      setWalletId(item.walletId);
    }
  }, [item]);

  const handleSave = async () => {
    if (!item) return;
    const amt = parseFloat(amount);
    if (!name.trim()) { Alert.alert('Name required', 'Enter a name for the item.'); return; }
    if (!amount || isNaN(amt) || amt <= 0) { Alert.alert('Invalid amount', 'Enter an amount greater than 0.'); return; }
    if (!walletId) { Alert.alert('No wallet', 'Select a source wallet.'); return; }

    setSaving(true);
    try {
      await onUpdate(item.id, {
        name: name.trim(),
        amount: amt,
        category,
        walletId,
      });
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    Alert.alert(
      'Delete Item',
      item.isPaid 
        ? 'Deleting this paid item will delete the logged transaction and refund the wallet. Continue?'
        : 'Are you sure you want to delete this checklist item for this month?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDelete(item.id);
              try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
              onClose();
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

  const selectedWallet = walletId || wallets.find(w => w.isDefault)?.id || wallets[0]?.id || '';

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetStyles.wrapper}>
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.sheetTitle}>Edit Item</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 450 }}>
            {/* Name */}
            <Text style={sheetStyles.label}>Name</Text>
            <TextInput
              style={sheetStyles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="Electricity, Gym, Rent..."
              placeholderTextColor={Colors.softStone}
              editable={!item?.isPaid}
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
                editable={!item?.isPaid}
              />
            </View>

            {/* Category selection */}
            <Text style={sheetStyles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sheetStyles.catScroll} pointerEvents={item?.isPaid ? 'none' : 'auto'}>
              {!item?.isPaid && (
                <TouchableOpacity
                  style={sheetStyles.catCell}
                  onPress={() => setShowAddCat(true)}
                >
                  <Text style={sheetStyles.catEmoji}>＋</Text>
                  <Text style={sheetStyles.catLabel}>Add New</Text>
                </TouchableOpacity>
              )}
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[sheetStyles.catCell, category === c.key && sheetStyles.catCellActive]}
                  onPress={() => setCategory(c.key)}
                  disabled={item?.isPaid}
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

            {/* Wallet Selection */}
            <Text style={sheetStyles.label}>Charge From Wallet</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.lg }}>
              <View style={sheetStyles.row}>
                {wallets.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[sheetStyles.pill, selectedWallet === w.id && sheetStyles.pillActive]}
                    onPress={() => setWalletId(w.id)}
                    disabled={item?.isPaid}
                  >
                    <Text style={[sheetStyles.pillText, selectedWallet === w.id && sheetStyles.pillTextActive]}>
                      {w.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {item?.isPaid && (
              <View style={sheetStyles.paidNotice}>
                <Text style={sheetStyles.paidNoticeText}>
                  💡 This item has been paid. To edit its details, first undo the payment in the checklist.
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm }}>
              <TouchableOpacity
                style={[sheetStyles.deleteBtn, (deleting) && { opacity: 0.6 }]}
                onPress={handleDelete}
                disabled={deleting}
              >
                <Text style={sheetStyles.deleteBtnText}>{deleting ? '...' : 'Delete'}</Text>
              </TouchableOpacity>
              
              {!item?.isPaid && (
                <TouchableOpacity
                  style={[sheetStyles.saveBtn, { flex: 2 }, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={sheetStyles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Manage Templates Sheet ────────────────────
interface ManageTemplatesSheetProps {
  visible: boolean;
  onClose: () => void;
  templates: ChecklistTemplate[];
  onAdd: (name: string, amount: number, category: string, walletId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ManageTemplatesSheet({
  visible,
  onClose,
  templates,
  onAdd,
  onDelete,
}: ManageTemplatesSheetProps) {
  const { wallets } = useWallets();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<CategoryKey>('bills');
  const [walletId, setWalletId] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (wallets.length > 0 && !walletId) {
      const def = wallets.find(w => w.isDefault)?.id ?? wallets[0]?.id;
      if (def) setWalletId(def);
    }
  }, [wallets]);

  const handleAddTemplate = async () => {
    const amt = parseFloat(amount);
    if (!name.trim()) { Alert.alert('Name required', 'Enter a name for the default item.'); return; }
    if (!amount || isNaN(amt) || amt <= 0) { Alert.alert('Invalid amount', 'Enter a default amount greater than 0.'); return; }
    if (!walletId) { Alert.alert('No wallet', 'Select a default source wallet.'); return; }

    setSaving(true);
    try {
      await onAdd(name.trim(), amt, category, walletId);
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
      setName('');
      setAmount('');
      setShowAddForm(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = (id: string, itemName: string) => {
    Alert.alert(
      'Remove Template',
      `Delete default monthly item "${itemName}"? This will not affect current active monthly lists.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await onDelete(id);
              try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          }
        }
      ]
    );
  };

  const selectedWallet = walletId || wallets.find(w => w.isDefault)?.id || wallets[0]?.id || '';
  const walletMap: Record<string, string> = {};
  wallets.forEach(w => walletMap[w.id] = w.name);

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetStyles.wrapper}>
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          
          <View style={sheetStyles.headerRow}>
            <Text style={sheetStyles.sheetTitle}>Checklist Defaults</Text>
            <TouchableOpacity
              style={sheetStyles.addDefaultToggle}
              onPress={() => setShowAddForm(!showAddForm)}
            >
              <Text style={sheetStyles.addDefaultToggleText}>
                {showAddForm ? '✕ Close' : '+ Add New'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
            {showAddForm ? (
              <View style={sheetStyles.addFormContainer}>
                <Text style={sheetStyles.formSectionTitle}>Add Default Monthly Expense</Text>
                
                <Text style={sheetStyles.label}>Item Name</Text>
                <TextInput
                  style={sheetStyles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Broadband, Rent, Gym"
                  placeholderTextColor={Colors.softStone}
                />

                <Text style={sheetStyles.label}>Default Amount (₹)</Text>
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
                  onPress={handleAddTemplate}
                  disabled={saving}
                >
                  <Text style={sheetStyles.saveBtnText}>{saving ? 'Adding…' : 'Add Default Item'}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={sheetStyles.label}>Templates ({templates.length})</Text>
            {templates.length === 0 ? (
              <View style={sheetStyles.emptyList}>
                <Text style={sheetStyles.emptyListText}>
                  No default expenses set. Add items to automatically generate checklists for future months.
                </Text>
              </View>
            ) : (
              templates.map((t) => {
                const cat = getCategoryDef(t.category);
                return (
                  <View key={t.id} style={sheetStyles.templateRow}>
                    <View style={sheetStyles.templateInfo}>
                      <Text style={sheetStyles.templateName}>{t.name}</Text>
                      <Text style={sheetStyles.templateSub}>
                        {cat.emoji} {cat.label} · {walletMap[t.walletId] ?? 'Default Wallet'}
                      </Text>
                    </View>
                    <View style={sheetStyles.templateRight}>
                      <Text style={sheetStyles.templateAmount}>₹{t.amount.toLocaleString('en-IN')}</Text>
                      <TouchableOpacity onPress={() => handleDeleteTemplate(t.id, t.name)}>
                        <Text style={sheetStyles.deleteIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  sheetTitle: {
    ...Typography.heading,
    fontSize: FontSize['2xl'],
    color: Colors.carbonBlack,
    letterSpacing: -0.5,
  },
  addDefaultToggle: {
    backgroundColor: Colors.ghostGray,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  addDefaultToggleText: {
    ...Typography.bodyBold,
    fontSize: FontSize.xs,
    color: Colors.carbonBlack,
  },
  label: {
    ...Typography.bodyBold,
    fontSize: FontSize.xs,
    color: Colors.mutedStone,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xs },
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
    marginBottom: Spacing.base,
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
    marginBottom: Spacing.xs,
  },
  catCellActive: { backgroundColor: Colors.carbonBlack },
  catEmoji: { fontSize: 18 },
  catLabel: { ...Typography.body, fontSize: 9, color: Colors.mutedStone },
  catLabelActive: { color: Colors.polarWhite },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.md,
  },
  rupee: { ...Typography.heading, fontSize: FontSize['xl'], color: Colors.mutedStone, marginRight: 4 },
  amountInput: {
    flex: 1,
    ...Typography.heading,
    fontSize: FontSize['2xl'],
    color: Colors.carbonBlack,
    letterSpacing: -0.5,
    paddingVertical: Spacing.sm,
  },
  textInput: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    ...Typography.body,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
    marginBottom: Spacing.md,
  },
  saveBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  saveBtnText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.polarWhite },
  deleteBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: Colors.danger,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  deleteBtnText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.danger },
  paidNotice: {
    backgroundColor: Colors.ghostGray,
    padding: Spacing.base,
    borderRadius: Radius.md,
    marginBottom: Spacing.base,
  },
  paidNoticeText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    lineHeight: 18,
  },
  addFormContainer: {
    backgroundColor: Colors.ghostGray + '44',
    borderWidth: 1,
    borderColor: Colors.ghostGray,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.xl,
  },
  formSectionTitle: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.carbonBlack,
    marginBottom: Spacing.md,
  },
  emptyList: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  emptyListText: {
    ...Typography.body,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    textAlign: 'center',
    lineHeight: 18,
  },
  templateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ghostGray,
  },
  templateInfo: { flex: 1 },
  templateName: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  templateSub: {
    ...Typography.body,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    marginTop: 2,
  },
  templateRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  templateAmount: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  deleteIcon: {
    fontSize: FontSize.lg,
    opacity: 0.8,
    padding: 4,
  },
});
