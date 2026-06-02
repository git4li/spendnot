import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Dimensions, Alert,
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
  CATEGORIES, getCategoryDef, CategoryKey,
} from '../../constants/theme';
import { exportToExcel } from '../../lib/export';
import Toast from 'react-native-toast-message';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - Spacing.lg * 2 - 32;
const CHART_H = 120;

type Period = 'week' | 'month' | 'custom';

// ── Category Donut Chart ──────────────────────
function CategoryDonutChart({ catRows }: { catRows: Array<{ key: string; label: string; emoji: string; spent: number }> }) {
  const total = useMemo(() => catRows.reduce((sum, c) => sum + c.spent, 0), [catRows]);
  
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
              />
              <Circle
                cx={bubblePos.x}
                cy={bubblePos.y}
                r={16}
                fill={Colors.polarWhite}
                stroke={Colors.carbonBlack}
                strokeWidth={1.5}
              />
              <SvgText
                x={bubblePos.x}
                y={bubblePos.y + 4.5}
                fontSize={13}
                textAnchor="middle"
              >
                {seg.emoji}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
      
      {topSpender && (
        <View style={styles.donutCenter}>
          <Text style={styles.centerEmoji}>{topSpender.emoji}</Text>
          <Text style={styles.centerLabel} numberOfLines={1}>{topSpender.label}</Text>
          <Text style={styles.centerAmount}>₹{topSpender.spent.toLocaleString('en-IN')}</Text>
          <Text style={styles.centerSub}>Top Spender</Text>
        </View>
      )}
    </View>
  );
}

export default function ReportsScreen() {
  const [period, setPeriod] = useState<Period>('month');
  const { expenses, loading } = useExpenses(500);
  const { wallets } = useWallets();

  const walletMap = useMemo(() => {
    const map: Record<string, string> = {};
    wallets.forEach((w) => {
      map[w.id] = w.name;
    });
    return map;
  }, [wallets]);

  const now = new Date();
  const filtered = useMemo(() => {
    if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 6);
      return expenses.filter((e) => e.date.toDate() >= start && e.type === 'expense');
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return expenses.filter((e) => e.date.toDate() >= start && e.type === 'expense');
  }, [expenses, period]);

  const income = useMemo(() => {
    if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 6);
      return expenses.filter((e) => e.date.toDate() >= start && e.type === 'income');
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return expenses.filter((e) => e.date.toDate() >= start && e.type === 'income');
  }, [expenses, period]);

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
    if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 6);
      return expenses.filter((e) => e.date.toDate() >= start);
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return expenses.filter((e) => e.date.toDate() >= start);
  }, [expenses, period]);

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
        {(['week', 'month'] as Period[]).map((p) => (
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

      {loading ? (
        <ActivityIndicator color={Colors.carbonBlack} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Summary card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Spent</Text>
            <Text style={styles.summaryAmount}>₹{totalSpent.toLocaleString('en-IN')}</Text>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryBadge, { color: Colors.income }]}>
                +₹{totalIncome.toLocaleString('en-IN')} Income
              </Text>
              <Text style={[styles.summaryBadge, { color: Colors.expense }]}>
                −₹{totalSpent.toLocaleString('en-IN')} Expenses
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
                  <Text style={styles.catBarAmount}>₹{(c.spent / 1000).toFixed(1)}k</Text>
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
                const walletName = walletMap[e.walletId] ?? 'Wallet';
                const dateStr = e.date.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
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
                      <Text style={styles.entryWallet}>{walletName}</Text>
                    </View>
                    <View style={styles.entryRight}>
                      <Text style={[styles.entryAmount, { color: e.type === 'income' ? Colors.incomeText : e.type === 'savings' ? Colors.savingsText : Colors.expenseText }]}>
                        {e.type === 'income' ? '+' : '−'}₹{e.amount.toLocaleString('en-IN')}
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
    width: 44,
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
});
