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
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  collection, addDoc, doc, updateDoc, increment, Timestamp, getDoc, arrayUnion, getDocs, query, where,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useWallets } from '../../hooks/useWallets';
import { useExpenses } from '../../hooks/useExpenses';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  CATEGORIES, CategoryDef, WalletColors, getWalletColors, getCurrencySymbol, getCategoryDef,
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
  const { user, profile } = useAuth();
  const currencySymbol = getCurrencySymbol(profile?.currency);

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
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');

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
    let cleaned = s.replace(/×/g, '*').replace(/÷/g, '/');
    cleaned = cleaned.replace(/[+\-*/]+$/, ''); // Strip trailing operators
    if (!cleaned) return 0;

    try {
      // Split by '+' or '-' but keep the operators
      // e.g., "10*5-20/4" -> ["10*5", "-", "20/4"]
      const tokens = cleaned.split(/([+-])/);
      
      // Evaluate multiplication and division for each term first
      const evaluatedTerms = tokens.map(token => {
        if (token === '+' || token === '-') return token;
        
        const subTokens = token.split(/([\*/])/);
        let val = parseFloat(subTokens[0]);
        for (let i = 1; i < subTokens.length; i += 2) {
          const op = subTokens[i];
          const nextVal = parseFloat(subTokens[i + 1]);
          if (isNaN(nextVal)) continue;
          if (op === '*') {
            val *= nextVal;
          } else if (op === '/') {
            val = nextVal !== 0 ? val / nextVal : 0;
          }
        }
        return val;
      });

      // Now evaluate addition and subtraction left-to-right
      let result = typeof evaluatedTerms[0] === 'number' ? evaluatedTerms[0] : 0;
      for (let i = 1; i < evaluatedTerms.length; i += 2) {
        const op = evaluatedTerms[i];
        const nextVal = evaluatedTerms[i + 1];
        if (typeof nextVal !== 'number') continue;
        if (op === '+') {
          result += nextVal;
        } else if (op === '-') {
          result -= nextVal;
        }
      }
      return result;
    } catch (e) {
      console.error(e);
      return 0;
    }
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
    } else if (key === '+' || key === '-' || key === '×' || key === '÷') {
      setExpr(prev => {
        const lastChar = prev.slice(-1);
        if (['+', '-', '×', '÷'].includes(lastChar)) {
          return prev.slice(0, -1) + key;
        }
        return prev + key;
      });
    } else if (key === '.') {
      setExpr(prev => {
        const parts = prev.split(/[+\-×÷]/);
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

      const expRef = await addDoc(collection(db, 'expenses'), {
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

      // If the expense is recurring, automatically add it to checklist templates (default monthly to-do)
      if (type === 'expense' && isRecurring) {
        const noteName = note.trim() || `${getCategoryDef(category).label} Bill`;
        
        // 1. Create/update checklist template
        await addDoc(collection(db, 'checklist_templates'), {
          uid: user.uid,
          name: noteName,
          amount: finalAmount,
          category,
          walletId,
          createdAt: Timestamp.now(),
        });

        // 2. Sync to current month's checklist item (mark as paid immediately since logged)
        const currentMonthStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
        
        // Check if there is an existing checklist item for this month with the same name
        const clSnap = await getDocs(
          query(
            collection(db, 'checklist_items'),
            where('uid', '==', user.uid),
            where('month', '==', currentMonthStr),
            where('name', '==', noteName)
          )
        );

        if (!clSnap.empty) {
          // Update the first matching item to paid
          const existingDoc = clSnap.docs[0];
          await updateDoc(doc(db, 'checklist_items', existingDoc.id), {
            isPaid: true,
            expenseId: expRef.id,
            amount: finalAmount,
            paidAt: Timestamp.fromDate(selectedDate),
          });
        } else {
          // Create a new paid checklist item
          await addDoc(collection(db, 'checklist_items'), {
            uid: user.uid,
            month: currentMonthStr,
            name: noteName,
            amount: finalAmount,
            category,
            walletId,
            isPaid: true,
            expenseId: expRef.id,
            paidAt: Timestamp.fromDate(selectedDate),
            createdAt: Timestamp.now(),
          });
        }
      }

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
        text2: `${currencySymbol}${finalAmount.toLocaleString('en-IN')}`,
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

  const handleNativeDateChange = (_event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      // Android: close picker after each step
      if (!date) { setShowDatePicker(false); return; }
      if (pickerMode === 'date') {
        // Merge selected date with existing time
        const merged = new Date(selectedDate);
        merged.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        setSelectedDate(merged);
        // Now open time picker
        setPickerMode('time');
      } else {
        const merged = new Date(selectedDate);
        merged.setHours(date.getHours(), date.getMinutes());
        setSelectedDate(merged);
        setShowDatePicker(false);
        setPickerMode('date');
      }
    } else {
      // iOS: picker stays open, just update value
      if (date) setSelectedDate(date);
    }
  };

  const handleIOSPickerDone = () => {
    if (pickerMode === 'date') {
      setPickerMode('time');
    } else {
      setShowDatePicker(false);
      setPickerMode('date');
    }
  };

  const handleWebDateChange = (e: any) => {
    const val = e.target.value;
    if (val) setSelectedDate(new Date(val));
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

          <ScrollView 
            showsVerticalScrollIndicator={false} 
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 450 }}
          >
            
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

            {/* Additional Details Card */}
            <View style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>Additional Details</Text>
              
              <View style={styles.detailsRow}>
                {/* Note Button */}
                <TouchableOpacity 
                  style={[styles.detailPill, note.trim().length > 0 && styles.detailPillActive]} 
                  onPress={() => setShowNoteModal(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.detailPillEmoji}>💬</Text>
                  <Text style={[styles.detailPillText, note.trim().length > 0 && styles.detailPillTextActive]}>
                    {note.trim().length > 0 ? 'Edit Note' : 'Add Note'}
                  </Text>
                </TouchableOpacity>

                {/* Photo Button */}
                <TouchableOpacity 
                  style={[styles.detailPill, photoUri && styles.detailPillActive]} 
                  onPress={handleSelectPhoto}
                  activeOpacity={0.8}
                >
                  <Text style={styles.detailPillEmoji}>📎</Text>
                  <Text style={[styles.detailPillText, photoUri && styles.detailPillTextActive]}>
                    {photoUri ? 'Change Photo' : 'Add Photo'}
                  </Text>
                </TouchableOpacity>

                {/* Recurring Toggle Button */}
                <TouchableOpacity 
                  style={[styles.detailPill, isRecurring && styles.detailPillActive]} 
                  onPress={() => { setIsRecurring(!isRecurring); Haptics.selectionAsync(); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.detailPillEmoji}>🔁</Text>
                  <Text style={[styles.detailPillText, isRecurring && styles.detailPillTextActive]}>
                    Recurring
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Previews inside the card */}
              {(note.trim().length > 0 || photoUri) && (
                <View style={styles.attachmentsRow}>
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

                  {photoUri && (
                    <View style={styles.thumbnailWrapper}>
                      <Image source={{ uri: photoUri }} style={styles.thumbnailImage} />
                      <TouchableOpacity onPress={() => setPhotoUri(null)} style={styles.thumbnailDeleteBadge}>
                        <Text style={styles.thumbnailDeleteText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>

          </ScrollView>

          {/* Sticky Calculator & Keypad at the bottom */}
          <View style={styles.keyboardContainer}>
            {/* Amount display box */}
            <View style={styles.amountBox}>
              <Text style={styles.amountCurrencySymbol}>{currencySymbol}</Text>
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

            {/* Keypad Row 1 */}
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
              <TouchableOpacity style={[styles.keyBtn, styles.opKeyBtn]} onPress={() => handleKeyInput('÷')} activeOpacity={0.7}>
                <Text style={styles.keyText}>÷</Text>
              </TouchableOpacity>
            </View>

            {/* Keypad Row 2 */}
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
              <TouchableOpacity style={[styles.keyBtn, styles.opKeyBtn]} onPress={() => handleKeyInput('×')} activeOpacity={0.7}>
                <Text style={styles.keyText}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Keypad Row 3 */}
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

            {/* Keypad Row 4 */}
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
              <TouchableOpacity style={[styles.keyBtn, styles.opKeyBtn]} onPress={() => handleKeyInput('+')} activeOpacity={0.7}>
                <Text style={styles.keyText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Keypad Row 5 (Date and Submit) */}
            <View style={styles.keyboardRow}>
              {Platform.OS === 'web' ? (
                <View style={{ flex: 1.5, position: 'relative' }}>
                  <TouchableOpacity style={[styles.keyBtn, styles.dateKeyBtn, { width: '100%' }]} activeOpacity={0.7}>
                    <Text style={styles.dateKeyText}>{formatKeyboardDateTime(selectedDate)}</Text>
                    {/* @ts-ignore */}
                    <input
                      type="datetime-local"
                      value={(() => {
                        const d = selectedDate;
                        const pad = (n: number) => String(n).padStart(2, '0');
                        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                      })()}
                      onChange={handleWebDateChange}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        opacity: 0,
                        cursor: 'pointer',
                      }}
                    />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.keyBtn, styles.dateKeyBtn, { flex: 1.5 }]} onPress={() => { setShowDatePicker(true); setPickerMode('date'); }} activeOpacity={0.7}>
                  <Text style={styles.dateKeyText}>{formatKeyboardDateTime(selectedDate)}</Text>
                </TouchableOpacity>
              )}
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
                  submitBg = Colors.mutedStone;
                  submitTextCol = Colors.polarWhite;
                }
                return (
                  <TouchableOpacity 
                    style={[styles.keyBtn, { backgroundColor: submitBg, flex: 2.5 }]} 
                    onPress={() => handleKeyInput('submit')}
                    activeOpacity={0.7}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={submitTextCol} />
                    ) : (
                      <Text style={[styles.submitKeyText, { color: submitTextCol, fontSize: 16, fontFamily: 'Inter_700Bold' }]}>✓ Done</Text>
                    )}
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>
        </View>
      </KeyboardDismissWrapper>

      {/* Native Date & Time Picker */}
      {Platform.OS === 'ios' ? (
        <Modal visible={showDatePicker} transparent animationType="slide">
          <View style={styles.iosPickerOverlay}>
            <View style={styles.iosPickerCard}>
              <View style={styles.iosPickerHeader}>
                <TouchableOpacity onPress={() => { setShowDatePicker(false); setPickerMode('date'); }}>
                  <Text style={styles.iosPickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.iosPickerTitle}>
                  {pickerMode === 'date' ? 'Select Date' : 'Select Time'}
                </Text>
                <TouchableOpacity onPress={handleIOSPickerDone}>
                  <Text style={styles.iosPickerDone}>
                    {pickerMode === 'date' ? 'Next' : 'Done'}
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={selectedDate}
                mode={pickerMode}
                display="spinner"
                onChange={handleNativeDateChange}
                style={{ width: '100%' }}
                themeVariant="light"
              />
            </View>
          </View>
        </Modal>
      ) : (
        // Android: renders as system dialog, no wrapper needed
        showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode={pickerMode}
            display="default"
            onChange={handleNativeDateChange}
          />
        )
      )}

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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    gap: Spacing.xs,
    backgroundColor: '#F2F2F7', // Modern light iOS system gray area
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    padding: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 24 : Spacing.sm,
  },
  keyboardRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  keyBtn: {
    flex: 1,
    height: 58, // Taller buttons for premium spacing
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
    fontSize: 22, // Bigger text as requested
    color: Colors.carbonBlack,
  },
  opKeyBtn: {
    backgroundColor: '#E5E5EA',
  },
  dateKeyBtn: {
    backgroundColor: '#E5E5EA',
    paddingVertical: 2,
  },
  
  // Additional Details card and chips styling
  detailsCard: {
    backgroundColor: '#F9F9FB',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  detailsTitle: {
    ...Typography.bodyBold,
    fontSize: 10,
    color: Colors.mutedStone,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  detailPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFEFEF',
    borderRadius: Radius.full,
    paddingVertical: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  detailPillActive: {
    backgroundColor: Colors.carbonBlack,
    borderColor: Colors.carbonBlack,
  },
  detailPillEmoji: {
    fontSize: 14,
  },
  detailPillText: {
    ...Typography.bodyMedium,
    fontSize: 11,
    color: Colors.mutedStone,
  },
  detailPillTextActive: {
    color: '#ffffff',
    fontFamily: 'Inter_700Bold',
  },
  attachmentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    flexWrap: 'wrap',
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

  // iOS native picker bottom sheet styles
  iosPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  iosPickerCard: {
    backgroundColor: Colors.polarWhite,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    paddingBottom: Spacing.xl,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.ghostGray,
  },
  iosPickerTitle: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  iosPickerCancel: {
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
  },
  iosPickerDone: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: '#007AFF',
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
