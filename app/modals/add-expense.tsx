// ─────────────────────────────────────────────
//  SPENDNOT — Add Expense / Income Modal
//  app/modals/add-expense.tsx
// ─────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
  Keyboard, TouchableWithoutFeedback, Modal, Platform, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  collection, addDoc, doc, updateDoc, increment, Timestamp, getDoc, arrayUnion,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useWallets } from '../../hooks/useWallets';
import { useExpenses } from '../../hooks/useExpenses';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  CATEGORIES, CategoryDef, WalletColors, getWalletColors,
} from '../../constants/theme';
import { TransactionType } from '../../types/models';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
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

export default function AddExpenseModal() {
  const { wallets } = useWallets();
  const { bottom } = useSafeAreaInsets();
  const { expenses } = useExpenses(100); // Load last 100 transactions for frequency sorting
  const { user } = useAuth();

  const KeyboardDismissWrapper = Platform.OS === 'web' ? React.Fragment : TouchableWithoutFeedback;
  const dismissProps = Platform.OS === 'web' ? {} : { onPress: Keyboard.dismiss };

  const [type, setType] = useState<TransactionType>('expense');
  const [walletId, setWalletId] = useState<string>('');
  const [toWalletId, setToWalletId] = useState<string>('');
  const [category, setCategory] = useState<string>('food');
  const [note, setNote] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  // Note and Image states
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Calculator expression state
  const [expr, setExpr] = useState('0');

  // Custom Category states
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

  // Set default wallet when loaded
  useEffect(() => {
    if (wallets.length > 0 && !walletId) {
      const def = wallets.find((w) => w.isDefault)?.id ?? wallets[0]?.id;
      if (def) setWalletId(def);
    }
  }, [wallets, walletId]);

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

  // Load custom categories from Firestore
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists() && snap.data()?.customCategories) {
        setDbCustomCats(snap.data().customCategories);
      }
    });
  }, [user]);

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
      Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Could not save category.' });
    }
  };

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
    if (!user) return;
    const finalAmount = evaluateExpr(expr);
    if (isNaN(finalAmount) || finalAmount <= 0) {
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
      let savedPhotoUri = null;
      if (photoUri) {
        savedPhotoUri = await saveImageLocally(photoUri);
      }

      await addDoc(collection(db, 'expenses'), {
        uid: user.uid,
        walletId,
        ...(type === 'transfer' ? { toWalletId } : {}),
        type,
        category: type === 'transfer' ? 'transfer' : category,
        amount: finalAmount,
        note: note.trim() || null,
        photoUri: savedPhotoUri,
        date: Timestamp.fromDate(selectedDate),
        isRecurring,
        createdAt: Timestamp.now(),
      });

      if (type === 'transfer') {
        await updateDoc(doc(db, 'wallets', walletId), {
          balance: increment(-finalAmount),
        });
        await updateDoc(doc(db, 'wallets', toWalletId), {
          balance: increment(finalAmount),
        });
      } else {
        const delta = type === 'income' ? finalAmount : -finalAmount;
        await updateDoc(doc(db, 'wallets', walletId), {
          balance: increment(delta),
        });
      }

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
      
      const label = type === 'transfer' ? 'Transfer' : type.charAt(0).toUpperCase() + type.slice(1);
      Toast.show({
        type: 'success',
        text1: `${label} saved ✓`,
        text2: `₹${finalAmount.toLocaleString('en-IN')}`,
      });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
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

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* @ts-ignore */}
      <KeyboardDismissWrapper {...dismissProps}>
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Track Expense</Text>
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
            contentContainerStyle={styles.segmentedControlRow}
            style={{ marginBottom: Spacing.base, maxHeight: 50, flexGrow: 0 }}
          >
            {(['expense', 'income', 'savings', 'transfer'] as TransactionType[]).map((t) => {
              const isActive = type === t;
              let activeBg: string = Colors.ghostGray;
              let activeText: string = Colors.mutedStone;
              
              if (isActive) {
                if (t === 'expense') {
                  activeBg = Colors.expense;
                  activeText = Colors.expenseText;
                } else if (t === 'income') {
                  activeBg = Colors.income;
                  activeText = Colors.incomeText;
                } else if (t === 'savings') {
                  activeBg = Colors.savings;
                  activeText = Colors.savingsText;
                } else {
                  activeBg = Colors.periwinkle;
                  activeText = Colors.mutedStone;
                }
              }

              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.segmentedTab,
                    isActive ? { backgroundColor: activeBg } : { backgroundColor: '#F0F0F2' }
                  ]}
                  onPress={() => { setType(t); Haptics.selectionAsync(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.segmentedTabText,
                    { color: isActive ? activeText : Colors.mutedStone }
                  ]}>
                    {isActive ? '✓ ' : ''}{t === 'transfer' ? 'Transfer' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            
            {/* Circular Category Row Scroll */}
            {type !== 'transfer' && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catHorizontalScrollContent}
                style={styles.catHorizontalScroll}
              >
                {filteredCategories.map((c) => {
                  const selected = category === c.key;
                  let activeThemeColor: string = Colors.expense;
                  if (type === 'income') activeThemeColor = Colors.income;
                  else if (type === 'savings') activeThemeColor = Colors.savings;
                  
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={styles.catItem}
                      onPress={() => { setCategory(c.key); Haptics.selectionAsync(); }}
                      activeOpacity={0.8}
                    >
                      <View style={[
                        styles.catCircle,
                        selected ? {
                          backgroundColor: '#ffffff',
                          borderColor: activeThemeColor,
                          borderWidth: 2.5,
                          shadowColor: activeThemeColor,
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.15,
                          shadowRadius: 4,
                          elevation: 2,
                        } : {
                          backgroundColor: '#F5F5F7',
                          borderColor: 'transparent',
                          borderWidth: 2.5,
                        }
                      ]}>
                        <Text style={styles.catEmoji}>{c.emoji}</Text>
                      </View>
                      <Text style={[
                        styles.catLabel,
                        selected && { color: Colors.carbonBlack, fontFamily: 'Inter_700Bold' }
                      ]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={styles.catItem}
                  onPress={() => setShowAddCat(true)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.catCircle, styles.catCircleAdd]}>
                    <Text style={styles.catAddPlus}>+</Text>
                  </View>
                  <Text style={styles.catLabel}>New</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* Wallet selector scroll row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.walletScrollContent}
              style={styles.walletScroll}
            >
              {wallets.map((w) => {
                const wColors = getWalletColors(w.type, w.bankName);
                const selected = walletId === w.id;
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={[
                      styles.walletPill,
                      selected ? {
                        backgroundColor: Colors.carbonBlack,
                      } : {
                        backgroundColor: wColors.bg,
                      }
                    ]}
                    onPress={() => { setWalletId(w.id); Haptics.selectionAsync(); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.walletText,
                      selected ? { color: '#ffffff' } : { color: wColors.text }
                    ]}>
                      {w.name.toUpperCase()}{selected ? '  ✓' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {type === 'transfer' && (
              <>
                <Text style={styles.fieldLabel}>To wallet</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.walletScrollContent}
                  style={styles.walletScroll}
                >
                  {wallets.map((w) => {
                    const wColors = getWalletColors(w.type, w.bankName);
                    const selected = toWalletId === w.id;
                    const isSource = walletId === w.id;
                    if (isSource) return null;
                    return (
                      <TouchableOpacity
                        key={w.id}
                        style={[
                          styles.walletPill,
                          selected ? {
                            backgroundColor: Colors.carbonBlack,
                          } : {
                            backgroundColor: wColors.bg,
                          }
                        ]}
                        onPress={() => { setToWalletId(w.id); Haptics.selectionAsync(); }}
                        activeOpacity={0.8}
                      >
                        <Text style={[
                          styles.walletText,
                          selected ? { color: '#ffffff' } : { color: wColors.text }
                        ]}>
                          {w.name.toUpperCase()}{selected ? '  ✓' : ''}
                        </Text>
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
                  activeOpacity={0.8}
                >
                  <Text style={[styles.mediaBtnText, note.trim().length > 0 && { color: '#ffffff' }]}>💬</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.mediaBtn, isRecurring && styles.mediaBtnActive]} 
                  onPress={() => { setIsRecurring(!isRecurring); Haptics.selectionAsync(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.mediaBtnText, isRecurring && { color: '#ffffff' }]}>🔁</Text>
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



            {note.trim().length > 0 && (
              <View style={styles.noteBubble}>
                <Text style={styles.noteBubbleEmoji}>💬</Text>
                <Text style={styles.noteBubbleText} numberOfLines={2}>
                  {note}
                </Text>
                <TouchableOpacity onPress={() => setNote('')} style={styles.noteBubbleClose}>
                  <Text style={styles.noteBubbleCloseText}>×</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Custom Keyboard grid */}
            <View style={styles.keyboardContainer}>
              <View style={styles.keyboardRow}>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('1')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>1</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('2')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>2</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('3')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>3</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.keyBtn, styles.dateKeyBtn]} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                  <Text style={styles.dateKeyText}>{formatKeyboardDateTime(selectedDate)}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.keyboardRow}>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('4')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>4</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('5')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>5</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('6')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>6</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.keyBtn, styles.opKeyBtn]} onPress={() => handleKeyInput('+')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.keyboardRow}>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('7')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>7</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('8')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>8</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('9')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>9</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.keyBtn, styles.opKeyBtn]} onPress={() => handleKeyInput('-')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>−</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.keyboardRow}>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('.')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyInput('0')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.keyBtn, styles.opKeyBtn]} onPress={() => handleKeyInput('backspace')} activeOpacity={0.7}>
                  <Text style={styles.keyText}>⌫</Text>
                </TouchableOpacity>
                {(() => {
                  let submitBg: string = Colors.expense;
                  let submitTextCol: string = Colors.expenseText;
                  if (type === 'income') {
                    submitBg = Colors.income;
                    submitTextCol = Colors.incomeText;
                  } else if (type === 'savings') {
                    submitBg = Colors.savings;
                    submitTextCol = Colors.savingsText;
                  } else if (type === 'transfer') {
                    submitBg = Colors.periwinkle;
                    submitTextCol = Colors.mutedStone;
                  }
                  return (
                    <TouchableOpacity 
                      style={[styles.keyBtn, { backgroundColor: submitBg }]} 
                      onPress={() => handleKeyInput('submit')}
                      activeOpacity={0.7}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color={submitTextCol} />
                      ) : (
                        <Text style={[styles.submitKeyText, { color: submitTextCol }]}>✓</Text>
                      )}
                    </TouchableOpacity>
                  );
                })()}
              </View>
            </View>


          </ScrollView>
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

  // Segmented Control
  segmentedControlRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  segmentedTab: {
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedTabText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },

  // Wallet Selector Row
  walletScroll: {
    marginBottom: Spacing.base,
    maxHeight: 46,
    flexGrow: 0,
  },
  walletScrollContent: {
    paddingHorizontal: 4,
    gap: 8,
    alignItems: 'center',
  },
  walletPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 0.5,
  },

  // Circular Category Row Scroll
  catHorizontalScroll: {
    marginBottom: Spacing.base,
    maxHeight: 92,
    flexGrow: 0,
  },
  catHorizontalScrollContent: {
    paddingHorizontal: 4,
    gap: 12,
    alignItems: 'center',
  },
  catItem: {
    alignItems: 'center',
    gap: 6,
    width: 68,
  },
  catCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  catCircleAdd: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.mutedStone,
    borderStyle: 'dashed',
  },
  catEmoji: {
    fontSize: 24,
  },
  catAddPlus: {
    fontSize: 24,
    color: Colors.mutedStone,
  },
  catLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.mutedStone,
    textAlign: 'center',
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
    backgroundColor: '#000000', // Pure black card as requested
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },
  amountCurrencySymbol: {
    fontFamily: 'Montserrat_900Black',
    fontSize: FontSize['4xl'],
    color: '#ffffff',
    marginRight: Spacing.xs,
  },
  amountExprScroll: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexGrow: 1,
  },
  amountExprText: {
    fontFamily: 'Montserrat_900Black',
    fontSize: FontSize['6xl'],
    color: '#ffffff',
    textAlign: 'right',
  },
  // Wallet mini cards
  walletCard: {
    width: 130,
    height: 68,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginRight: Spacing.sm,
  },
  walletCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletCardName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  walletCardBalance: {
    fontFamily: 'Montserrat_900Black',
    fontSize: FontSize.base,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  // Attached media/notes previews
  thumbnailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#F5F5F7',
    borderRadius: Radius.md,
    padding: Spacing.xs,
    marginBottom: Spacing.base,
    borderWidth: 1.5,
    borderColor: Colors.ghostGray,
  },
  thumbnailWrapper: {
    position: 'relative',
    width: 48,
    height: 48,
  },
  thumbnailImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
  },
  thumbnailDeleteBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.danger,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailDeleteText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  thumbnailLabel: {
    ...Typography.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
  },
  noteBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.base,
    borderWidth: 1.5,
    borderColor: Colors.ghostGray,
    gap: Spacing.xs,
  },
  noteBubbleEmoji: {
    fontSize: 14,
  },
  noteBubbleText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.carbonBlack,
    flex: 1,
  },
  noteBubbleClose: {
    paddingHorizontal: Spacing.xs,
  },
  noteBubbleCloseText: {
    fontSize: 18,
    color: Colors.mutedStone,
    fontWeight: 'bold',
  },
  // Custom keyboard
  keyboardContainer: {
    gap: Spacing.sm,
    marginBottom: Spacing.base,
    backgroundColor: '#F2F2F7', // Modern light iOS system gray area
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
    borderRadius: Radius.md,
    backgroundColor: '#FFFFFF', // Solid light key background for high contrast
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 2.5,
    elevation: 1.5,
  },
  keyText: {
    fontFamily: 'Montserrat_900Black',
    fontSize: FontSize.xl,
    color: Colors.carbonBlack,
  },
  opKeyBtn: {
    backgroundColor: '#E5E5EA',
  },
  dateKeyBtn: {
    backgroundColor: '#E5E5EA',
    paddingVertical: 2,
  },
  dateKeyText: {
    ...Typography.bodyBold,
    fontSize: 10,
    color: Colors.carbonBlack,
    textAlign: 'center',
    lineHeight: 12,
  },
  submitKeyBtn: {
    backgroundColor: '#1A1A1A',
  },
  submitKeyText: {
    fontFamily: 'Montserrat_900Black',
    fontSize: FontSize.xl,
    color: Colors.carbonBlack,
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
});
