// ─────────────────────────────────────────────
//  SPENDNOT — Tab Bar Visibility Context
//  context/TabBarVisibilityContext.tsx
// ─────────────────────────────────────────────
import React, { createContext, useContext, useRef, useCallback } from 'react';
import { Animated } from 'react-native';

interface TabBarVisibilityContextValue {
  translateY: Animated.Value;
  /** Call from a ScrollView's onScroll to auto-hide the tab bar on downscroll */
  onScroll: (event: any) => void;
  /** Immediately show the tab bar */
  show: () => void;
  /** Immediately hide the tab bar */
  hide: () => void;
}

const HIDE_THRESHOLD = 80; // px from top before directional hiding kicks in
const TAB_BAR_SLIDE = 140; // how far to push off screen

const TabBarVisibilityContext = createContext<TabBarVisibilityContextValue | null>(null);

export function TabBarVisibilityProvider({ children }: { children: React.ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const isHidden = useRef(false);

  const show = useCallback(() => {
    isHidden.current = false;
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 90,
      friction: 14,
    }).start();
  }, [translateY]);

  const hide = useCallback(() => {
    isHidden.current = true;
    Animated.spring(translateY, {
      toValue: TAB_BAR_SLIDE,
      useNativeDriver: true,
      tension: 90,
      friction: 14,
    }).start();
  }, [translateY]);

  const onScroll = useCallback((event: any) => {
    const currentY: number = event.nativeEvent.contentOffset.y;
    const delta = currentY - lastScrollY.current;
    lastScrollY.current = currentY;

    if (currentY < HIDE_THRESHOLD) {
      show();
    } else if (delta > 4) {
      hide();
    } else if (delta < -4) {
      show();
    }
  }, [show, hide]);

  return (
    <TabBarVisibilityContext.Provider value={{ translateY, onScroll, show, hide }}>
      {children}
    </TabBarVisibilityContext.Provider>
  );
}

export function useTabBarVisibility() {
  const ctx = useContext(TabBarVisibilityContext);
  if (!ctx) throw new Error('useTabBarVisibility must be used inside TabBarVisibilityProvider');
  return ctx;
}
