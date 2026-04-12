// HydroQuest — Day 4 home screen.
// First real logged-in screen. Replaces the inline MainPanel debug harness.
// Business logic is read from stores only — no logic lives here.
//
// Layout hierarchy (top → bottom):
//   SafeAreaView
//   ├── Top row          — streak (top-right, tertiary)
//   ├── Progress block   — intake display, %, remaining, pill bar  [centered]
//   ├── Bottle zone      — placeholder bottle  [flex: 1]
//   └── Interaction zone — quick-log pills, slider, CTA

import React, { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';

import {
  BOTTLE_CAPACITIES,
  QUICK_LOG_AMOUNTS,
  type BottleId,
} from '../constants';
import {
  BOTTLE_COLOR_HEX,
  fonts,
  fontSize,
  palette,
  radius,
  spacing,
} from '../constants/theme';
import { useHydrationStore } from '../store/useHydrationStore';
import { useProfileStore } from '../store/useProfileStore';
import { ProfileEditSheet } from './ProfileEditSheet';

// ─── Layout constant ──────────────────────────────────────────────────────────

// Fixed pixel height of the bottle body. The fill block grows from the bottom
// up to this height. Using a fixed value avoids onLayout complexity.
const BOTTLE_BODY_H = 200;

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export function HomeScreen() {
  // ── Store reads ────────────────────────────────────────────────────────────
  const todayIntakeOz = useHydrationStore((s) => s.todayIntakeOz);
  const draftLogOz    = useHydrationStore((s) => s.draftLogOz);
  const dailyGoalOz   = useHydrationStore((s) => s.dailyGoalOz);
  const streakCount   = useHydrationStore((s) => s.streakCount);
  const logWater      = useHydrationStore((s) => s.logWater);
  const setDraftLog   = useHydrationStore((s) => s.setDraftLog);

  const selectedBottleId = useProfileStore((s) => s.selectedBottleId);
  const bottleColor      = useProfileStore((s) => s.bottleColor);

  // ── Derived: progress ──────────────────────────────────────────────────────
  const goalPercent  = dailyGoalOz > 0 ? todayIntakeOz / dailyGoalOz : 0;
  const goalHit      = todayIntakeOz >= dailyGoalOz;
  const percentInt   = Math.min(Math.round(goalPercent * 100), 100);
  const remainingOz  = Math.max(0, dailyGoalOz - todayIntakeOz);

  // Single threshold color used for both the intake amount text and the
  // progress bar fill — matches the "spirit of gradient" direction.
  const progressColor =
    goalPercent >= 1   ? palette.accent  :
    goalPercent >= 0.5 ? palette.ink     :
                         palette.support;

  // ── Derived: bottle ────────────────────────────────────────────────────────
  // Treat null as sport-curve so the bottle always renders post-onboarding.
  const bottleType: BottleId   = selectedBottleId ?? 'sport-curve';
  const bottleCapacityOz       = BOTTLE_CAPACITIES[bottleType];
  const bottleFillPercent      = Math.min(draftLogOz / bottleCapacityOz, 1);
  const bottleColorHex         = bottleColor ? BOTTLE_COLOR_HEX[bottleColor] : palette.support;
  const fillH                  = BOTTLE_BODY_H * bottleFillPercent;

  // Bottle shape varies slightly by archetype.
  const isSportCurve = bottleType === 'sport-curve';
  const bodyWidth    = isSportCurve ? 76 : 96;
  const bodyRadius   = isSportCurve ? 30 : 14;
  // Cap: Sport Curve has a narrow rounded neck; Block Tumbler has a wide flat lid.
  const capWidth     = isSportCurve ? 26 : 88;
  const capHeight    = isSportCurve ? 26 : 16;
  const capRadius    = isSportCurve ? 4  : 6;

  // ── Flex values for the pill progress bar ──────────────────────────────────
  // Using flex rather than percentage strings avoids TypeScript DimensionValue issues.
  const barFill      = Math.min(goalPercent, 1);
  const barRemainder = Math.max(1 - goalPercent, 0);

  // ── CTA ────────────────────────────────────────────────────────────────────
  const ctaDisabled  = draftLogOz === 0;
  const ctaLabel     = ctaDisabled ? 'Choose an amount' : `Log ${draftLogOz} oz`;

  // ── Settings sheet visibility ──────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root}>

      {/* ── A. Top row: settings entry (left) + streak (right) ──────────────── */}
      <View style={styles.topRow}>
        <Pressable
          style={styles.settingsButton}
          onPress={() => setShowSettings(true)}
          hitSlop={8}
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
        <View style={styles.topRowSpacer} />
        <Text style={styles.streakText}>🔥 {streakCount}</Text>
      </View>

      {/* ── B. Progress block ───────────────────────────────────────────────── */}
      <View style={styles.progressBlock}>

        {/* Intake amount — large serif, threshold color on consumed part */}
        <Text style={styles.intakeLine}>
          <Text style={[styles.intakeLarge, { color: progressColor }]}>
            {todayIntakeOz} oz
          </Text>
          <Text style={styles.intakeGoalText}> / {dailyGoalOz} oz</Text>
        </Text>

        {/* Percentage line */}
        <Text style={styles.percentText}>{percentInt}% of your daily goal</Text>

        {/* Remaining / goal-reached line */}
        <Text style={styles.remainingText}>
          {goalHit ? 'Goal reached' : `${remainingOz} oz left`}
        </Text>

        {/* Pill progress bar — flex-based to avoid percentage string cast */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { flex: barFill, backgroundColor: progressColor }]} />
          <View style={{ flex: barRemainder }} />
        </View>

      </View>

      {/* ── C. Bottle zone ──────────────────────────────────────────────────── */}
      <View style={styles.bottleZone}>

        {/* Placeholder bottle */}
        <View style={styles.bottleWrapper}>

          {/* Cap / lid sits above the body */}
          <View
            style={[
              styles.bottleCap,
              {
                width: capWidth,
                height: capHeight,
                borderRadius: capRadius,
                backgroundColor: bottleColorHex,
              },
            ]}
          />

          {/* Body — overflow:hidden clips the fill to the body's border radius */}
          <View
            style={[
              styles.bottleBody,
              {
                width: bodyWidth,
                height: BOTTLE_BODY_H,
                borderRadius: bodyRadius,
              },
            ]}
          >
            {/* Fill rises from the bottom; only rendered when non-zero */}
            {fillH > 0 && (
              <View
                style={[
                  styles.bottleFill,
                  {
                    height: fillH,
                    backgroundColor: bottleColorHex,
                  },
                ]}
              />
            )}
          </View>

        </View>

      </View>

      {/* ── E. Profile edit sheet ───────────────────────────────────────────── */}
      <ProfileEditSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* ── D. Interaction zone ─────────────────────────────────────────────── */}
      <View style={styles.interactionZone}>

        {/* 1. Quick-log pills */}
        <View style={styles.quickLogRow}>
          {QUICK_LOG_AMOUNTS.map((oz) => (
            <Pressable
              key={oz}
              style={({ pressed }) => [
                styles.quickLogPill,
                pressed && styles.quickLogPillPressed,
              ]}
              onPress={() => logWater(oz)}
            >
              <Text style={styles.quickLogText}>{oz} oz</Text>
            </Pressable>
          ))}
        </View>

        {/* 2. Custom amount slider — range 0–40 oz, step 1 */}
        <View style={styles.sliderRow}>
          <Slider
            style={styles.slider}
            value={draftLogOz}
            onValueChange={(val) => setDraftLog(Math.round(val))}
            minimumValue={0}
            maximumValue={40}
            step={1}
            minimumTrackTintColor={palette.accent}
            maximumTrackTintColor={palette.bgEdge}
            thumbTintColor={palette.accent}
          />
        </View>

        {/* 3. Primary CTA */}
        <Pressable
          style={({ pressed }) => [
            styles.ctaButton,
            ctaDisabled
              ? styles.ctaButtonDisabled
              : pressed
              ? styles.ctaButtonPressed
              : null,
          ]}
          onPress={ctaDisabled ? undefined : () => logWater(draftLogOz)}
          disabled={ctaDisabled}
        >
          <Text style={[styles.ctaText, ctaDisabled && styles.ctaTextDisabled]}>
            {ctaLabel}
          </Text>
        </Pressable>

      </View>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
  },

  // ── Top row ──────────────────────────────────────────────────────────────────
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  topRowSpacer: {
    flex: 1,
  },
  settingsButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -spacing.xs,
  },
  settingsIcon: {
    fontSize: 20,
    color: palette.inkSoft,
  },
  streakText: {
    fontSize: fontSize.body,
    color: palette.inkSoft,
    fontWeight: '500',
  },

  // ── Progress block ────────────────────────────────────────────────────────────
  progressBlock: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  intakeLine: {
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  intakeLarge: {
    fontFamily: fonts.heading,
    fontSize: fontSize.displayLg,
    fontWeight: '700',
  },
  intakeGoalText: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    color: palette.inkSoft,
    fontWeight: '400',
  },
  percentText: {
    fontSize: fontSize.small,
    color: palette.inkSoft,
    marginBottom: 2,
    textAlign: 'center',
  },
  remainingText: {
    fontSize: fontSize.small,
    color: palette.inkMuted,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  // Pill progress bar — flexDirection row so fill/remainder use flex proportions.
  // alignSelf: 'stretch' ensures the bar spans the full padded content width
  // even though the parent has alignItems: 'center'.
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.bgEdge,
    overflow: 'hidden',
    flexDirection: 'row',
    alignSelf: 'stretch',
  },
  progressFill: {
    height: 6,
    // flex + backgroundColor injected inline
  },

  // ── Bottle zone ───────────────────────────────────────────────────────────────
  bottleZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  bottleWrapper: {
    alignItems: 'center',
  },
  bottleCap: {
    // width, height, borderRadius, backgroundColor injected inline
    opacity: 0.9,
  },
  bottleBody: {
    // width, height, borderRadius injected inline
    backgroundColor: palette.white,
    borderWidth: 1.5,
    borderColor: palette.bgEdge,
    marginTop: 2,
    overflow: 'hidden',
  },
  bottleFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // height + backgroundColor injected inline
    opacity: 0.75,
  },

  // ── Interaction zone ──────────────────────────────────────────────────────────
  interactionZone: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },

  // ── Quick-log pills ───────────────────────────────────────────────────────────
  quickLogRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickLogPill: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: palette.bgSoft,
    borderWidth: 1.5,
    borderColor: palette.bgEdge,
    alignItems: 'center',
  },
  quickLogPillPressed: {
    backgroundColor: palette.bgEdge,
    borderColor: palette.support,
  },
  quickLogText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: palette.ink,
  },

  // ── Slider ────────────────────────────────────────────────────────────────────
  sliderRow: {
    paddingHorizontal: 0,
  },
  slider: {
    width: '100%',
    height: 40,
  },

  // ── Primary CTA ───────────────────────────────────────────────────────────────
  ctaButton: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaButtonDisabled: {
    backgroundColor: palette.bgEdge,
  },
  ctaButtonPressed: {
    backgroundColor: palette.accentPressed,
  },
  ctaText: {
    color: palette.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  ctaTextDisabled: {
    color: palette.inkMuted,
  },
});
