import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Dimensions, Alert, Modal, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Polyline, Circle, Line, Polygon, Path, Text as SvgText } from 'react-native-svg';
import { doc, deleteDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useExpenses } from '../../hooks/useExpenses';
import { useWallets } from '../../hooks/useWallets';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  CATEGORIES, getCategoryDef, CategoryKey, getCurrencySymbol,
} from '../../constants/theme';
import { exportToExcel } from '../../lib/export';
import Toast from 'react-native-toast-message';
import { useAuth } from '../../context/AuthContext';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - Spacing.lg * 2 - 32;
const CHART_H = 120;

type Period = 'today' | 'week' | 'month' | 'custom';

// ── Category Donut Chart ──────────────────────
function CategoryDonutChart({ catRows }: { catRows: Array<{ key: string; label: string; emoji: string; spent: number }> }) {
  const { profile } = useAuth();
  const currencySymbol = getCurrencySymbol(profile?.currency);
  const total = useMemo(() => catRows.reduce((sum, c) => sum + c.spent, 0), [catRows]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  
  const segments = useMemo(() => {
    if (total === 0 || catRows.length === 0) return [];
    
    const CHART_COLORS = [Colors.lilacPink, Colors.softBlue, Colors.sageGreen, Colors.pastelYellow, Colors.periwinkle];
    
    const N = catRows.length;
    // If only 1 category, it occupies the whole circle (with a tiny gap of 10 degrees to allow rounded caps)
    const gapAngle = N === 1 ? 10 * Math.PI / 180 : 12 * Math.PI / 180;
    const totalGapAngle = N * gapAngle;
    const totalActiveAngle = 2 * Math.PI - totalGapAngle;
    
    let currentAngle = -Math.PI / 2; // start at top (12 o'clock)
    
    return catRows.map((c, index) => {
      const fraction = c.spent / total;
      const activeAngle = fraction * totalActiveAngle;
      
      const startAngle = currentAngle;
      const endAngle = currentAngle + activeAngle;
      const midAngle = startAngle + activeAngle / 2;
      
      // Update for the next segment
      currentAngle = endAngle + gapAngle;
      
      return {
        key: c.key,
        emoji: c.emoji,
        color: CHART_COLORS[index % CHART_COLORS.length],
        startAngle,
        endAngle,
        midAngle,
        spent: c.spent,
      };
    });
  }, [catRows, total]);

  const topSpender = catRows[0];
  const activeCategory = catRows.find(c => c.key === (selectedKey ?? topSpender?.key)) ?? topSpender;

  const cx = 120;
  const cy = 120;
  const radius = 80;
  const strokeWidth = 22;

  const polarToCartesian = (cx: number, cy: number, r: number, angleRad: number) => {
    return {
      x: cx + r * Math.cos(angleRad),
      y: cy + r * Math.sin(angleRad),
    };
  };

  const getArcPath = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const diff = endAngle - startAngle;
    const largeArcFlag = diff > Math.PI ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  };

  return (
    <View style={styles.donutContainer}>
      <Svg width={240} height={240}>
        {segments.map((seg) => {
          const pathD = getArcPath(cx, cy, radius, seg.startAngle, seg.endAngle);
          const bubblePos = polarToCartesian(cx, cy, radius, seg.midAngle);
          
          return (
            <React.Fragment key={seg.key}>
              <Path
                d={pathD}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                onPress={() => setSelectedKey(seg.key)}
              />
              <Circle
                cx={bubblePos.x}
                cy={bubblePos.y}
                r={16}
                fill={Colors.polarWhite}
                stroke={Colors.carbonBlack}
                strokeWidth={1.5}
                onPress={() => setSelectedKey(seg.key)}
              />
              <SvgText
                x={bubblePos.x}
                y={bubblePos.y + 4.5}
                fontSize={13}
                textAnchor="middle"
                onPress={() => setSelectedKey(seg.key)}
              >
                {seg.emoji}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
      
      {activeCategory && (
        <View style={styles.donutCenter}>
          <Text style={styles.centerEmoji}>{activeCategory.emoji}</Text>
          <Text style={styles.centerLabel} numberOfLines={1}>{activeCategory.label}</Text>
          <Text style={styles.centerAmount}>{currencySymbol}{activeCategory.spent.toLocaleString('en-IN')}</Text>
          <Text style={styles.centerSub}>
            {activeCategory.key === topSpender?.key ? 'Top Spender' : 'Selected'}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ReportsScreen() {
  const { user, profile } = useAuth();
  const currencySymbol = getCurrencySymbol(profile?.currency);
  const [period, setPeriod] = useState<Period>('month');
  const { expenses, loading } = useExpenses(500);
  const { wallets } = useWallets();

  // Custom date selection filter
  const [customFilterDate, setCustomFilterDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [pickerYear, setPickerYear] = useState(customFilterDate.getFullYear());
  const [pickerMonth, setPickerMonth] = useState(customFilterDate.getMonth());
  const [pickerDay, setPickerDay] = useState(customFilterDate.getDate());

  // Sync date picker states when opened
  useEffect(() => {
    if (showDatePicker) {
      setPickerYear(customFilterDate.getFullYear());
      setPickerMonth(customFilterDate.getMonth());
      setPickerDay(customFilterDate.getDate());
    }
  }, [showDatePicker, customFilterDate]);

  const walletMap = useMemo(() => {
    const map: Record<string, string> = {};
    wallets.forEach((w) => {
      map[w.id] = w.name;
    });
    return map;
  }, [wallets]);

  const now = new Date();
  
  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const filtered = useMemo(() => {
    if (period === 'today') {
      return expenses.filter((e) => isSameDay(e.date.toDate(), now) && e.type === 'expense');
    }
    if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return expenses.filter((e) => e.date.toDate() >= start && e.type === 'expense');
    }
    if (period === 'custom') {
      return expenses.filter((e) => isSameDay(e.date.toDate(), customFilterDate) && e.type === 'expense');
    }
    // Month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return expenses.filter((e) => e.date.toDate() >= start && e.type === 'expense');
  }, [expenses, period, customFilterDate]);

  const income = useMemo(() => {
    if (period === 'today') {
      return expenses.filter((e) => isSameDay(e.date.toDate(), now) && e.type === 'income');
    }
    if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return expenses.filter((e) => e.date.toDate() >= start && e.type === 'income');
    }
    if (period === 'custom') {
      return expenses.filter((e) => isSameDay(e.date.toDate(), customFilterDate) && e.type === 'income');
    }
    // Month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return expenses.filter((e) => e.date.toDate() >= start && e.type === 'income');
  }, [expenses, period, customFilterDate]);

  const totalSpent = filtered.reduce((s, e) => s + e.amount, 0);
  const totalIncome = income.reduce((s, e) => s + e.amount, 0);

  // Category breakdown
  const catSpend: Record<string, number> = {};
  filtered.forEach((e) => {
    catSpend[e.category] = (catSpend[e.category] ?? 0) + e.amount;
  });
  const catRows = useMemo(() => {
    return Object.keys(catSpend)
      .map((key) => {
        const def = getCategoryDef(key);
        return { ...def, spent: catSpend[key] };
      })
      .filter((c) => c.spent > 0)
      .sort((a, b) => b.spent - a.spent);
  }, [catSpend]);
  const maxCatSpend = Math.max(...catRows.map((c) => c.spent), 1);

  const handleExport = async () => {
    try {
      await exportToExcel(expenses, [], []);
      Toast.show({ type: 'success', text1: 'Export ready!', text2: 'Check your Files app.' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Export failed', text2: e.message });
    }
  };

  // All entries (not just expenses)
  const allFiltered = useMemo(() => {
    if (period === 'today') {
      return expenses.filter((e) => isSameDay(e.date.toDate(), now));
    }
    if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return expenses.filter((e) => e.date.toDate() >= start);
    }
    if (period === 'custom') {
      return expenses.filter((e) => isSameDay(e.date.toDate(), customFilterDate));
    }
    // Month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return expenses.filter((e) => e.date.toDate() >= start);
  }, [expenses, period, customFilterDate]);

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
    const newD = new Date(pickerYear, pickerMonth, pickerDay);
    setCustomFilterDate(newD);
    setShowDatePicker(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Reports</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
          <Text style={styles.exportBtnText}>Export ↓</Text>
        </TouchableOpacity>
      </View>

      {/* Period filter */}
      <View style={styles.periodRow}>
        {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
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

      {/* Custom Date Selection Row */}
      {period === 'custom' && (
        <TouchableOpacity 
          style={styles.customDateSelectRow} 
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.customDateSelectLabel}>Selected Date:</Text>
          <Text style={styles.customDateSelectValue}>
            {customFilterDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} 📅
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator color={Colors.carbonBlack} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Summary card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Spent</Text>
            <Text style={styles.summaryAmount}>{currencySymbol}{totalSpent.toLocaleString('en-IN')}</Text>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryBadge, { color: Colors.income }]}>
                +{currencySymbol}{totalIncome.toLocaleString('en-IN')} Income
              </Text>
              <Text style={[styles.summaryBadge, { color: Colors.expense }]}>
                −{currencySymbol}{totalSpent.toLocaleString('en-IN')} Expenses
              </Text>
            </View>
          </View>

          {/* Category breakdown */}
          {catRows.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>By Category</Text>
              
              {/* Circular Spender Donut Chart */}
              <CategoryDonutChart catRows={catRows} />

              {catRows.map((c) => (
                <View key={c.key} style={styles.catRow}>
                  <Text style={styles.catRowLabel}>{c.emoji} {c.label}</Text>
                  <View style={styles.catBarTrack}>
                    <View
                      style={[
                        styles.catBarFill,
                        {
                          width: `${(c.spent / maxCatSpend) * 100}%` as any,
                          backgroundColor: c.spent === Math.max(...catRows.map((r) => r.spent))
                            ? Colors.powerPink
                            : Colors.carbonBlack,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.catBarAmount}>{currencySymbol}{c.spent.toLocaleString('en-IN')}</Text>
                </View>
              ))}
            </View>
          )}

          {filtered.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>📊</Text>
              <Text style={styles.emptyTitle}>No data yet</Text>
              <Text style={styles.emptyText}>Log some expenses to see reports here.</Text>
            </View>
          )}

          {/* All Entries */}
          {allFiltered.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>All Entries</Text>
              {allFiltered.map((e) => {
                const cat = getCategoryDef(e.category);
                const sourceWalletName = walletMap[e.walletId] ?? 'Wallet';
                const displayWalletName = e.type === 'transfer'
                  ? `${sourceWalletName} ➔ ${walletMap[e.toWalletId ?? ''] ?? 'Wallet'}`
                  : sourceWalletName;
                
                const d = e.date.toDate();
                const now = new Date();
                const isToday = d.toDateString() === now.toDateString();
                const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
                const isYesterday = d.toDateString() === yesterday.toDateString();
                
                const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                const dateStr = isToday
                  ? `Today, ${timeStr}`
                  : isYesterday
                  ? `Yesterday, ${timeStr}`
                  : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${timeStr}`;

                const sign = e.type === 'income' ? '+' : e.type === 'transfer' ? '⇄ ' : '−';
                const amountColor = e.type === 'income'
                  ? Colors.incomeText
                  : e.type === 'savings'
                  ? Colors.savingsText
                  : e.type === 'transfer'
                  ? Colors.mutedStone
                  : Colors.expenseText;

                return (
                  <TouchableOpacity
                     key={e.id}
                     style={styles.entryRow}
                     onPress={() => router.push({ pathname: '/modals/edit-expense', params: { id: e.id } } as any)}
                     activeOpacity={0.65}
                  >
                    <View style={styles.entryIcon}>
                      <Text style={{ fontSize: 18 }}>{cat.emoji}</Text>
                    </View>
                    <View style={styles.entryInfo}>
                      <Text style={styles.entryCat}>{cat.label}</Text>
                      {e.note ? (
                        <Text style={styles.entryNote} numberOfLines={1}>{e.note}</Text>
                      ) : null}
                      {e.photoUri ? (
                        <Text style={{ fontSize: 12, color: Colors.mutedStone, marginTop: 2 }}>📎 Image attached</Text>
                      ) : null}
                      <Text style={styles.entryWallet}>{displayWalletName}</Text>
                    </View>
                    <View style={styles.entryRight}>
                      <Text style={[styles.entryAmount, { color: amountColor }]}>
                        {sign}{currencySymbol}{e.amount.toLocaleString('en-IN')}
                      </Text>
                      <Text style={styles.entryTime}>{dateStr}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* Reusable Date Picker Modal (No time select needed for reports filtering) */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Select Date</Text>

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
  exportBtn: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  exportBtnText: { ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.carbonBlack },
  periodRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.base,
  },
  periodPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.ghostGray,
  },
  periodPillActive: { backgroundColor: Colors.carbonBlack },
  periodPillText: { ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.mutedStone },
  periodPillTextActive: { color: Colors.polarWhite },
  
  customDateSelectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.polarWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ghostGray,
    marginBottom: Spacing.base,
  },
  customDateSelectLabel: {
    ...Typography.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
  },
  customDateSelectValue: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.carbonBlack,
  },

  content: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  summaryCard: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  summaryLabel: { ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.softStone },
  summaryAmount: {
    ...Typography.heading,
    fontSize: FontSize['7xl'],
    color: Colors.polarWhite,
    letterSpacing: -2,
  },
  summaryRow: { flexDirection: 'row', gap: Spacing.base, flexWrap: 'wrap' },
  summaryBadge: { ...Typography.bodyBold, fontSize: FontSize.base },
  chartCard: {
    backgroundColor: Colors.polarWhite,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  chartTitle: { ...Typography.bodyBold, fontSize: FontSize.lg, color: Colors.carbonBlack, marginBottom: Spacing.base },
  axisLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  axisLabel: { ...Typography.body, fontSize: FontSize.xs, color: Colors.mutedStone },
  noDataText: { ...Typography.body, fontSize: FontSize.base, color: Colors.mutedStone, textAlign: 'center', paddingVertical: Spacing.xl },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  catRowLabel: {
    ...Typography.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    width: 90,
  },
  catBarTrack: {
    flex: 1, height: 8,
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  catBarFill: { height: '100%', borderRadius: Radius.full },
  catBarAmount: {
    ...Typography.bodyBold,
    fontSize: FontSize.sm,
    color: Colors.carbonBlack,
    textAlign: 'right',
  },
  emptyBox: { alignItems: 'center', paddingVertical: Spacing['4xl'] },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { ...Typography.bodyBold, fontSize: FontSize.xl, color: Colors.carbonBlack, marginBottom: Spacing.sm },
  emptyText: { ...Typography.body, fontSize: FontSize.base, color: Colors.mutedStone, textAlign: 'center' },
  // Entry rows
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ghostGray,
    gap: Spacing.md,
  },
  entryIcon: {
    width: 38, height: 38,
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryInfo: { flex: 1 },
  entryCat: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  entryNote: {
    ...Typography.body,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    marginTop: 1,
  },
  entryWallet: {
    ...Typography.body,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
    marginTop: 2,
  },
  entryRight: { alignItems: 'flex-end' },
  entryAmount: {
    ...Typography.bodyBold,
    fontSize: FontSize.base,
  },
  entryTime: {
    ...Typography.body,
    fontSize: FontSize.xs,
    color: Colors.mutedStone,
    marginTop: 2,
  },
  donutContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.lg,
    position: 'relative',
    height: 240,
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
    height: 130,
  },
  centerEmoji: {
    fontSize: 24,
    marginBottom: 2,
  },
  centerLabel: {
    ...Typography.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.mutedStone,
    textAlign: 'center',
  },
  centerAmount: {
    ...Typography.heading,
    fontSize: FontSize.xl,
    color: Colors.carbonBlack,
    marginVertical: 2,
  },
  centerSub: {
    ...Typography.bodyBold,
    fontSize: 8,
    color: Colors.mutedStone,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Picker modal styles
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
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
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
