// HydroQuest — Root app shell.
// Responsibilities:
//   1. Guard rendering until both stores finish rehydrating from AsyncStorage.
//   2. Keep aggregate hydration state current at startup, foreground, and midnight.
//   3. Route to OnboardingFlow or HomeScreen based on onboardingComplete.
//   4. In __DEV__, render a small visible "DEV" pill in the top-left safe-area
//      that toggles DevDebugPanel as a full-screen overlay over HomeScreen.

import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { DevDebugPanel } from './components/DevDebugPanel';
import { HomeScreen } from './components/HomeScreen';
import { OnboardingFlow } from './components/OnboardingFlow';
import { fontSize, palette } from './constants/theme';
import { useHydrationStore } from './store/useHydrationStore';
import { useProfileStore } from './store/useProfileStore';

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // Use fine-grained selectors so only the fields we care about trigger re-renders.
  const profilePersistenceStatus = useProfileStore((s) => s.persistenceStatus);
  const hydrationPersistenceStatus = useHydrationStore((s) => s.persistenceStatus);
  const retryProfileHydration = useProfileStore((s) => s.retryHydration);
  const retryHydration = useHydrationStore((s) => s.retryHydration);
  const onboardingComplete = useProfileStore((s) => s.onboardingComplete);

  const bothStoresReady =
    profilePersistenceStatus === 'ready' && hydrationPersistenceStatus === 'ready';
  const hasPersistenceError =
    profilePersistenceStatus === 'error' || hydrationPersistenceStatus === 'error';
  const [initialDayCheckComplete, setInitialDayCheckComplete] = useState(false);

  const runCurrentDayCheck = useCallback(() => {
    const profile = useProfileStore.getState();
    useHydrationStore.getState().runNewDayCheck({
      weightLb: profile.weightLb,
      age: profile.age,
      sex: profile.sex,
      activityLevel: profile.activityLevel,
      climate: profile.climate,
    });
  }, []);

  // Route only after the initial rollover has finished, so HomeScreen cannot
  // accept a mutation carrying yesterday's aggregate state into today's ledger.
  useEffect(() => {
    if (bothStoresReady && !initialDayCheckComplete) {
      runCurrentDayCheck();
      setInitialDayCheckComplete(true);
    }
  }, [bothStoresReady, initialDayCheckComplete, runCurrentDayCheck]);

  // Check at every local midnight while foregrounded. Background transitions
  // cancel the timer; a foreground transition checks immediately and reschedules.
  useEffect(() => {
    if (!bothStoresReady || !initialDayCheckComplete) return;

    let midnightTimer: ReturnType<typeof setTimeout> | null = null;
    let currentAppState = AppState.currentState;
    const clearMidnightTimer = () => {
      if (midnightTimer !== null) clearTimeout(midnightTimer);
      midnightTimer = null;
    };
    const scheduleMidnightCheck = () => {
      clearMidnightTimer();
      if (currentAppState !== 'active') return;
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      midnightTimer = setTimeout(() => {
        runCurrentDayCheck();
        scheduleMidnightCheck();
      }, Math.max(1, nextMidnight.getTime() - now.getTime()));
    };
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const enteringForeground = nextAppState === 'active' && currentAppState !== 'active';
      currentAppState = nextAppState;
      if (enteringForeground) {
        runCurrentDayCheck();
        scheduleMidnightCheck();
      } else if (nextAppState !== 'active') {
        clearMidnightTimer();
      }
    });

    scheduleMidnightCheck();
    return () => {
      clearMidnightTimer();
      subscription.remove();
    };
  }, [bothStoresReady, initialDayCheckComplete, runCurrentDayCheck]);

  // Dev-only: toggle the debug overlay.
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // ── Loading gate ─────────────────────────────────────────────────────────────
  if (!bothStoresReady && !hasPersistenceError) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading…</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (hasPersistenceError) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Your saved data could not be loaded.</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => {
            if (profilePersistenceStatus === 'error') retryProfileHydration();
            if (hydrationPersistenceStatus === 'error') retryHydration();
          }}
        >
          <Text style={styles.retryLabel}>Retry</Text>
        </Pressable>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!initialDayCheckComplete) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading…</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <>
      {onboardingComplete ? (
        <>
          <HomeScreen />

          {/* ── Dev-only debug overlay ─────────────────────────────────────────
              Small "DEV" pill pinned to the top-left safe-area region.
              Clearly tappable on a real iPhone; stripped entirely in production.
              Nothing visible appears in non-dev builds (__DEV__ guard). */}
          {__DEV__ && (
            <>
              <Pressable
                style={styles.debugTapTarget}
                onPress={() => setShowDebugPanel((v) => !v)}
                hitSlop={8}
              >
                <Text style={styles.debugTapLabel}>DEV</Text>
              </Pressable>
              {showDebugPanel && (
                <View style={styles.debugOverlay}>
                  <Pressable
                    style={styles.debugCloseBar}
                    onPress={() => setShowDebugPanel(false)}
                  >
                    <Text style={styles.debugCloseText}>✕  Close debug panel</Text>
                  </Pressable>
                  <DevDebugPanel />
                </View>
              )}
            </>
          )}
        </>
      ) : (
        // onComplete is a no-op: completeOnboarding() writes directly to the
        // store, which triggers a re-render of App and routes to HomeScreen.
        <OnboardingFlow onComplete={() => {}} />
      )}
      <StatusBar style="auto" />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Loading gate
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bg,
  },
  loadingText: {
    fontSize: fontSize.body,
    color: palette.inkSoft,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: palette.ink,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryLabel: {
    color: palette.white,
    fontSize: fontSize.body,
    fontWeight: '600',
  },

  // Dev trigger pill — position absolute, top-left, clears status bar.
  // Visible only in __DEV__; does not exist in production bundles.
  debugTapTarget: {
    position: 'absolute',
    top: 52,
    left: 16,
    backgroundColor: 'rgba(47, 72, 88, 0.18)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 44,
    alignItems: 'center',
  },
  debugTapLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(47, 72, 88, 0.7)',
    letterSpacing: 0.8,
  },

  // Debug overlay — opaque, full-screen, sits above HomeScreen
  debugOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.bg,
  },

  // Close bar at top of overlay — tall enough to clear the status bar / notch
  debugCloseBar: {
    backgroundColor: palette.ink,
    paddingTop: 54,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  debugCloseText: {
    color: palette.white,
    fontSize: 14,
    fontWeight: '600',
  },
});
