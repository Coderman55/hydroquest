// HydroQuest — Day 3 onboarding flow.
// Five screens, local step state, no navigation library.
// Calls setProfileField progressively; completeOnboarding() only on final CTA.

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
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
} from '../constants';
import {
  BOTTLE_COLOR_HEX,
  fontSize,
  fonts,
  palette,
  radius,
  spacing,
} from '../constants/theme';
import { calculateGoal } from '../lib/calculateGoal';
import { useProfileStore } from '../store/useProfileStore';

// ─── Bottle silhouettes ───────────────────────────────────────────────────────
// Built from Views only — no SVG, Expo-Go-safe.

function SportCurveBottle({ color, scale = 1 }: { color: string; scale?: number }) {
  const s = scale;
  return (
    <View style={bStyles.wrapper}>
      <View style={[bStyles.sportCap, { backgroundColor: color, width: 14 * s, height: 10 * s }]} />
      <View style={[bStyles.sportNeck, { backgroundColor: color, width: 22 * s, height: 16 * s }]} />
      <View style={[bStyles.sportBody, { backgroundColor: color, width: 56 * s, height: 124 * s, borderRadius: 20 * s }]} />
    </View>
  );
}

function BlockTumblerBottle({ color, scale = 1 }: { color: string; scale?: number }) {
  const s = scale;
  return (
    <View style={bStyles.wrapper}>
      <View style={[bStyles.tumblerLid, { backgroundColor: color, width: 68 * s, height: 16 * s }]} />
      <View style={[bStyles.tumblerBody, { backgroundColor: color, width: 76 * s, height: 104 * s, borderRadius: 10 * s }]} />
    </View>
  );
}

const bStyles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  // Sport Curve
  sportCap: { borderRadius: 4 },
  sportNeck: { borderRadius: 4, marginTop: 1 },
  sportBody: { marginTop: 2 },
  // Block Tumbler
  tumblerLid: {
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  tumblerBody: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    marginTop: 2,
  },
});

// ─── Shared components ────────────────────────────────────────────────────────

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[s.cta, disabled && s.ctaDisabled]}
    >
      <Text style={[s.ctaText, disabled && s.ctaTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.backBtn} hitSlop={12}>
      <Text style={s.backBtnText}>← Back</Text>
    </Pressable>
  );
}

function StepHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={s.headingBlock}>
      <Text style={s.stepTitle}>{title}</Text>
      {!!sub && <Text style={s.stepSub}>{sub}</Text>}
    </View>
  );
}

// ─── Screen 1: Welcome ────────────────────────────────────────────────────────

function WelcomeScreen({ onNext }: { onNext: () => void }) {
  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.welcomeInner}>
        {/* Upper-middle content block */}
        <View style={s.welcomeHero}>
          {/* Minimal bottle emblem */}
          <View style={s.emblemWrapper}>
            <View style={s.emblemCap} />
            <View style={s.emblemNeck} />
            <View style={s.emblemBody} />
          </View>
          <Text style={s.welcomeHeadline}>Refresh your day.</Text>
          <Text style={s.welcomeSub}>
            A hydration plan that actually fits your life, not the other way around.
          </Text>
        </View>

        {/* CTA pinned toward bottom */}
        <View style={s.welcomeCTAArea}>
          <PrimaryButton label="Get started" onPress={onNext} />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Screen 2: About you ──────────────────────────────────────────────────────

function AboutYouScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { age, sex, weightLb, setProfileField } = useProfileStore();

  const [ageText, setAgeText] = useState(age !== null ? String(age) : '');
  const [weightText, setWeightText] = useState(weightLb !== null ? String(weightLb) : '');

  const parsedAge = parseInt(ageText, 10);
  const parsedWeight = parseFloat(weightText);
  const ageOk = Number.isFinite(parsedAge) && parsedAge > 0;
  const weightOk = Number.isFinite(parsedWeight) && parsedWeight > 0;
  const canProceed = ageOk && weightOk && sex !== null;

  const sexLabels: Record<Sex, string> = { male: 'Male', female: 'Female', other: 'Other' };

  function handleNext() {
    if (!canProceed) return;
    setProfileField('age', parsedAge);
    setProfileField('weightLb', parsedWeight);
    onNext();
  }

  return (
    <SafeAreaView style={s.safeArea}>
      <BackButton onPress={onBack} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <StepHeading
            title="Let's build your baseline."
            sub="A few quick details help us calculate a daily target that makes sense for your body."
          />

          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Age</Text>
            <TextInput
              style={s.numericInput}
              keyboardType="number-pad"
              value={ageText}
              onChangeText={setAgeText}
              placeholder="—"
              placeholderTextColor={palette.inkMuted}
              returnKeyType="done"
              maxLength={3}
            />
          </View>

          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Sex</Text>
            <View style={s.chipRow}>
              {SEX_OPTIONS.map((opt) => (
                <Pressable
                  key={opt}
                  style={[s.chip, sex === opt && s.chipSelected]}
                  onPress={() => setProfileField('sex', opt as Sex)}
                >
                  <Text style={[s.chipText, sex === opt && s.chipTextSelected]}>
                    {sexLabels[opt]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Weight (lbs)</Text>
            <TextInput
              style={s.numericInput}
              keyboardType="decimal-pad"
              value={weightText}
              onChangeText={setWeightText}
              placeholder="—"
              placeholderTextColor={palette.inkMuted}
              returnKeyType="done"
              maxLength={6}
            />
          </View>

          <View style={s.ctaRow}>
            <PrimaryButton label="Next" onPress={handleNext} disabled={!canProceed} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Screen 3: Your day ───────────────────────────────────────────────────────

function YourDayScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { activityLevel, climate, setProfileField } = useProfileStore();
  const canProceed = activityLevel !== null && climate !== null;

  type CardInfo = { name: string; desc: string };
  const activityMeta: Record<ActivityLevel, CardInfo> = {
    low:    { name: 'Low',      desc: 'Mostly sitting, little exercise' },
    medium: { name: 'Moderate', desc: 'Some movement, light workouts'   },
    high:   { name: 'High',     desc: 'Active, intense exercise'         },
  };
  const climateMeta: Record<Climate, CardInfo> = {
    cool:     { name: 'Cool',     desc: 'Cold or mild weather'       },
    moderate: { name: 'Moderate', desc: 'Comfortable temperatures'   },
    hot:      { name: 'Hot',      desc: 'Warm, humid, or sunny'      },
  };

  return (
    <SafeAreaView style={s.safeArea}>
      <BackButton onPress={onBack} />
      <ScrollView contentContainerStyle={s.scrollContent}>
        <StepHeading
          title="How's your environment?"
          sub="Movement and climate change how much water you need."
        />

        <Text style={s.sectionLabel}>Activity level</Text>
        {ACTIVITY_LEVELS.map((opt) => (
          <Pressable
            key={opt}
            style={[s.selectCard, activityLevel === opt && s.selectCardActive]}
            onPress={() => setProfileField('activityLevel', opt as ActivityLevel)}
          >
            <Text style={[s.selectCardTitle, activityLevel === opt && s.selectCardTitleActive]}>
              {activityMeta[opt].name}
            </Text>
            <Text style={s.selectCardDesc}>{activityMeta[opt].desc}</Text>
          </Pressable>
        ))}

        <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>Climate</Text>
        {CLIMATE_OPTIONS.map((opt) => (
          <Pressable
            key={opt}
            style={[s.selectCard, climate === opt && s.selectCardActive]}
            onPress={() => setProfileField('climate', opt as Climate)}
          >
            <Text style={[s.selectCardTitle, climate === opt && s.selectCardTitleActive]}>
              {climateMeta[opt].name}
            </Text>
            <Text style={s.selectCardDesc}>{climateMeta[opt].desc}</Text>
          </Pressable>
        ))}

        <View style={s.ctaRow}>
          <PrimaryButton label="Next" onPress={onNext} disabled={!canProceed} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Screen 4: Your bottle ────────────────────────────────────────────────────

const BOTTLE_USER_NAMES: Record<BottleId, string> = {
  'sport-curve':   'Sport Curve',
  'block-tumbler': 'Block Tumbler',
};

function YourBottleScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { selectedBottleId, bottleColor, setProfileField } = useProfileStore();
  const canProceed = selectedBottleId !== null && bottleColor !== null;
  const displayColor = bottleColor ? BOTTLE_COLOR_HEX[bottleColor] : palette.inkMuted;

  return (
    <SafeAreaView style={s.safeArea}>
      <BackButton onPress={onBack} />
      <ScrollView contentContainerStyle={s.scrollContent}>
        <StepHeading title="Build your bottle." />

        {/* Hero bottle visual */}
        <View style={s.bottleHero}>
          {selectedBottleId === 'sport-curve' ? (
            <SportCurveBottle color={displayColor} scale={1.3} />
          ) : selectedBottleId === 'block-tumbler' ? (
            <BlockTumblerBottle color={displayColor} scale={1.3} />
          ) : (
            <View style={s.bottlePlaceholder}>
              <Text style={s.bottlePlaceholderText}>Pick a bottle{'\n'}below</Text>
            </View>
          )}
        </View>

        {/* Bottle family selector */}
        <View style={s.bottleFamilyRow}>
          {BOTTLE_IDS.map((id) => {
            const selected = selectedBottleId === id;
            return (
              <Pressable
                key={id}
                style={[s.bottleCard, selected && s.bottleCardSelected]}
                onPress={() => setProfileField('selectedBottleId', id as BottleId)}
              >
                <Text style={[s.bottleCardName, selected && s.bottleCardNameSelected]}>
                  {BOTTLE_USER_NAMES[id]}
                </Text>
                <Text style={s.bottleCardOz}>{BOTTLE_CAPACITIES[id]} oz</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Color swatches */}
        <Text style={s.sectionLabel}>Color</Text>
        <View style={s.swatchRow}>
          {BOTTLE_COLORS.map((c) => {
            const hex = BOTTLE_COLOR_HEX[c as BottleColor];
            const selected = bottleColor === c;
            return (
              <Pressable
                key={c}
                style={[s.swatch, { backgroundColor: hex }, selected && s.swatchSelected]}
                onPress={() => setProfileField('bottleColor', c as BottleColor)}
              />
            );
          })}
        </View>

        <View style={s.ctaRow}>
          <PrimaryButton label="Next" onPress={onNext} disabled={!canProceed} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Screen 5: Your setup is ready ───────────────────────────────────────────

function ReadyScreen({ onBack, onComplete }: { onBack: () => void; onComplete: () => void }) {
  const {
    age, sex, weightLb, activityLevel, climate,
    selectedBottleId, bottleColor,
    completeOnboarding,
  } = useProfileStore();

  // Preview only — not committed until CTA tap.
  const preview = calculateGoal({ weightLb, age, sex, activityLevel, climate });
  const displayColor = bottleColor ? BOTTLE_COLOR_HEX[bottleColor] : palette.support;

  function handleStart() {
    const ok = completeOnboarding();
    if (ok) onComplete();
  }

  return (
    <SafeAreaView style={s.safeArea}>
      <BackButton onPress={onBack} />
      <ScrollView contentContainerStyle={[s.scrollContent, s.readyScroll]}>
        <Text style={s.readyHeadline}>Your setup is ready</Text>

        <View style={s.readyBottleArea}>
          {selectedBottleId === 'sport-curve' ? (
            <SportCurveBottle color={displayColor} scale={1.4} />
          ) : (
            <BlockTumblerBottle color={displayColor} scale={1.4} />
          )}
        </View>

        <Text style={s.readyGoalOz}>{preview.dailyGoalOz} oz</Text>
        <Text style={s.readyGoalLabel}>daily goal</Text>

        <Text style={s.readySub}>
          Your custom hydration plan is locked in. Let's get to it.
        </Text>

        <View style={s.ctaRow}>
          <PrimaryButton label="Start logging" onPress={handleStart} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── OnboardingFlow (exported) ────────────────────────────────────────────────

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);

  return (
    <>
      {step === 1 && <WelcomeScreen onNext={() => setStep(2)} />}
      {step === 2 && <AboutYouScreen onNext={() => setStep(3)} onBack={() => setStep(1)} />}
      {step === 3 && <YourDayScreen onNext={() => setStep(4)} onBack={() => setStep(2)} />}
      {step === 4 && <YourBottleScreen onNext={() => setStep(5)} onBack={() => setStep(3)} />}
      {step === 5 && <ReadyScreen onBack={() => setStep(4)} onComplete={onComplete} />}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.bg,
  },

  // ── Welcome ──
  welcomeInner: {
    flex: 1,
    justifyContent: 'space-between',
  },
  welcomeHero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  emblemWrapper: { alignItems: 'center', marginBottom: spacing.lg },
  emblemCap: {
    width: 10,
    height: 8,
    backgroundColor: palette.accent,
    borderRadius: 3,
  },
  emblemNeck: {
    width: 16,
    height: 12,
    backgroundColor: palette.accent,
    borderRadius: 3,
    marginTop: 1,
  },
  emblemBody: {
    width: 38,
    height: 64,
    backgroundColor: palette.accent,
    borderRadius: 12,
    marginTop: 2,
  },
  welcomeHeadline: {
    fontFamily: fonts.heading,
    fontSize: fontSize.displayLg,
    fontWeight: '700',
    color: palette.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  welcomeSub: {
    fontSize: fontSize.body,
    color: palette.inkSoft,
    textAlign: 'center',
    lineHeight: 23,
    opacity: 0.85,
  },
  welcomeCTAArea: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },

  // ── Back button ──
  backBtn: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    alignSelf: 'flex-start',
  },
  backBtnText: {
    fontSize: fontSize.body,
    color: palette.inkSoft,
  },

  // ── Shared scroll layout ──
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // ── Step heading ──
  headingBlock: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  stepTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: palette.ink,
    marginBottom: spacing.sm,
  },
  stepSub: {
    fontSize: fontSize.body,
    color: palette.inkSoft,
    lineHeight: 22,
  },

  // ── Section label (small all-caps) ──
  sectionLabel: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: palette.inkMuted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },

  // ── About you: fields ──
  fieldGroup: { marginBottom: spacing.lg },
  fieldLabel: {
    fontSize: fontSize.small,
    color: palette.inkSoft,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  numericInput: {
    fontSize: fontSize.display,
    fontWeight: '300',
    color: palette.ink,
    borderBottomWidth: 1.5,
    borderBottomColor: palette.bgEdge,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },

  // ── About you: sex chips ──
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: palette.bgEdge,
    backgroundColor: palette.bgSoft,
  },
  chipSelected: {
    borderColor: palette.accent,
    backgroundColor: palette.accent,
  },
  chipText: { fontSize: fontSize.body, color: palette.ink },
  chipTextSelected: { color: palette.white, fontWeight: '600' },

  // ── Your day: select cards ──
  selectCard: {
    backgroundColor: palette.bgSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  selectCardActive: { borderColor: palette.accent },
  selectCardTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: palette.ink,
    marginBottom: 2,
  },
  selectCardTitleActive: { color: palette.accent },
  selectCardDesc: { fontSize: fontSize.small, color: palette.inkMuted },

  // ── Your bottle: hero area ──
  bottleHero: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
    paddingVertical: spacing.lg,
  },
  bottlePlaceholder: {
    width: 80,
    height: 160,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: palette.bgEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottlePlaceholderText: {
    fontSize: fontSize.small,
    color: palette.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Your bottle: family cards ──
  bottleFamilyRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  bottleCard: {
    flex: 1,
    backgroundColor: palette.bgSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  bottleCardSelected: { borderColor: palette.accent },
  bottleCardName: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: palette.ink,
    textAlign: 'center',
  },
  bottleCardNameSelected: { color: palette.accent },
  bottleCardOz: { fontSize: fontSize.small, color: palette.inkMuted, marginTop: 2 },

  // ── Your bottle: color swatches ──
  swatchRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.xl, marginTop: spacing.xs },
  swatch: { width: 40, height: 40, borderRadius: radius.pill },
  swatchSelected: { borderWidth: 3, borderColor: palette.ink },

  // ── Ready screen ──
  readyScroll: { alignItems: 'center' },
  readyHeadline: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: palette.ink,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  readyBottleArea: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  readyGoalOz: {
    fontFamily: fonts.heading,
    fontSize: fontSize.displayLg,
    fontWeight: '700',
    color: palette.ink,
    textAlign: 'center',
  },
  readyGoalLabel: {
    fontSize: fontSize.small,
    color: palette.inkSoft,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  readySub: {
    fontSize: fontSize.body,
    color: palette.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },

  // ── Primary CTA ──
  cta: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minWidth: 200,
    alignItems: 'center',
    alignSelf: 'center',
  },
  ctaDisabled: { backgroundColor: palette.bgEdge },
  ctaText: { color: palette.white, fontSize: fontSize.lg, fontWeight: '600' },
  ctaTextDisabled: { color: palette.inkMuted },
  ctaRow: { marginTop: spacing.xl },
});
