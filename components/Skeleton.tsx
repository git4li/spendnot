// ─────────────────────────────────────────────
//  SPENDNOT — Skeleton Loading Components
//  components/Skeleton.tsx
// ─────────────────────────────────────────────
import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius } from '../constants/theme';

// ── Base Shimmer ─────────────────────────────
export function SkeletonBox({
  width,
  height,
  borderRadius = Radius.md,
  style,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: Colors.ghostGray,
          opacity,
        },
        style,
      ]}
    />
  );
}

// ── Wallet Mini Card Skeleton ─────────────────
export function WalletCardSkeleton() {
  return (
    <View style={styles.walletCard}>
      <SkeletonBox width="60%" height={10} borderRadius={Radius.full} />
      <SkeletonBox width="80%" height={22} borderRadius={Radius.full} style={{ marginTop: 12 }} />
    </View>
  );
}

// ── Expense Row Skeleton ──────────────────────
export function ExpenseRowSkeleton() {
  return (
    <View style={styles.expenseRow}>
      <SkeletonBox width={38} height={38} borderRadius={Radius.full} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonBox width="55%" height={12} borderRadius={Radius.full} />
        <SkeletonBox width="35%" height={10} borderRadius={Radius.full} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <SkeletonBox width={60} height={12} borderRadius={Radius.full} />
        <SkeletonBox width={40} height={10} borderRadius={Radius.full} />
      </View>
    </View>
  );
}

// ── Budget Card Skeleton ──────────────────────
export function BudgetCardSkeleton() {
  return (
    <View style={styles.budgetCard}>
      <View style={styles.budgetCardTop}>
        <SkeletonBox width="45%" height={14} borderRadius={Radius.full} />
        <SkeletonBox width="30%" height={12} borderRadius={Radius.full} />
      </View>
      <SkeletonBox width="100%" height={8} borderRadius={Radius.full} />
    </View>
  );
}

// ── Summary Card Skeleton ─────────────────────
export function SummaryCardSkeleton() {
  return (
    <View style={styles.summaryCard}>
      <SkeletonBox width="30%" height={12} borderRadius={Radius.full} />
      <SkeletonBox width="60%" height={44} borderRadius={Radius.full} style={{ marginTop: 10 }} />
      <View style={{ flexDirection: 'row', gap: 24, marginTop: 16 }}>
        <View style={{ gap: 6 }}>
          <SkeletonBox width={50} height={10} borderRadius={Radius.full} />
          <SkeletonBox width={70} height={14} borderRadius={Radius.full} />
        </View>
        <View style={{ gap: 6 }}>
          <SkeletonBox width={60} height={10} borderRadius={Radius.full} />
          <SkeletonBox width={80} height={14} borderRadius={Radius.full} />
        </View>
        <View style={{ gap: 6 }}>
          <SkeletonBox width={50} height={10} borderRadius={Radius.full} />
          <SkeletonBox width={65} height={14} borderRadius={Radius.full} />
        </View>
      </View>
    </View>
  );
}

// ── Big Wallet Skeleton (Wallets tab) ─────────
export function BigWalletSkeleton() {
  return (
    <View style={styles.bigWalletCard}>
      <SkeletonBox width="40%" height={12} borderRadius={Radius.full} />
      <SkeletonBox width="65%" height={40} borderRadius={Radius.full} style={{ marginTop: 10 }} />
      <SkeletonBox width="25%" height={10} borderRadius={Radius.full} style={{ marginTop: 10 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  walletCard: {
    width: 160,
    height: 90,
    backgroundColor: Colors.ghostGray,
    borderRadius: 20,
    padding: 16,
    justifyContent: 'space-between',
    opacity: 0.6,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ghostGray,
    gap: 12,
  },
  budgetCard: {
    backgroundColor: Colors.polarWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.ghostGray,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  budgetCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryCard: {
    backgroundColor: Colors.ghostGray,
    borderRadius: 38,
    padding: 24,
    marginHorizontal: 20,
    marginTop: 16,
    opacity: 0.6,
  },
  bigWalletCard: {
    height: 130,
    backgroundColor: Colors.ghostGray,
    borderRadius: 46,
    paddingHorizontal: 24,
    paddingVertical: 20,
    justifyContent: 'center',
    opacity: 0.6,
  },
});
