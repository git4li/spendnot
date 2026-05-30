// ─────────────────────────────────────────────
//  SPENDNOT — Reports Screen (Screen 7)
//  app/(tabs)/reports.tsx
// ─────────────────────────────────────────────
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline, Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { useExpenses } from '../../hooks/useExpenses';
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

function getWeekDays(): { label: string; date: Date }[] {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      date: d,
    });
  }
  return days;
}

// ── Simple Line Chart ────────────────────────
function SpendingLineChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const padH = 20;
  const step = (CHART_W - padH * 2) / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = padH + i * step;
      const y = CHART_H - padH - ((v / max) * (CHART_H - padH * 2));
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `${padH},${CHART_H - padH} ${points} ${padH + (data.length - 1) * step},${CHART_H - padH}`;

  return (
    <Svg width={CHART_W} height={CHART_H}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((f, i) => {
        const y = CHART_H - padH - f * (CHART_H - padH * 2);
        return <Line key={i} x1={padH} y1={y} x2={CHART_W - padH} y2={y} stroke={Colors.ghostGray} strokeWidth={1} />;
      })}
      {/* Area */}
      <Polygon points={areaPoints} fill="rgba(2,187,255,0.08)" />
      {/* Line */}
      <Polyline points={points} fill="none" stroke={Colors.skyBlue} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {data.map((v, i) => {
        const x = padH + i * step;
        const y = CHART_H - padH - ((v / max) * (CHART_H - padH * 2));
        return <Circle key={i} cx={x} cy={y} r={4} fill={Colors.skyBlue} />;
      })}
    </Svg>
  );
}

export default function ReportsScreen() {
  const [period, setPeriod] = useState<Period>('month');
  const { expenses, loading } = useExpenses(500);

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

  // Week chart data
  const weekDays = getWeekDays();
  const chartData = weekDays.map(({ date }) => {
    const d = date.toDateString();
    return filtered
      .filter((e) => e.date.toDate().toDateString() === d)
      .reduce((s, e) => s + e.amount, 0);
  });

  // Category breakdown
  const catSpend: Record<string, number> = {};
  filtered.forEach((e) => {
    catSpend[e.category] = (catSpend[e.category] ?? 0) + e.amount;
  });
  const catRows = CATEGORIES
    .map((c) => ({ ...c, spent: catSpend[c.key] ?? 0 }))
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const maxCatSpend = Math.max(...catRows.map((c) => c.spent), 1);

  const handleExport = async () => {
    try {
      await exportToExcel(expenses, [], []);
      Toast.show({ type: 'success', text1: 'Export ready!', text2: 'Check your Files app.' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Export failed', text2: e.message });
    }
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

          {/* Trend chart */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Spending Trend</Text>
            {chartData.every((v) => v === 0) ? (
              <Text style={styles.noDataText}>No data for this period.</Text>
            ) : (
              <>
                <SpendingLineChart data={chartData} />
                <View style={styles.axisLabels}>
                  {weekDays.map(({ label }, i) => (
                    <Text key={i} style={styles.axisLabel}>{label}</Text>
                  ))}
                </View>
              </>
            )}
          </View>

          {/* Category breakdown */}
          {catRows.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>By Category</Text>
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
  emptyTitle: {
    ...Typography.bodyBold, fontSize: FontSize.xl,
    color: Colors.carbonBlack, marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.body, fontSize: FontSize.base,
    color: Colors.mutedStone, textAlign: 'center',
  },
});
