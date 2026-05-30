// ─────────────────────────────────────────────
//  SPENDNOT — Register Screen
//  app/(auth)/register.tsx
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../lib/firebase';
import { Colors, FontSize, Radius, Spacing, Typography } from '../../constants/theme';
import { UserProfile } from '../../types/models';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });

      // Create Firestore user profile
      const profile: Omit<UserProfile, 'uid'> = {
        displayName: name.trim(),
        email: email.trim(),
        currency: 'INR',
        defaultWalletId: null,
        createdAt: Timestamp.now(),
      };
      await setDoc(doc(db, 'users', cred.user.uid), profile);

      // Go to onboarding
      router.replace('/onboarding');
    } catch (err: any) {
      Alert.alert('Registration failed', err.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.wordmark}>Create account</Text>
            <Text style={styles.tagline}>Start tracking your spending.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.inputLabel}>YOUR NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="Ali"
              placeholderTextColor={Colors.mutedStone}
              autoCapitalize="words"
              autoComplete="name"
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.inputLabel, { marginTop: Spacing.base }]}>EMAIL</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.mutedStone}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={[styles.inputLabel, { marginTop: Spacing.base }]}>PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="Min. 6 characters"
              placeholderTextColor={Colors.mutedStone}
              secureTextEntry
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity
              style={[styles.pillBtn, loading && { opacity: 0.6 }]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.polarWhite} />
              ) : (
                <Text style={styles.pillBtnText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.back()}
          >
            <Text style={styles.linkText}>
              Already have an account?{' '}
              <Text style={styles.linkBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvasIce },
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  backBtn: { marginTop: Spacing.base, marginBottom: Spacing.xl },
  backText: {
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
  },
  header: { marginBottom: Spacing['3xl'] },
  wordmark: {
    ...Typography.heading,
    fontSize: FontSize['5xl'],
    color: Colors.carbonBlack,
    letterSpacing: -1.5,
  },
  tagline: {
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
    marginTop: Spacing.xs,
  },
  form: { marginBottom: Spacing.xl },
  inputLabel: {
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
  pillBtn: {
    backgroundColor: Colors.carbonBlack,
    borderRadius: Radius.full,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  pillBtnText: {
    ...Typography.bodyBold,
    fontSize: FontSize.md,
    color: Colors.polarWhite,
  },
  linkRow: { alignItems: 'center', marginTop: Spacing.lg },
  linkText: {
    ...Typography.body,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
  },
  linkBold: { ...Typography.bodyBold, color: Colors.carbonBlack },
});
