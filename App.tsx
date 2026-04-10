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
  ACTIVITY_LEVELS,
  BOTTLE_CAPACITIES,
  BOTTLE_COLORS,
  BOTTLE_IDS,
  CLIMATE_OPTIONS,
  SEX_OPTIONS,
  type ActivityLevel,
  type BottleColor,
  type BottleId,
  type Climate,
  type Sex,
} from './constants';
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
      {onboardingComplete ? <MainPanel /> : <OnboardingPanel />}
      <StatusBar style="auto" />
    </>
  );
}

// ─── Onboarding panel ─────────────────────────────────────────────────────────

function OnboardingPanel() {
  const {
    age, sex, weightLb, activityLevel, climate,
    selectedBottleId, bottleColor,
    setProfileField, completeOnboarding,
  } = useProfileStore();

  // Text inputs need local string state; we parse on submit.
  const [ageText, setAgeText] = useState(age !== null ? String(age) : '');
  const [weightText, setWeightText] = useState(weightLb !== null ? String(weightLb) : '');
  const [error, setError] = useState<string | null>(null);

  function handleComplete() {
    const parsedAge = parseInt(ageText, 10);
    const parsedWeight = parseFloat(weightText);

    if (!Number.isFinite(parsedAge) || parsedAge <= 0) {
      setError('Age must be a positive number.');
      return;
    }
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setError('Weight must be a positive number.');
      return;
    }

    setProfileField('age', parsedAge);
    setProfileField('weightLb', parsedWeight);
    setError(null);

    const success = completeOnboarding();
    if (!success) {
      setError('All 7 fields required. Check sex / activity / climate / bottle / color.');
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.title}>DEBUG — Onboarding</Text>

      <Field label="Age">
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={ageText}
          onChangeText={setAgeText}
          placeholder="e.g. 30"
        />
      </Field>

      <Field label="Weight (lbs)">
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={weightText}
          onChangeText={setWeightText}
          placeholder="e.g. 160"
        />
      </Field>

      <Field label={`Sex  [${sex ?? '—'}]`}>
        <ButtonRow>
          {SEX_OPTIONS.map((opt) => (
            <Button
              key={opt}
              title={opt}
              onPress={() => setProfileField('sex', opt as Sex)}
              color={sex === opt ? '#007AFF' : '#999'}
            />
          ))}
        </ButtonRow>
      </Field>

      <Field label={`Activity  [${activityLevel ?? '—'}]`}>
        <ButtonRow>
          {ACTIVITY_LEVELS.map((opt) => (
            <Button
              key={opt}
              title={opt}
              onPress={() => setProfileField('activityLevel', opt as ActivityLevel)}
              color={activityLevel === opt ? '#007AFF' : '#999'}
            />
          ))}
        </ButtonRow>
      </Field>

      <Field label={`Climate  [${climate ?? '—'}]`}>
        <ButtonRow>
          {CLIMATE_OPTIONS.map((opt) => (
            <Button
              key={opt}
              title={opt}
              onPress={() => setProfileField('climate', opt as Climate)}
              color={climate === opt ? '#007AFF' : '#999'}
            />
          ))}
        </ButtonRow>
      </Field>

      <Field label={`Bottle  [${selectedBottleId ?? '—'}]`}>
        <ButtonRow>
          {BOTTLE_IDS.map((id) => (
            <Button
              key={id}
              title={id}
              onPress={() => setProfileField('selectedBottleId', id as BottleId)}
              color={selectedBottleId === id ? '#007AFF' : '#999'}
            />
          ))}
        </ButtonRow>
      </Field>

      <Field label={`Color  [${bottleColor ?? '—'}]`}>
        <ButtonRow>
          {BOTTLE_COLORS.map((c) => (
            <Button
              key={c}
              title={c}
              onPress={() => setProfileField('bottleColor', c as BottleColor)}
              color={bottleColor === c ? '#007AFF' : '#999'}
            />
          ))}
        </ButtonRow>
      </Field>

      <Spacer />
      <Button title="COMPLETE ONBOARDING →" onPress={handleComplete} />
      {error !== null && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

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
    backgroundColor: '#fff',
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
  // Field (onboarding panel)
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#444',
    marginBottom: 4,
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
  error: {
    marginTop: 10,
    color: '#FF3B30',
    fontSize: 13,
  },
});
