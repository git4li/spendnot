// ─────────────────────────────────────────────
//  SPENDNOT — Onboarding (3 steps)
//  app/onboarding.tsx
// ─────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator,
  Alert, Dimensions, Animated,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  Colors, FontSize, Radius, Spacing, Typography,
  WalletType, getWalletColors,
} from '../constants/theme';
import { Wallet } from '../types/models';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_W } = Dimensions.get('window');
const TOTAL_STEPS = 3;

// ── Step 1: Welcome ──────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <View style={stepStyles.container}>
      <View style={stepStyles.heroBox}>
        <Text style={stepStyles.heroEmoji}>💸</Text>
        <View style={[stepStyles.heroBubble, { backgroundColor: Colors.pastelYellow }]}>
          <Text style={stepStyles.heroBubbleText}>₹2,450</Text>
          <Text style={stepStyles.heroBubbleSub}>spent today</Text>
        </View>
        <View style={[stepStyles.heroBubble2, { backgroundColor: Colors.softBlue }]}>
          <Text style={stepStyles.heroBubbleText}>₹18,000</Text>
          <Text style={stepStyles.heroBubbleSub}>left this month</Text>
        </View>
      </View>

      <Text style={stepStyles.heading}>Know exactly{'\n'}where it goes.</Text>
      <Text style={stepStyles.subheading}>
        Track every rupee across wallets, set budgets, and see your money habits clearly.
      </Text>

      <TouchableOpacity style={stepStyles.nextBtn} onPress={onNext} activeOpacity={0.85}>
        <Text style={stepStyles.nextBtnText}>Get Started →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Step 2: How it works ─────────────────────
