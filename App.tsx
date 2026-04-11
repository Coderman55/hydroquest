// HydroQuest — Day 2 debug harness.
// Ugly on purpose. Goal: prove every store action works correctly on device.
// This file will be replaced with real screens after logic is verified.

import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  BOTTLE_CAPACITIES,
  CLIMATE_OPTIONS,
  type Climate,
} from './constants';
import { palette } from './constants/theme';
import { OnboardingFlow } from './components/OnboardingFlow';
import { useHydrationStore } from './store/useHydrationStore';
import { useProfileStore } from './store/useProfileStore';

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  // Use selectors so only the fields we care about trigger re-renders here.
  const profileHydrated = useProfileStore((s) => s.hasHydrated);
  const hydrationHydrated = useHydrationStore((s) => s.hasHydrated);
  const onboardingComplete = useProfileStore((s) => s.onboardingComplete);

  // Profile fields needed to pass to runNewDayCheck.
  const weightLb = useProfileStore((s) => s.weightLb);
  const age = useProfileStore((s) => s.age);
  const sex = useProfileStore((s) => s.sex);
  const activityLevel = useProfileStore((s) => s.activityLevel);
  const climate = useProfileStore((s) => s.climate);
  const runNewDayCheck = useHydrationStore((s) => s.runNewDayCheck);

  const isLoading = !profileHydrated || !hydrationHydrated;

  // Run new-day check exactly once after both stores finish loading from AsyncStorage.
  // The ref prevents it from firing again if dependencies change later.
  const newDayCheckRan = useRef(false);
  useEffect(() => {
    if (!isLoading && !newDayCheckRan.current) {
      newDayCheckRan.current = true;
      runNewDayCheck({ weightLb, age, sex, activityLevel, climate });
    }
  }, [isLoading, runNewDayCheck, weightLb, age, sex, activityLevel, climate]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.mono}>Loading stores…</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <>
      {onboardingComplete ? <MainPanel /> : <OnboardingFlow onComplete={() => {}} />}
      <StatusBar style="auto" />
    </>
  );
}

// ─── Main debug panel ─────────────────────────────────────────────────────────

