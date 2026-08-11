import '../gesture-handler';
import { useEffect, useState } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useFonts, Montserrat_900Black } from '@expo-google-fonts/montserrat';
import { Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { View, Text, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { TabBarVisibilityProvider } from '../context/TabBarVisibilityContext';
import { Colors, FontSize, Radius, Spacing, Typography } from '../constants/theme';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(false);

  useEffect(() => {
    if (loading || !user) {
      setOnboardingChecked(false);
      return;
    }
    // Check if user has completed onboarding
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      setHasOnboarded(snap.exists() && !!snap.data()?.hasCompletedOnboarding);
      setOnboardingChecked(true);
    });
  }, [user, loading]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';
    const inTabs = segments[0] === '(tabs)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // Just signed in — route to onboarding or tabs based on completion flag
      if (onboardingChecked) {
        router.replace(hasOnboarded ? '/(tabs)' : '/onboarding');
      }
    }
    // Note: do NOT redirect from tabs → onboarding — causes a loop if write is delayed
  }, [user, loading, segments, onboardingChecked, hasOnboarded]);

  if (loading || (user && !onboardingChecked)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.canvasIce }}>
        <ActivityIndicator color={Colors.carbonBlack} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Montserrat_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  // Inject @font-face CSS on web using exact names matching the StyleSheets
  useEffect(() => {
    if (Platform.OS === 'web') {
      const style = document.createElement('style');
      style.textContent = `
        @font-face {
          font-family: 'Montserrat_900Black';
          font-style: normal;
          font-weight: 900;
          font-display: swap;
          src: url(https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCvC73w5aXp-p7K4KLg.woff2) format('woff2');
        }
        @font-face {
          font-family: 'Inter_400Regular';
          font-style: normal;
          font-weight: 400;
          font-display: swap;
          src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2');
        }
        @font-face {
          font-family: 'Inter_500Medium';
          font-style: normal;
          font-weight: 500;
          font-display: swap;
          src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2');
        }
        @font-face {
          font-family: 'Inter_700Bold';
          font-style: normal;
          font-weight: 700;
          font-display: swap;
          src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2');
        }
        
        /* Remove default browser focus rings and highlight colors on Web */
        * {
          outline: none !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        *:focus {
          outline: none !important;
          box-shadow: none !important;
        }
        input:focus, textarea:focus, select:focus, button:focus {
          outline: none !important;
          box-shadow: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // On web, don't block rendering on font load — CSS fonts load asynchronously
  if (!fontsLoaded && Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.canvasIce }}>
        <ActivityIndicator color={Colors.carbonBlack} />
      </View>
    );
  }

  const toastConfig = {
    success: ({ text1, text2 }: any) => (
      <View style={toastStyles.base}>
        <Text style={toastStyles.text1}>{text1}</Text>
        {text2 ? <Text style={toastStyles.text2}>{text2}</Text> : null}
      </View>
    ),
    error: ({ text1, text2 }: any) => (
      <View style={[toastStyles.base, toastStyles.error]}>
        <Text style={toastStyles.text1}>{text1}</Text>
        {text2 ? <Text style={toastStyles.text2}>{text2}</Text> : null}
      </View>
    ),
    info: ({ text1, text2 }: any) => (
      <View style={[toastStyles.base, toastStyles.info]}>
        <Text style={toastStyles.text1}>{text1}</Text>
        {text2 ? <Text style={toastStyles.text2}>{text2}</Text> : null}
      </View>
    ),
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <TabBarVisibilityProvider>
            <AuthGuard>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="modals/add-expense"
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="modals/add-emi"
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="modals/edit-expense"
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="modals/add-wallet"
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="modals/wallet-report"
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
              </Stack>
            </AuthGuard>
            <Toast config={toastConfig} />
          </TabBarVisibilityProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const toastStyles = StyleSheet.create({
  base: {
    width: '88%',
    backgroundColor: '#1A1A1A',
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  error: {
    backgroundColor: '#FF3B30',
  },
  info: {
    backgroundColor: '#007AFF',
  },
  text1: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  text2: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
  },
});
