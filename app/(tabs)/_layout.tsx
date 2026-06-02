// ─────────────────────────────────────────────
//  SPENDNOT — Tab Layout — Floating Pill Nav
//  app/(tabs)/_layout.tsx
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import { Tabs, router } from 'expo-router';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '../../constants/theme';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

// ── SVG Icons ────────────────────────────────
function HomeIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M9 21V12h6v9" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}

function WalletIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="5" width="20" height="15" rx="2" stroke={color} strokeWidth={1.8} />
      <Path d="M16 12a1 1 0 100 2 1 1 0 000-2z" fill={color} />
      <Path d="M2 9h20" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function OverviewIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M3 3v18h18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M7 16l4-5 4 3 4-6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ProfileIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={1.8} />
      <Path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function PlusIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={Colors.carbonBlack} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

const getPath = (w: number) => {
  const h = 56;
  const r = 28;
  const bumpHeight = 16;
  const mid = w / 2;
  return `
    M ${r} ${bumpHeight}
    L ${mid - 44} ${bumpHeight}
    C ${mid - 28} ${bumpHeight} ${mid - 24} 0 ${mid} 0
    C ${mid + 24} 0 ${mid + 28} ${bumpHeight} ${mid + 44} ${bumpHeight}
    L ${w - r} ${bumpHeight}
    A ${r} ${r} 0 0 1 ${w} ${bumpHeight + r}
    L ${w} ${bumpHeight + h - r}
    A ${r} ${r} 0 0 1 ${w - r} ${bumpHeight + h}
    L ${r} ${bumpHeight + h}
    A ${r} ${r} 0 0 1 0 ${bumpHeight + h - r}
    L 0 ${bumpHeight + r}
    A ${r} ${r} 0 0 1 ${r} ${bumpHeight}
    Z
  `;
};

// ── Custom Tab Bar ────────────────────────────
function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);

  const TABS = [
    { name: 'index', Icon: HomeIcon },
    { name: 'wallets', Icon: WalletIcon },
    { name: 'reports', Icon: OverviewIcon },
    { name: 'profile', Icon: ProfileIcon },
  ];

  return (
    <View
      style={[tabStyles.outerWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
      pointerEvents="box-none"
    >
      <View
        style={tabStyles.pillContainer}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        pointerEvents="box-none"
      >
        {width > 0 && (
          <Svg
            width={width}
            height={72}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Path
              d={getPath(width)}
              fill={Colors.carbonBlack}
            />
          </Svg>
        )}

        {/* + button — rendered centered in the bump */}
        <TouchableOpacity
          style={tabStyles.addBtn}
          onPress={() => router.push('/modals/add-expense')}
          activeOpacity={0.85}
        >
          <PlusIcon />
        </TouchableOpacity>

        {/* Icons row overlaid on the flat part of the tab bar */}
        <View style={tabStyles.iconRow} pointerEvents="box-none">
          {/* Left 2 tabs */}
          {TABS.slice(0, 2).map(({ name, Icon }) => {
            const idx = state.routes.findIndex((r: any) => r.name === name);
            const isFocused = idx !== -1 && state.index === idx;
            const color = isFocused ? '#ffffff' : 'rgba(255,255,255,0.45)';
            return (
              <TouchableOpacity
                key={name}
                style={[tabStyles.tabBtn, isFocused && tabStyles.tabBtnActive]}
                onPress={() => navigation.navigate(name)}
                activeOpacity={0.7}
              >
                <Icon color={color} />
              </TouchableOpacity>
            );
          })}

          {/* Center gap — sits below the + button */}
          <View style={tabStyles.centerGap} pointerEvents="none" />

          {/* Right 2 tabs */}
          {TABS.slice(2).map(({ name, Icon }) => {
            const idx = state.routes.findIndex((r: any) => r.name === name);
            const isFocused = idx !== -1 && state.index === idx;
            const color = isFocused ? '#ffffff' : 'rgba(255,255,255,0.45)';
            return (
              <TouchableOpacity
                key={name}
                style={[tabStyles.tabBtn, isFocused && tabStyles.tabBtnActive]}
                onPress={() => navigation.navigate(name)}
                activeOpacity={0.7}
              >
                <Icon color={color} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  outerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pillContainer: {
    width: '90%',
    maxWidth: 400,
    height: 72,
    position: 'relative',
  },
  addBtn: {
    position: 'absolute',
    top: 4,
    left: '50%',
    marginLeft: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.lilacPink,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    height: 56,
    marginTop: 16,
    width: '100%',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 20,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  centerGap: {
    width: 60,
  },
});

// ── Tab Layout ────────────────────────────────
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="wallets" />
      <Tabs.Screen name="budgets" options={{ href: null }} />
      <Tabs.Screen name="reports" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
