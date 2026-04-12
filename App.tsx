// HydroQuest — Root app shell.
// Responsibilities:
//   1. Guard rendering until both stores finish rehydrating from AsyncStorage.
//   2. Run runNewDayCheck() exactly once per cold start after stores are ready.
//   3. Route to OnboardingFlow or HomeScreen based on onboardingComplete.
//   4. In __DEV__, render a small visible "DEV" pill in the top-left safe-area
//      that toggles DevDebugPanel as a full-screen overlay over HomeScreen.

import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DevDebugPanel } from './components/DevDebugPanel';
import { HomeScreen } from './components/HomeScreen';
import { OnboardingFlow } from './components/OnboardingFlow';
import { fontSize, palette } from './constants/theme';
import { useHydrationStore } from './store/useHydrationStore';
import { useProfileStore } from './store/useProfileStore';

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // Use fine-grained selectors so only the fields we care about trigger re-renders.
  const profileHydrated    = useProfileStore((s) => s.hasHydrated);
  const hydrationHydrated  = useHydrationStore((s) => s.hasHydrated);
  const onboardingComplete = useProfileStore((s) => s.onboardingComplete);

  // Profile fields needed to pass to runNewDayCheck.
  const weightLb     = useProfileStore((s) => s.weightLb);
  const age          = useProfileStore((s) => s.age);
  const sex          = useProfileStore((s) => s.sex);
  const activityLevel = useProfileStore((s) => s.activityLevel);
  const climate      = useProfileStore((s) => s.climate);
  const runNewDayCheck = useHydrationStore((s) => s.runNewDayCheck);

  const isLoading = !profileHydrated || !hydrationHydrated;

  // Run new-day check exactly once after both stores finish loading from AsyncStorage.
  // The ref prevents it from re-firing if any dependency identity changes later.
  const newDayCheckRan = useRef(false);
  useEffect(() => {
    if (!isLoading && !newDayCheckRan.current) {
      newDayCheckRan.current = true;
      runNewDayCheck({ weightLb, age, sex, activityLevel, climate });
    }
  }, [isLoading, runNewDayCheck, weightLb, age, sex, activityLevel, climate]);

  // Dev-only: toggle the debug overlay.
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // ── Loading gate ─────────────────────────────────────────────────────────────
  if (isLoading) {
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

