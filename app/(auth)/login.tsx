// ─────────────────────────────────────────────
//  SPENDNOT — Login Screen
//  app/(auth)/login.tsx
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
import { signInWithEmailAndPassword } from 'firebase/auth';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../lib/firebase';
import { Colors, FontSize, Radius, Spacing, Typography } from '../../constants/theme';
import * as AppleAuthentication from 'expo-apple-authentication';
import { OAuthProvider, signInWithCredential } from 'firebase/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // AuthGuard in _layout.tsx handles redirect
    } catch (err: any) {
      Alert.alert('Sign-in failed', err.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const provider = new OAuthProvider('apple.com');
      const firebaseCredential = provider.credential({
        idToken: credential.identityToken!,
      });
      await signInWithCredential(auth, firebaseCredential);
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple Sign-In failed', err.message ?? 'Please try again.');
      }
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {/* Logo / Wordmark */}
          <View style={styles.header}>
            <Text style={styles.wordmark}>SPENDNOT</Text>
            <Text style={styles.tagline}>Know where it went.</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.inputLabel}>EMAIL</Text>
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
              placeholder="••••••••"
              placeholderTextColor={Colors.mutedStone}
              secureTextEntry
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity
              style={[styles.pillBtn, loading && { opacity: 0.6 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.polarWhite} />
              ) : (
                <Text style={styles.pillBtnText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Apple Sign-In */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={Radius.full}
              style={styles.appleBtn}
              onPress={handleAppleLogin}
            />
          )}

          {/* Register link */}
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.linkText}>
              Don't have an account?{' '}
              <Text style={styles.linkBold}>Create one</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.canvasIce,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    justifyContent: 'center',
  },
  header: {
    marginBottom: Spacing['3xl'],
    alignItems: 'flex-start',
  },
  wordmark: {
    ...Typography.heading,
    fontSize: FontSize['7xl'],
    color: Colors.carbonBlack,
    letterSpacing: -2,
  },
  tagline: {
    ...Typography.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
    marginTop: Spacing.xs,
  },
  form: {
    marginBottom: Spacing.xl,
  },
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.base,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.ghostGray,
  },
  dividerText: {
    ...Typography.body,
    fontSize: FontSize.sm,
    color: Colors.mutedStone,
  },
  appleBtn: {
    width: '100%',
    height: 54,
    marginBottom: Spacing.base,
  },
  linkRow: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  linkText: {
    ...Typography.body,
    fontSize: FontSize.base,
    color: Colors.mutedStone,
  },
  linkBold: {
    ...Typography.bodyBold,
    color: Colors.carbonBlack,
  },
});