function StepFeatures({ onNext }: { onNext: () => void }) {
  const features = [
    {
      emoji: '➕',
      color: Colors.lilacPink,
      title: 'Log expenses instantly',
      desc: 'Tap + to add any expense in under 3 seconds.',
    },
    {
      emoji: '📊',
      color: Colors.pastelYellow,
      title: 'Track budgets',
      desc: 'Set monthly limits per category and get warned before you overspend.',
    },
    {
      emoji: '📤',
      color: Colors.sageGreen,
      title: 'Export your data',
      desc: 'Download a full Excel report whenever you need it.',
    },
  ];

  return (
    <View style={stepStyles.container}>
      <Text style={stepStyles.heading}>Three things{'\n'}that matter.</Text>

      <View style={{ gap: Spacing.md, marginBottom: Spacing['2xl'] }}>
        {features.map((f) => (
          <View
            key={f.title}
            style={[stepStyles.featureCard, { backgroundColor: f.color + '33' }]}
          >
            <View style={[stepStyles.featureIcon, { backgroundColor: f.color }]}>
              <Text style={{ fontSize: 20 }}>{f.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={stepStyles.featureTitle}>{f.title}</Text>
              <Text style={stepStyles.featureDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={stepStyles.nextBtn} onPress={onNext} activeOpacity={0.85}>
        <Text style={stepStyles.nextBtnText}>Set Up Wallet →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Step 3: Add Wallet ───────────────────────
function StepWallet({ onDone }: { onDone: () => void }) {
  const { bottom } = useSafeAreaInsets();
  const [walletType, setWalletType] = useState<WalletType>('bank');
  const [bankName, setBankName] = useState('');
  const [walletName, setWalletName] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(false);

  const { user } = useAuth();

  const resolvedWalletName = (): string => {
    if (walletName.trim()) return walletName.trim();
    switch (walletType) {
      case 'cash': return 'Cash';
      case 'credit': return bankName.trim() ? `${bankName.trim()} Credit` : 'Credit Card';
      case 'bank': return bankName.trim() ? `${bankName.trim()}` : 'Bank Account';
    }
  };

  const handleStart = async () => {
    if (!user) {
      Alert.alert('Error', 'Not logged in. Please log in first.');
      return;
    }
    setLoading(true);
    try {
      const walletId = `${user.uid}_wallet_${Date.now()}`;
      const wallet: Omit<Wallet, 'id'> = {
        uid: user.uid,
        name: resolvedWalletName(),
        type: walletType,
        ...(bankName.trim() ? { bankName: bankName.trim() } : {}),
        balance: 0,
        isDefault,
        createdAt: Timestamp.now(),
      };
      await setDoc(doc(db, 'wallets', walletId), wallet);

      // Use setDoc+merge so user doc is created even if it doesn't exist yet
      await setDoc(doc(db, 'users', user.uid), {
        defaultWalletId: isDefault ? walletId : null,
        hasCompletedOnboarding: true,
      }, { merge: true });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save wallet. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const walletCards: { type: WalletType; icon: string; label: string; sub: string }[] = [
    { type: 'cash', icon: '💵', label: 'Cash', sub: 'Physical cash' },
    { type: 'bank', icon: '🏦', label: 'Bank Account', sub: 'HDFC, SBI, ICICI...' },
    { type: 'credit', icon: '💳', label: 'Credit Card', sub: 'Bank-issued card' },
  ];

  const POPULAR_BANKS = ['HDFC', 'SBI', 'ICICI', 'Axis', 'Kotak'];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[stepStyles.container, { paddingBottom: Math.max(bottom + 24, 60) }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={stepStyles.heading}>Add your first{'\n'}wallet.</Text>

      {/* Wallet type cards */}
      <View style={{ gap: Spacing.md, marginBottom: Spacing.lg }}>
        {walletCards.map(({ type, icon, label, sub }) => {
          const colors = getWalletColors(type, bankName);
          const selected = walletType === type;
          return (
            <TouchableOpacity
              key={type}
              style={[
                walletCardStyles.card,
                { backgroundColor: colors.bg },
                selected && walletCardStyles.selected,
              ]}
              onPress={() => {
                setWalletType(type);
                Haptics.selectionAsync();
              }}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 24 }}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[walletCardStyles.label, { color: colors.text }]}>{label}</Text>
                <Text style={[walletCardStyles.sub, { color: colors.text }]}>{sub}</Text>
              </View>
              {selected && (
                <View style={[walletCardStyles.check, { backgroundColor: colors.text }]}>
                  <Text style={{ color: colors.bg, fontSize: 12, fontWeight: '700' }}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bank name */}
      {walletType !== 'cash' && (
        <View style={{ marginBottom: Spacing.base }}>
          <Text style={stepStyles.fieldLabel}>BANK NAME</Text>
          <TextInput
            style={stepStyles.input}
            placeholder={walletType === 'credit' ? 'e.g. HDFC, SBI, ICICI' : 'e.g. State Bank of India'}
            placeholderTextColor={Colors.mutedStone}
            value={bankName}
            onChangeText={setBankName}
            autoCapitalize="words"
          />
          {/* Popular Banks */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={stepStyles.bankPillRow}>
            {POPULAR_BANKS.map((b) => {
              const isActive = bankName.toLowerCase().includes(b.toLowerCase());
              return (
                <TouchableOpacity
                  key={b}
                  style={[stepStyles.bankPill, isActive && stepStyles.bankPillActive]}
                  onPress={() => {
                    setBankName(b);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={[stepStyles.bankPillText, isActive && stepStyles.bankPillTextActive]}>
                    {b}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Nickname */}
      <View style={{ marginBottom: Spacing.base }}>
        <Text style={stepStyles.fieldLabel}>NICKNAME (OPTIONAL)</Text>
        <TextInput
          style={stepStyles.input}
          placeholder={resolvedWalletName()}
          placeholderTextColor={Colors.mutedStone}
          value={walletName}
          onChangeText={setWalletName}
        />
      </View>

      {/* Default toggle */}
      <View style={stepStyles.toggleRow}>
        <Text style={stepStyles.toggleLabel}>Set as default wallet</Text>
        <TouchableOpacity
          style={[stepStyles.toggle, !isDefault && stepStyles.toggleOff]}
          onPress={() => { setIsDefault(!isDefault); Haptics.selectionAsync(); }}
        >
          <View style={[stepStyles.toggleThumb, !isDefault && stepStyles.toggleThumbOff]} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[stepStyles.nextBtn, loading && { opacity: 0.6 }]}
        onPress={handleStart}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color={Colors.carbonBlack} />
          : <Text style={stepStyles.nextBtnText}>Start Tracking 🚀</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const walletCardStyles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: { borderColor: Colors.carbonBlack },
  label: { ...Typography.bodyBold, fontSize: FontSize.md },
  sub: { ...Typography.body, fontSize: FontSize.sm, opacity: 0.65, marginTop: 2 },
  check: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ── Main Onboarding ───────────────────────────
export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const { bottom } = useSafeAreaInsets();

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]}
          />
        ))}
      </View>

      {/* Step content */}
      <View style={{ flex: 1, paddingBottom: step < 2 ? Math.max(bottom, 24) : 0 }}>
        {step === 0 && <StepWelcome onNext={goNext} />}
        {step === 1 && <StepFeatures onNext={goNext} />}
        {step === 2 && <StepWallet onDone={() => {}} />}
      </View>

      {/* Skip on first 2 steps */}
      {step < 2 && (
        <TouchableOpacity style={styles.skipBtn} onPress={() => setStep(2)}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvasIce },
  dotsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  dot: {
    height: 4,
    flex: 1,
    borderRadius: Radius.full,
    backgroundColor: Colors.ghostGray,
  },
  dotActive: { backgroundColor: Colors.carbonBlack },
  dotDone: { backgroundColor: Colors.sageGreen },
  skipBtn: {
    position: 'absolute',
    top: 56,
    right: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  skipText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
  },
});

const stepStyles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    paddingTop: Spacing.xl,
  },
  heroBox: {
    height: 180,
    marginBottom: Spacing.xl,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: { fontSize: 72 },
  heroBubble: {
    position: 'absolute',
    top: 12,
    right: 16,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  heroBubble2: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  heroBubbleText: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.carbonBlack },
  heroBubbleSub: { ...Typography.body, fontSize: FontSize.xs, color: Colors.carbonBlack, opacity: 0.65 },
  heading: {
    ...Typography.heading,
    fontSize: FontSize['5xl'],
    color: Colors.carbonBlack,
    letterSpacing: -1.5,
    marginBottom: Spacing.md,
  },
  subheading: {
    ...Typography.body,
    fontSize: FontSize.lg,
    color: Colors.mutedStone,
    lineHeight: 26,
    marginBottom: Spacing['2xl'],
  },
  featureCard: {
    borderRadius: Radius.lg,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  featureIcon: {
    width: 48, height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { ...Typography.bodyBold, fontSize: FontSize.base, color: Colors.carbonBlack },
  featureDesc: { ...Typography.body, fontSize: FontSize.sm, color: Colors.mutedStone, marginTop: 2 },
  nextBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.base,
  },
  nextBtnText: { ...Typography.bodyBold, fontSize: FontSize.md, color: Colors.polarWhite },
  fieldLabel: {
    ...Typography.bodyBold,
    fontSize: FontSize.xs,
    color: Colors.mutedStone,
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.ghostGray,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.carbonBlack,
  },
  pill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.ghostGray,
  },
  pillActive: { backgroundColor: Colors.carbonBlack },
  pillText: { ...Typography.bodyMedium, fontSize: FontSize.sm, color: Colors.carbonBlack },
  pillTextActive: { color: Colors.polarWhite },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.ghostGray,
    marginBottom: Spacing.lg,
  },
  toggleLabel: { ...Typography.bodyMedium, fontSize: FontSize.base, color: Colors.carbonBlack },
  toggle: {
    width: 48, height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.carbonBlack,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOff: { backgroundColor: Colors.ghostGray },
  toggleThumb: {
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: Colors.polarWhite,
    alignSelf: 'flex-end',
  },
  toggleThumbOff: { alignSelf: 'flex-start' },
  bankPillRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  bankPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: Colors.ghostGray,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bankPillActive: {
    backgroundColor: Colors.carbonBlack,
  },
  bankPillText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.carbonBlack,
  },
  bankPillTextActive: {
    color: Colors.polarWhite,
  },
});