function MainPanel() {
  const {
    age, sex, weightLb, activityLevel, climate,
    selectedBottleId, bottleColor,
    setClimate, resetProfile,
  } = useProfileStore();

  const {
    todayIntakeOz, draftLogOz, dailyGoalOz, recommendedGoalOz,
    streakCount, lastOpenedDate, lastGoalHitDate,
    logWater, setDraftLog, runNewDayCheck,
    _setLastOpenedDateToYesterday, resetHydration,
  } = useHydrationStore();

  const [customText, setCustomText] = useState('');

  // Derived values (never stored, always computed).
  const goalPercent = dailyGoalOz > 0 ? todayIntakeOz / dailyGoalOz : 0;
  const remainingOz = Math.max(0, dailyGoalOz - todayIntakeOz);
  const bottleFillPercent =
    selectedBottleId != null
      ? Math.min(draftLogOz / BOTTLE_CAPACITIES[selectedBottleId], 1)
      : 0;

  function handleCustomLog() {
    const parsed = parseFloat(customText);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    logWater(parsed);
    setCustomText('');
  }

  // Zustand set() is synchronous. _setLastOpenedDateToYesterday() writes to the
  // store immediately, so the subsequent runNewDayCheck() reads the updated date.
  function handleSimulateNewDay() {
    _setLastOpenedDateToYesterday();
    runNewDayCheck({ weightLb, age, sex, activityLevel, climate });
  }

  function handleResetAll() {
    resetProfile();
    resetHydration();
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {todayIntakeOz === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Log your first sip to start your streak.</Text>
          <Button title="Log 8 oz" onPress={() => logWater(8)} color={palette.accent} />
        </View>
      )}
      <Text style={styles.title}>DEBUG — Hydration State</Text>

      {/* ── Persisted hydration state ── */}
      <Section label="HYDRATION STATE">
        <KV k="todayIntakeOz" v={todayIntakeOz} />
        <KV k="dailyGoalOz" v={dailyGoalOz} />
        <KV k="recommendedGoalOz" v={recommendedGoalOz} />
        <KV k="streakCount" v={streakCount} />
        <KV k="lastOpenedDate" v={lastOpenedDate ?? 'null'} />
        <KV k="lastGoalHitDate" v={lastGoalHitDate ?? 'null'} />
      </Section>

      {/* ── Ephemeral + derived ── */}
      <Section label="EPHEMERAL / DERIVED">
        <KV k="draftLogOz" v={draftLogOz} />
        <KV k="goalPercent" v={`${(goalPercent * 100).toFixed(1)}%`} />
        <KV k="remainingOz" v={remainingOz} />
        <KV k="bottleFillPercent" v={`${(bottleFillPercent * 100).toFixed(1)}%`} />
      </Section>

      {/* ── Profile ── */}
      <Section label="PROFILE">
        <KV k="age" v={age ?? 'null'} />
        <KV k="sex" v={sex ?? 'null'} />
        <KV k="weightLb" v={weightLb ?? 'null'} />
        <KV k="activityLevel" v={activityLevel ?? 'null'} />
        <KV k="climate" v={climate ?? 'null'} />
        <KV k="selectedBottleId" v={selectedBottleId ?? 'null'} />
        <KV k="bottleColor" v={bottleColor ?? 'null'} />
      </Section>

      {/* ── Quick-log ── */}
      <Section label="QUICK LOG (logWater + sets draftLogOz)">
        <ButtonRow>
          <Button title="4 oz" onPress={() => logWater(4)} />
          <Button title="16 oz" onPress={() => logWater(16)} />
          <Button title="32 oz" onPress={() => logWater(32)} />
        </ButtonRow>
      </Section>

      {/* ── Set draft (no log) ── */}
      <Section label="SET DRAFT ONLY (no log)">
        <ButtonRow>
          <Button title="0 (clear)" onPress={() => setDraftLog(0)} />
          <Button title="8" onPress={() => setDraftLog(8)} />
          <Button title="16" onPress={() => setDraftLog(16)} />
          <Button title="24" onPress={() => setDraftLog(24)} />
          <Button title="32" onPress={() => setDraftLog(32)} />
        </ButtonRow>
      </Section>

      {/* ── Custom log ── */}
      <Section label="CUSTOM LOG (slider path)">
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
            keyboardType="decimal-pad"
            value={customText}
            onChangeText={setCustomText}
            placeholder="amount in oz"
            returnKeyType="done"
            onSubmitEditing={handleCustomLog}
          />
          <Button title="Log" onPress={handleCustomLog} />
        </View>
      </Section>

      {/* ── Climate ── */}
      <Section label="CLIMATE (recomputes dailyGoalOz immediately)">
        <ButtonRow>
          {CLIMATE_OPTIONS.map((opt) => (
            <Button
              key={opt}
              title={opt}
              onPress={() => setClimate(opt as Climate)}
              color={climate === opt ? '#007AFF' : '#999'}
            />
          ))}
        </ButtonRow>
      </Section>

      {/* ── Debug actions ── */}
      <Section label="DEBUG ACTIONS">
        <Button
          title="Simulate New Day (rewinds tracked dates → 1 day)"
          onPress={handleSimulateNewDay}
          color="#FF9500"
        />
        <Spacer />
        <Button
          title="Reset All → back to onboarding"
          onPress={handleResetAll}
          color="#FF3B30"
        />
      </Section>
    </ScrollView>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ButtonRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function KV({ k, v }: { k: string; v: string | number }) {
  return (
    <Text style={styles.mono}>
      {k}:{' '}
      <Text style={styles.monoValue}>{String(v)}</Text>
    </Text>
  );
}

function Spacer() {
  return <View style={{ height: 10 }} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  emptyState: {
    backgroundColor: palette.bgSoft,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    gap: 10,
  },
  emptyStateText: {
    fontSize: 14,
    color: palette.ink,
    textAlign: 'center',
  },
  content: {
    padding: 16,
    paddingTop: 60,
    paddingBottom: 48,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  // Section (main panel)
  section: {
    marginBottom: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#888',
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#bbb',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: 12,
    lineHeight: 19,
    color: '#555',
  },
  monoValue: {
    fontWeight: '700',
    color: '#000',
  },
});
