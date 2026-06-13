// ─────────────────────────────────────────────
//  SPENDNOT — Edit Expense Modal
//  app/modals/edit-expense.tsx
// ─────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
  Keyboard, TouchableWithoutFeedback, Modal, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  doc, getDoc, updateDoc, increment, Timestamp, deleteDoc, arrayUnion
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useWallets } from '../../hooks/useWallets';
import { useExpenses } from '../../hooks/useExpenses';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  CATEGORIES, getCategoryDef, WalletColors, CategoryDef,
} from '../../constants/theme';
import { TransactionType } from '../../types/models';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { confirmAction } from '../../lib/confirm';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

const formatDateString = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseDateString = (str: string): Date | null => {
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const yyyy = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10) - 1;
  const dd = parseInt(parts[2], 10);
  if (isNaN(yyyy) || isNaN(mm) || isNaN(dd)) return null;
  const d = new Date(yyyy, mm, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm || d.getDate() !== dd) return null;
  return d;
};

export default function EditExpenseModal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wallets } = useWallets();
  const { bottom } = useSafeAreaInsets();
  const { expenses } = useExpenses(100); // Load last 100 transactions for frequency sorting

  const KeyboardDismissWrapper = Platform.OS === 'web' ? React.Fragment : TouchableWithoutFeedback;
  const dismissProps = Platform.OS === 'web' ? {} : { onPress: Keyboard.dismiss };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalAmount, setOriginalAmount] = useState(0);
  const [originalWalletId, setOriginalWalletId] = useState('');
  const [originalToWalletId, setOriginalToWalletId] = useState('');
  const [originalType, setOriginalType] = useState<TransactionType>('expense');

  const [type, setType] = useState<TransactionType>('expense');
  const [walletId, setWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [category, setCategory] = useState('food');
  const [note, setNote] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);

  // Notes and Image states
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Calculator expression state
  const [expr, setExpr] = useState('0');

  // Custom category state persisted in Firestore
  const [dbCustomCats, setDbCustomCats] = useState<string[]>([]);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newEmoji, setNewEmoji] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Date and Time picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [pickerYear, setPickerYear] = useState(selectedDate.getFullYear());
  const [pickerMonth, setPickerMonth] = useState(selectedDate.getMonth());
  const [pickerDay, setPickerDay] = useState(selectedDate.getDate());
  const [pickerHour, setPickerHour] = useState(12);
  const [pickerMinute, setPickerMinute] = useState(0);
  const [pickerAmpm, setPickerAmpm] = useState('AM');

  // Sync date picker states when opened
  useEffect(() => {
    if (showDatePicker) {
      setPickerYear(selectedDate.getFullYear());
      setPickerMonth(selectedDate.getMonth());
      setPickerDay(selectedDate.getDate());
      let h = selectedDate.getHours();
      setPickerHour(h === 0 ? 12 : h > 12 ? h - 12 : h);
      setPickerMinute(Math.round(selectedDate.getMinutes() / 5) * 5 % 60);
      setPickerAmpm(selectedDate.getHours() >= 12 ? 'PM' : 'AM');
    }
  }, [showDatePicker, selectedDate]);

  // Keep transfer wallet selections distinct
  useEffect(() => {
    if (type === 'transfer') {
      if (walletId && toWalletId === walletId) {
        const other = wallets.find((w) => w.id !== walletId);
        if (other) {
          setToWalletId(other.id);
        } else {
          setToWalletId('');
        }
      } else if (!toWalletId && walletId) {
        const other = wallets.find((w) => w.id !== walletId);
        if (other) {
          setToWalletId(other.id);
        }
      }
    }
  }, [type, walletId, toWalletId, wallets]);

  const { user } = useAuth();

  // Load custom categories from Firestore
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists() && snap.data()?.customCategories) {
        setDbCustomCats(snap.data().customCategories);
      }
    });
  }, [user?.uid]);

  const parsedCustomCategories = useMemo(() => {
    return dbCustomCats.map((item) => {
      const [emoji, ...rest] = item.split(':');
      return { key: item, label: rest.join(':'), emoji } as CategoryDef;
    });
  }, [dbCustomCats]);

  const allCategories = useMemo(() => {
    return [...CATEGORIES, ...parsedCustomCategories];
  }, [parsedCustomCategories]);

  // Sort categories dynamically by usage frequency
  const sortedCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    expenses.forEach((e) => {
      counts[e.category] = (counts[e.category] ?? 0) + 1;
    });

    return [...allCategories].sort((a, b) => {
      const countA = counts[a.key] ?? 0;
      const countB = counts[b.key] ?? 0;
      if (countA !== countB) return countB - countA;
      return 0; // maintain default ordering for ties
    });
  }, [allCategories, expenses]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return sortedCategories;
    return sortedCategories.filter(c => c.label.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [sortedCategories, searchQuery]);

  const handleAddCustomCategory = async () => {
    if (!user) return;
    const emoji = newEmoji.trim() || '⭐';
    const label = newLabel.trim();
    if (!label) {
      Toast.show({ type: 'error', text1: 'Name required', text2: 'Please enter a category name.' });
      return;
    }
    const key = `${emoji}:${label}`;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        customCategories: arrayUnion(key),
      });

      setDbCustomCats((prev) => [...prev, key]);
      setCategory(key);
      setNewEmoji('');
      setNewLabel('');
      setShowAddCat(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to save', text2: err.message });
    }
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'expenses', id));
        if (snap.exists()) {
          const d = snap.data();
          setType(d.type);
          setExpr(String(d.amount));
          setWalletId(d.walletId);
          setToWalletId(d.toWalletId ?? '');
          setCategory(d.category);
          setNote(d.note ?? '');
          setPhotoUri(d.photoUri ?? null);
          setIsRecurring(d.isRecurring ?? false);
          setOriginalAmount(d.amount);
          setOriginalWalletId(d.walletId);
          setOriginalToWalletId(d.toWalletId ?? '');
          setOriginalType(d.type);
          
          if (d.date) {
            setSelectedDate(d.date.toDate());
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const evaluateExpr = (s: string): number => {
    let cleaned = s.replace(/[+-]+$/, ''); // Strip trailing operators
    if (!cleaned) return 0;

    const tokens = cleaned.match(/(\d+\.?\d*)|[+-]/g);
    if (!tokens) return 0;

    let result = 0;
    let op = '+';
    for (const token of tokens) {
      if (token === '+' || token === '-') {
        op = token;
      } else {
        const num = parseFloat(token);
        if (!isNaN(num)) {
          if (op === '+') {
            result += num;
          } else {
            result -= num;
          }
        }
      }
    }
    return result;
  };

  const handleKeyInput = (key: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    if (key === 'backspace') {
      setExpr(prev => {
        if (prev.length <= 1) return '0';
        return prev.slice(0, -1);
      });
    } else if (key === '+' || key === '-') {
      setExpr(prev => {
        const lastChar = prev.slice(-1);
        if (['+', '-'].includes(lastChar)) {
          return prev.slice(0, -1) + key;
        }
        return prev + key;
      });
    } else if (key === '.') {
      setExpr(prev => {
        const parts = prev.split(/[+-]/);
        const lastPart = parts[parts.length - 1];
        if (lastPart.includes('.')) return prev;
        return prev + '.';
      });
    } else if (key === 'submit') {
      handleSave();
    } else {
      // Number digit
      setExpr(prev => {
        if (prev === '0') return key;
        return prev + key;
      });
    }
  };

  const handleSelectPhoto = async () => {
    Alert.alert(
      'Attach Photo',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Toast.show({ type: 'error', text1: 'Permission denied', text2: 'Camera access is required.' });
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]?.uri) {
              setPhotoUri(result.assets[0].uri);
            }
          }
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Toast.show({ type: 'error', text1: 'Permission denied', text2: 'Media library access is required.' });
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]?.uri) {
              setPhotoUri(result.assets[0].uri);
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const saveImageLocally = async (tempUri: string): Promise<string> => {
    if (Platform.OS === 'web') return tempUri;
    try {
      const filename = `${Date.now()}_spendnot.jpg`;
      const destUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.copyAsync({
        from: tempUri,
        to: destUri,
      });
      return destUri;
    } catch (err) {
      console.log('Error saving image locally:', err);
      return tempUri;
    }
  };

  const handleSave = async () => {
    if (!user) {
      Toast.show({ type: 'error', text1: 'Not logged in', text2: 'Please log in first.' });
      return;
    }
    const amt = evaluateExpr(expr);
    if (isNaN(amt) || amt <= 0) {
      Toast.show({ type: 'error', text1: 'Invalid amount', text2: 'Please enter a valid amount.' });
      return;
    }
    if (!walletId) {
      Toast.show({ type: 'error', text1: 'No wallet', text2: 'Please select a wallet.' });
      return;
    }
    if (type === 'transfer' && !toWalletId) {
      Toast.show({ type: 'error', text1: 'No destination', text2: 'Please select a destination wallet.' });
      return;
    }
    if (type === 'transfer' && walletId === toWalletId) {
      Toast.show({ type: 'error', text1: 'Invalid transfer', text2: 'Source and destination wallets must be different.' });
      return;
    }

    setSaving(true);
    try {
      let savedPhotoUri = photoUri;
      if (photoUri && !photoUri.startsWith('file://')) {
        savedPhotoUri = await saveImageLocally(photoUri);
      }

      await updateDoc(doc(db, 'expenses', id), {
        type, 
        amount: amt, 
        walletId, 
        toWalletId: type === 'transfer' ? toWalletId : null,
        category: type === 'transfer' ? 'transfer' : category,
        note: note.trim() || null, 
        photoUri: savedPhotoUri,
        isRecurring,
        date: Timestamp.fromDate(selectedDate),
        updatedAt: Timestamp.now(),
      });

      if (originalType === 'transfer') {
        await updateDoc(doc(db, 'wallets', originalWalletId), {
          balance: increment(originalAmount),
        });
        if (originalToWalletId) {
          await updateDoc(doc(db, 'wallets', originalToWalletId), {
            balance: increment(-originalAmount),
          });
        }
      } else {
        const originalDelta = originalType === 'income' ? -originalAmount : originalAmount;
        await updateDoc(doc(db, 'wallets', originalWalletId), {
          balance: increment(originalDelta),
        });
      }

      if (type === 'transfer') {
        await updateDoc(doc(db, 'wallets', walletId), {
          balance: increment(-amt),
        });
        await updateDoc(doc(db, 'wallets', toWalletId), {
          balance: increment(amt),
        });
      } else {
        const newDelta = type === 'income' ? amt : -amt;
        await updateDoc(doc(db, 'wallets', walletId), {
          balance: increment(newDelta),
        });
      }

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
      
      const label = type === 'transfer' ? 'Transfer' : type.charAt(0).toUpperCase() + type.slice(1);
      Toast.show({ type: 'success', text1: `${label} updated ✓` });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!user) return;
    confirmAction(
      'Delete Entry',
      'Are you sure you want to delete this transaction? This cannot be undone.',
      async () => {
        setSaving(true);
        try {
          await deleteDoc(doc(db, 'expenses', id));
          
          if (originalType === 'transfer') {
            await updateDoc(doc(db, 'wallets', originalWalletId), {
              balance: increment(originalAmount),
            });
            if (originalToWalletId) {
              await updateDoc(doc(db, 'wallets', originalToWalletId), {
                balance: increment(-originalAmount),
              });
            }
          } else {
            const originalDelta = originalType === 'income' ? -originalAmount : originalAmount;
            await updateDoc(doc(db, 'wallets', originalWalletId), {
              balance: increment(originalDelta),
            });
          }

          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {}
          Toast.show({ type: 'success', text1: 'Deleted ✓' });
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)');
          }
        } catch (err: any) {
          Toast.show({ type: 'error', text1: 'Delete failed', text2: err.message });
        } finally {
          setSaving(false);
        }
      }
    );
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const generateCalendarDays = (year: number, month: number) => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const calendarDays = useMemo(() => {
    return generateCalendarDays(pickerYear, pickerMonth);
  }, [pickerYear, pickerMonth]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (pickerMonth === 0) {
      setPickerMonth(11);
      setPickerYear(y => y - 1);
    } else {
      setPickerMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (pickerMonth === 11) {
      setPickerMonth(0);
      setPickerYear(y => y + 1);
    } else {
      setPickerMonth(m => m + 1);
    }
  };

  const handleConfirmDatePicker = () => {
    let h = pickerHour;
    if (pickerAmpm === 'PM' && h !== 12) h += 12;
    if (pickerAmpm === 'AM' && h === 12) h = 0;
    const newD = new Date(pickerYear, pickerMonth, pickerDay, h, pickerMinute);
    setSelectedDate(newD);
    setShowDatePicker(false);
  };

  const formatKeyboardDateTime = (d: Date): string => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hourStr = String(hours).padStart(2, '0');
    return `${dd}/${mm}\n${hourStr}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={Colors.carbonBlack} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* @ts-ignore */}
      <KeyboardDismissWrapper {...dismissProps}>
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Edit Entry</Text>
            <TouchableOpacity onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)');
              }
            }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Expense / Income / Savings / Self-transfer segmented control */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.pillRow, { marginBottom: 0 }]}
            style={{ marginBottom: Spacing.base, maxHeight: 50, flexGrow: 0 }}
          >
            {(['expense', 'income', 'savings', 'transfer'] as TransactionType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.pill, type === t && styles.pillActive, { minWidth: 105, marginRight: Spacing.xs }]}
                onPress={() => { setType(t); Haptics.selectionAsync(); }}
                activeOpacity={0.8}
              >
                {type === t && <Text style={styles.pillTick}>✓ </Text>}
                <Text style={[styles.pillText, type === t && styles.pillTextActive]}>
                  {t === 'transfer' ? 'Transfer' : t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            
            {/* Circular Category Grid with Search */}
            {type !== 'transfer' && (
              <>
                <View style={styles.searchContainer}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="🔍 Search category..."
                    placeholderTextColor={Colors.mutedStone}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>
                <ScrollView 
                  style={styles.catGridScroll} 
                  contentContainerStyle={styles.catGridContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {filteredCategories.map((c) => {
                    const selected = category === c.key;
                    return (
                      <TouchableOpacity
                        key={c.key}
                        style={styles.catGridItem}
                        onPress={() => { setCategory(c.key); Haptics.selectionAsync(); }}
                      >
                        <View style={[styles.catCircle, selected && styles.catCircleSelected]}>
                          <Text style={styles.catEmojiText}>{c.emoji}</Text>
                        </View>
                        <Text style={[styles.catGridLabel, selected && styles.catGridLabelActive]} numberOfLines={1}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={styles.catGridItem}
                    onPress={() => setShowAddCat(true)}
                  >
                    <View style={[styles.catCircle, styles.catCircleAdd]}>
                      <Text style={styles.catAddPlusText}>+</Text>
                    </View>
                    <Text style={styles.catGridLabel} numberOfLines={1}>
                      New
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* Wallet selector */}
            <Text style={styles.fieldLabel}>{type === 'transfer' ? 'From wallet' : 'Wallet'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walletPillsRow}>
              {wallets.map((w) => {
                const wColors = WalletColors[w.type] ?? { bg: Colors.ghostGray, text: Colors.carbonBlack };
                const selected = walletId === w.id;
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.walletPill, { backgroundColor: wColors.bg }, selected && styles.walletPillSelected]}
                    onPress={() => { setWalletId(w.id); Haptics.selectionAsync(); }}
                  >
                    {selected && <Text style={[styles.walletTick, { color: wColors.text }]}>✓ </Text>}
                    <Text style={[styles.walletPillText, { color: wColors.text }]}>{w.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {type === 'transfer' && (
              <>
                <Text style={styles.fieldLabel}>To wallet</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walletPillsRow}>
                  {wallets.map((w) => {
                    const wColors = WalletColors[w.type] ?? { bg: Colors.ghostGray, text: Colors.carbonBlack };
                    const selected = toWalletId === w.id;
                    const isSource = walletId === w.id;
                    if (isSource) return null;
                    return (
                      <TouchableOpacity
                        key={w.id}
                        style={[styles.walletPill, { backgroundColor: wColors.bg }, selected && styles.walletPillSelected]}
                        onPress={() => { setToWalletId(w.id); Haptics.selectionAsync(); }}
                      >
                        {selected && <Text style={[styles.walletTick, { color: wColors.text }]}>✓ </Text>}
                        <Text style={[styles.walletPillText, { color: wColors.text }]}>{w.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Note, Photo row & Amount display box */}
            <View style={styles.amountPanelRow}>
              <View style={styles.mediaActions}>
                <TouchableOpacity 
                  style={[styles.mediaBtn, note.trim().length > 0 && styles.mediaBtnActive]} 
                  onPress={() => setShowNoteModal(true)}
                >
                  <Text style={styles.mediaBtnText}>💬</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.mediaBtn, photoUri !== null && styles.mediaBtnActive]} 
                  onPress={handleSelectPhoto}
                >
                  <Text style={styles.mediaBtnText}>📷</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.amountBox}>
                <Text style={styles.amountCurrencySymbol}>₹</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.amountExprScroll}
                >
                  <Text style={styles.amountExprText}>
                    {expr || '0'}
                  </Text>
                </ScrollView>
              </View>
            </View>

            {/* Thumbnail/Attached Note & Photo Previews */}
            {photoUri && (
              <View style={styles.photoPreviewRow}>
                <Text style={styles.photoAttachedText}>📷 Photo attached ✓</Text>
                <TouchableOpacity onPress={() => setPhotoUri(null)}>
                  <Text style={styles.removePhotoText}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}

            {note.trim().length > 0 && (
              <View style={styles.notePreviewRow}>
                <Text style={styles.notePreviewText} numberOfLines={1}>
                  📝 {note}
                </Text>
                <TouchableOpacity onPress={() => setNote('')}>
                  <Text style={styles.removePhotoText}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Custom Keyboard grid */}
            <View style={styles.keyboardContainer}>
              <View style={styles.keyboardRow}>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('1')}>
                  <Text style={styles.keyText}>1</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('2')}>
                  <Text style={styles.keyText}>2</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('3')}>
                  <Text style={styles.keyText}>3</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.keyBtn, styles.dateKeyBtn]} onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.dateKeyText}>{formatKeyboardDateTime(selectedDate)}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.keyboardRow}>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('4')}>
                  <Text style={styles.keyText}>4</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('5')}>
                  <Text style={styles.keyText}>5</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('6')}>
                  <Text style={styles.keyText}>6</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.keyBtn, styles.opKeyBtn]} onPress={() => handleKeyInput('+')}>
                  <Text style={styles.keyText}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.keyboardRow}>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('7')}>
                  <Text style={styles.keyText}>7</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('8')}>
                  <Text style={styles.keyText}>8</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('9')}>
                  <Text style={styles.keyText}>9</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.keyBtn, styles.opKeyBtn]} onPress={() => handleKeyInput('-')}>
                  <Text style={styles.keyText}>−</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.keyboardRow}>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('.')}>
                  <Text style={styles.keyText}>.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('0')}>
                  <Text style={styles.keyText}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('backspace')}>
                  <Text style={styles.keyText}>⌫</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.keyBtn, styles.submitKeyBtn]} onPress={() => handleKeyInput('submit')}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.submitKeyText}>✓</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Recurring */}
            <Text style={styles.fieldLabel}>Frequency</Text>
            <View style={styles.pillRow}>
              {[false, true].map((val) => (
                <TouchableOpacity
                  key={val ? 'recurring' : 'one-time'}
                  style={[styles.pill, isRecurring === val && styles.pillActive]}
                  onPress={() => { setIsRecurring(val); Haptics.selectionAsync(); }}
                >
                  {isRecurring === val && <Text style={styles.pillTick}>✓ </Text>}
                  <Text style={[styles.pillText, isRecurring === val && styles.pillTextActive]}>
                    {val ? '🔁 Recurring' : '1️⃣ One-time'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.deleteBtn, saving && { opacity: 0.6 }, { marginBottom: Math.max(bottom - 8, 8) }]}
            onPress={handleDelete}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.deleteBtnText}>Delete Transaction</Text>
          </TouchableOpacity>
        </View>
      </KeyboardDismissWrapper>

      {/* Custom Date & Time Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Select Date & Time</Text>

                <View style={styles.pickerHeader}>
                  <TouchableOpacity onPress={handlePrevMonth}>
                    <Text style={styles.pickerArrow}>◀</Text>
                  </TouchableOpacity>
                  <Text style={styles.pickerMonthTitle}>
                    {monthNames[pickerMonth]} {pickerYear}
                  </Text>
                  <TouchableOpacity onPress={handleNextMonth}>
                    <Text style={styles.pickerArrow}>▶</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.weekdaysRow}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                    <Text key={i} style={styles.weekdayText}>{day}</Text>
                  ))}
                </View>

                <View style={styles.daysGrid}>
                  {calendarDays.map((day, idx) => {
                    const isSelected = day === pickerDay;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                        disabled={day === null}
                        onPress={() => day && setPickerDay(day)}
                      >
                        <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected, !day && { color: 'transparent' }]}>
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.pickerSectionTitle}>Time</Text>
                
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => {
                    const isSelected = pickerHour === h;
                    return (
                      <TouchableOpacity
                        key={h}
                        style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                        onPress={() => setPickerHour(h)}
                      >
                        <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>
                          {h}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
                    const isSelected = pickerMinute === m;
                    const displayMin = String(m).padStart(2, '0');
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                        onPress={() => setPickerMinute(m)}
                      >
                        <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>
                          {displayMin}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.ampmRow}>
                  {['AM', 'PM'].map((mode) => {
                    const isSelected = pickerAmpm === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.ampmChip, isSelected && styles.ampmChipSelected]}
                        onPress={() => setPickerAmpm(mode)}
                      >
                        <Text style={[styles.ampmChipText, isSelected && styles.ampmChipTextSelected]}>
                          {mode}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalAddBtn} onPress={handleConfirmDatePicker}>
                    <Text style={styles.modalAddText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Note input Modal */}
      <Modal visible={showNoteModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowNoteModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Add Note</Text>
                <TextInput
                  style={styles.modalInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Enter transaction note..."
                  placeholderTextColor={Colors.mutedStone}
                  maxLength={100}
                  autoFocus
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalAddBtn} onPress={() => setShowNoteModal(false)}>
                    <Text style={styles.modalAddText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Add Custom Category Modal */}
      <Modal visible={showAddCat} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => { setShowAddCat(false); Keyboard.dismiss(); }}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>New Category</Text>
                <View style={styles.modalRow}>
                  <TextInput
                    style={[styles.modalInput, styles.emojiInput]}
                    value={newEmoji}
                    onChangeText={setNewEmoji}
                    placeholder="😀"
                    placeholderTextColor={Colors.mutedStone}
                    maxLength={2}
                  />
                  <TextInput
                    style={[styles.modalInput, { flex: 1 }]}
                    value={newLabel}
                    onChangeText={setNewLabel}
                    placeholder="Category name"
                    placeholderTextColor={Colors.mutedStone}
                    maxLength={20}
                  />
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowAddCat(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalAddBtn} onPress={handleAddCustomCategory}>
                    <Text style={styles.modalAddText}>Add</Text>
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
  safe: { flex: 1, backgroundColor: Colors.polarWhite },
  sheet: {
    flex: 1,
    backgroundColor: Colors.polarWhite,
    borderTopLeftRadius: Radius['4xl'],
    borderTopRightRadius: Radius['4xl'],
    padding: Spacing.lg,
    paddingTop: Spacing.base,
  },
  dragHandle: {
    width: 40, height: 4,
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  headerTitle: { ...Typography.bodyBold, fontSize: FontSize.xl, color: Colors.carbonBlack },
  cancelText: { ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.mutedStone },
  // Pill selectors
  pillRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  pill: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: 10,
    backgroundColor: Colors.ghostGray,
  },
  pillActive: { backgroundColor: Colors.carbonBlack },
  pillTick: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.polarWhite },
  pillText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.mutedStone },
  pillTextActive: { color: Colors.polarWhite },
  fieldLabel: {
    ...Typography.bodyBold, fontSize: FontSize.base,
    color: Colors.carbonBlack, marginBottom: Spacing.sm, marginTop: Spacing.xs,
  },
  // Wallet
  walletPillsRow: { gap: Spacing.sm, marginBottom: Spacing.lg },
  walletPill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base, paddingVertical: 9,
    borderWidth: 2, borderColor: 'transparent',
  },
  walletPillSelected: { borderColor: Colors.carbonBlack },
  walletTick: { ...Typography.bodyBold, fontSize: FontSize.sm },
  walletPillText: { ...Typography.bodyBold, fontSize: FontSize.sm },

  // Circular Category grid & search styles
  searchContainer: {
    marginBottom: Spacing.sm,
  },
  searchInput: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
    ...Typography.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.carbonBlack,
  },
  catGridScroll: {
    maxHeight: 180,
    marginBottom: Spacing.md,
  },
  catGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
    rowGap: Spacing.md,
  },
  catGridItem: {
    width: '25%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  catCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  catCircleSelected: {
    borderColor: '#FF3B30', // Red selection border
  },
  catCircleAdd: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.mutedStone,
    borderStyle: 'dashed',
  },
  catEmojiText: {
    fontSize: 22,
  },
  catAddPlusText: {
    fontSize: 22,
    color: Colors.mutedStone,
  },
  catGridLabel: {
    ...Typography.bodyMedium,
    fontSize: 11,
    color: Colors.mutedStone,
    textAlign: 'center',
  },
  catGridLabelActive: {
    color: Colors.carbonBlack,
    fontWeight: 'bold',
  },

  // Amount panel & note/photo row
  amountPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
    marginTop: Spacing.xs,
  },
  mediaActions: {
    flexDirection: 'column',
    gap: Spacing.sm,
  },
  mediaBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  mediaBtnActive: {
    backgroundColor: Colors.carbonBlack,
    borderColor: Colors.carbonBlack,
  },
  mediaBtnText: {
    fontSize: 18,
  },
  amountBox: {
    flex: 1,
    height: 96,
    borderRadius: Radius.lg,
    backgroundColor: '#2A2A2A', // Deep gray box matching image 2
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    justifyContent: 'space-between',
  },
  amountCurrencySymbol: {
    fontSize: FontSize['4xl'],
    color: '#ffffff',
    fontWeight: 'bold',
    marginRight: Spacing.xs,
  },
  amountExprScroll: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexGrow: 1,
  },
  amountExprText: {
    ...Typography.heading,
    fontSize: FontSize['6xl'],
    color: '#ffffff',
    textAlign: 'right',
  },
  photoPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
    marginBottom: Spacing.base,
  },
  photoAttachedText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
  },
  notePreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
    marginBottom: Spacing.base,
  },
  notePreviewText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    flex: 1,
    marginRight: Spacing.base,
  },
  removePhotoText: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.danger,
  },

  // Custom keyboard
  keyboardContainer: {
    gap: Spacing.sm,
    marginBottom: Spacing.base,
    backgroundColor: '#EFEFEF', // Light gray background area for keyboard layout
    borderRadius: Radius.lg,
    padding: Spacing.sm,
  },
  keyboardRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  keyBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: '#FFFFFF', // Solid light key background for high contrast
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.carbonBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  keyText: {
    ...Typography.bodyBold,
    fontSize: FontSize.xl,
    color: Colors.carbonBlack,
  },
  opKeyBtn: {
    backgroundColor: '#E5E5E5',
  },
  dateKeyBtn: {
    backgroundColor: '#E5E5E5',
    paddingVertical: 2,
  },
  dateKeyText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.carbonBlack,
    textAlign: 'center',
    lineHeight: 13,
  },
  submitKeyBtn: {
    backgroundColor: '#1A1A1A',
  },
  submitKeyText: {
    ...Typography.bodyBold,
    fontSize: FontSize.xl,
    color: '#ffffff',
  },

  // Custom picker styles
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  pickerArrow: {
    fontSize: 18,
    color: Colors.mutedStone,
    paddingHorizontal: Spacing.sm,
  },
  pickerMonthTitle: {
    ...Typography.bodyBold,
    fontSize: FontSize.md,
    color: Colors.carbonBlack,
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.xs,
  },
  weekdayText: {
    ...Typography.bodyBold,
    fontSize: FontSize.xs,
    color: Colors.mutedStone,
    width: 32,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginBottom: Spacing.md,
  },
  dayCell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    marginVertical: 2,
  },
  dayCellSelected: {
    backgroundColor: '#FF3B30',
  },
  dayCellText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.carbonBlack,
  },
  dayCellTextSelected: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  pickerSectionTitle: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.carbonBlack,
    marginBottom: Spacing.xs,
    marginTop: Spacing.xs,
  },
  timeScroll: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  timeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.ghostGray,
    marginRight: 6,
  },
  timeChipSelected: {
    backgroundColor: Colors.carbonBlack,
  },
  timeChipText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
  },
  timeChipTextSelected: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  ampmRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  ampmChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.ghostGray,
    alignItems: 'center',
  },
  ampmChipSelected: {
    backgroundColor: Colors.carbonBlack,
  },
  ampmChipText: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
  },
  ampmChipTextSelected: {
    color: '#ffffff',
  },

  // Modal styles
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
  modalRow: { flexDirection: 'row', gap: Spacing.sm },
  modalInput: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  emojiInput: { width: 56, textAlign: 'center', fontSize: 24 },
  modalActions: { flexDirection: 'row', gap: Spacing.sm },
  modalCancelBtn: {
    flex: 1,
    borderRadius: Radius.full,
    paddingVertical: 12,
    backgroundColor: Colors.ghostGray,
    alignItems: 'center',
  },
  modalCancelText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.mutedStone },
  modalAddBtn: {
    flex: 1,
    borderRadius: Radius.full,
    paddingVertical: 12,
    backgroundColor: Colors.carbonBlack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAddText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.polarWhite },
  deleteBtn: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    backgroundColor: 'transparent',
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.danger,
  },
  deleteBtnText: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.danger,
  },
});
