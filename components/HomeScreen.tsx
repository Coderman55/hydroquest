// HydroQuest — Day 9 home screen.
// Reverse-fill mechanic: the bottle represents how much water is LEFT.
// The vertical ruler sidecar sets a draft remaining level; the CTA logs
// consumed = committed - draft.
// Refill resets the digital bottle to full without adding to intake.
//
// Layout hierarchy (top → bottom):
//   SafeAreaView
//   ├── Top row          — settings (left) + streak (right)
//   ├── Progress block   — intake display, %, remaining, pill bar  [no bg]
//   ├── Coach card       — contextual nudge, separated by thin divider
//   ├── Bottle workspace — bottle visual + vertical ruler sidecar  [flex: 1]
//   └── Interaction zone — CTA, refill, undo
//
// Ruler model:
//   • Visual track spans 0 → bottleCapacityOz (full height always)
//   • Thumb position = draftBottleLevelOz / bottleCapacityOz  → mirrors bottle fill
//   • Interaction clamped in onValueChange: draft cannot exceed committedBottleLevelOz

import React, { useEffect, useRef, useState } from 'react';
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
import { CoachCard } from './CoachCard';
import * as Haptics from 'expo-haptics';

// ─── Layout constants ─────────────────────────────────────────────────────────

// Fixed pixel height of the bottle body. Fill block grows from the bottom up.
const BOTTLE_BODY_H = 200;

// Width of the vertical ruler container. The Slider element is wider (= BOTTLE_BODY_H)
// and rotated -90° so it renders vertically within this container.
const RULER_W = 44;

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export function HomeScreen() {
  // ── Store reads ────────────────────────────────────────────────────────────
  const todayIntakeOz   = useHydrationStore((s) => s.todayIntakeOz);
  const bottleLevelOz   = useHydrationStore((s) => s.bottleLevelOz);
  const dailyGoalOz     = useHydrationStore((s) => s.dailyGoalOz);
  const streakCount     = useHydrationStore((s) => s.streakCount);
  const lastAction      = useHydrationStore((s) => s.lastAction);
  const logWater        = useHydrationStore((s) => s.logWater);
  const setBottleLevel  = useHydrationStore((s) => s.setBottleLevel);
  const refillBottle    = useHydrationStore((s) => s.refillBottle);
  const undoLastAction  = useHydrationStore((s) => s.undoLastAction);

  const selectedBottleId = useProfileStore((s) => s.selectedBottleId);
  const bottleColor      = useProfileStore((s) => s.bottleColor);
  const climate          = useProfileStore((s) => s.climate);
  const activityLevel    = useProfileStore((s) => s.activityLevel);

  // ── Derived: progress ──────────────────────────────────────────────────────
  const goalPercent  = dailyGoalOz > 0 ? todayIntakeOz / dailyGoalOz : 0;
  const goalHit      = todayIntakeOz >= dailyGoalOz;
  const percentInt   = Math.min(Math.round(goalPercent * 100), 100);
  const remainingOz  = Math.max(0, dailyGoalOz - todayIntakeOz);

  const progressColor =
    goalPercent >= 1   ? palette.accent  :
    goalPercent >= 0.5 ? palette.ink     :
                         palette.support;

  // ── Derived: bottle ────────────────────────────────────────────────────────
  // Treat null as sport-curve so the bottle always renders post-onboarding.
  const bottleType: BottleId = selectedBottleId ?? 'sport-curve';
  const bottleCapacityOz     = BOTTLE_CAPACITIES[bottleType];
  const bottleColorHex       = bottleColor ? BOTTLE_COLOR_HEX[bottleColor] : palette.support;

  // Clamp committed level to current capacity — guards against persisted levels
  // that exceed capacity if the user changes bottle archetype after persistence.
  // null = treat as full (first launch / migrated installs).
  const committedBottleLevelOz = Math.min(
    bottleLevelOz ?? bottleCapacityOz,
    bottleCapacityOz,
  );

  // Bottle shape varies slightly by archetype.
  const isSportCurve = bottleType === 'sport-curve';
  const bodyWidth    = isSportCurve ? 76 : 96;
  const bodyRadius   = isSportCurve ? 30 : 14;
  const capWidth     = isSportCurve ? 26 : 88;
  const capHeight    = isSportCurve ? 26 : 16;
  const capRadius    = isSportCurve ? 4  : 6;

  // ── Flex values for the pill progress bar ──────────────────────────────────
  const barFill      = Math.min(goalPercent, 1);
  const barRemainder = Math.max(1 - goalPercent, 0);

  // ── Settings sheet visibility ──────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);

  // ── Slider haptic bucket guard ─────────────────────────────────────────────
  // Seeded on drag start so a touch at a bucket boundary doesn't fire a haptic.
  const sliderBucketRef = useRef<number>(-1);

  // ── Draft bottle level (local UI state) ───────────────────────────────────
  // Represents the bottle level the user is dragging toward before confirming.
  // Not stored globally — it's transient UI state that only commits on CTA press.
  const [draftBottleLevelOz, setDraftBottleLevelOz] = useState<number>(committedBottleLevelOz);

  // Sync draft to committed level whenever committed level or capacity changes.
  // This keeps draft in a known-good state after: successful log, undo, refill,
  // restart/rehydration, or bottle archetype change in settings.
  useEffect(() => {
    setDraftBottleLevelOz(committedBottleLevelOz);
  }, [committedBottleLevelOz]);

  // ── Bottle fill visual ────────────────────────────────────────────────────
  // Bottle previews the draft remaining level so the user sees the effect
  // of their slider position before confirming.
  const bottleFillPercent = Math.min(draftBottleLevelOz / bottleCapacityOz, 1);
  const fillH             = BOTTLE_BODY_H * bottleFillPercent;

  // ── CTA state ─────────────────────────────────────────────────────────────
  // consumedOz is the amount that would be logged on CTA press.
  // Positive = user dragged down (drink). Zero or negative = no drink to log.
  const consumedOz   = committedBottleLevelOz - draftBottleLevelOz;
  const ctaDisabled  = consumedOz <= 0;
  const ctaLabel     = ctaDisabled ? 'Lower to log a drink' : `Log ${consumedOz} oz`;

  // ── Refill button state ───────────────────────────────────────────────────
  // Disabled when the bottle is already full. committedBottleLevelOz resolves
  // null → full, so this also handles the first-launch / migrated-install case.
  const refillDisabled = committedBottleLevelOz >= bottleCapacityOz;

  // ── Ruler: visual scale and interaction clamp ─────────────────────────────
  // The slider's maximumValue is always bottleCapacityOz so the thumb position
  // maps identically to draftBottleLevelOz / bottleCapacityOz — the same ratio
  // the bottle fill uses. Upward clamping is enforced in onValueChange, not by
  // collapsing the slider range (which caused the prior visual mismatch).
  const sliderDisabled = committedBottleLevelOz <= 0;

  // ── Ruler: quarter-mark y positions ──────────────────────────────────────
  // Marks at 1/4, 1/2, 3/4 of track height from top.
  // top = full capacity, bottom = 0 (mirrors the bottle fill direction).
  const markTopAt = (fraction: number) => BOTTLE_BODY_H * fraction - 2;

  // ── Coach message ──────────────────────────────────────────────────────────
  // Deterministic. First matching rule wins. No randomness, no async, no store writes.
  const hour = new Date().getHours();

  const timeBucket: 'morning' | 'midday' | 'afternoon' | 'evening' =
    hour < 11 ? 'morning'   :
    hour < 14 ? 'midday'    :
    hour < 18 ? 'afternoon' :
                'evening';

  const expectedProgress =
    timeBucket === 'morning'   ? 0.15 :
    timeBucket === 'midday'    ? 0.35 :
    timeBucket === 'afternoon' ? 0.60 :
                                 0.80;

  const paceBucket: 'ahead' | 'onTrack' | 'behind' =
    goalPercent >= expectedProgress + 0.10 ? 'ahead'  :
    goalPercent <  expectedProgress - 0.10 ? 'behind' :
                                             'onTrack';

  const isClose           = remainingOz <= bottleCapacityOz;
  const isVeryClose       = remainingOz <= bottleCapacityOz * 0.5;
  const isNearBottleRange = remainingOz <= bottleCapacityOz * 1.5;

  let coachMessage: string;

  if (goalHit) {
    coachMessage =
      streakCount >= 2
        ? 'All set for today. Streak secured.'
        : 'Goal complete. Great work today!';

  } else if (isClose) {
    if (isVeryClose) {
      coachMessage = 'Home stretch. Just a few sips left to hit your goal.';
    } else if (remainingOz === bottleCapacityOz) {
      coachMessage = 'Almost there. About one bottle to go.';
    } else {
      coachMessage = 'Almost there. Less than one bottle to go.';
    }

  } else if (todayIntakeOz === 0 && timeBucket === 'morning') {
    coachMessage = "Good morning! Let's get that first sip.";

  } else if (timeBucket === 'afternoon' && paceBucket === 'behind') {
    if (climate === 'hot' && activityLevel !== 'low') {
      coachMessage = "Warm afternoon out there. Let's close the gap.";
    } else if (climate === 'hot') {
      coachMessage = "Warm afternoon out there. Let's close the gap.";
    } else if (activityLevel !== 'low') {
      coachMessage = 'Afternoon slump? A quick refill keeps the momentum.';
    } else {
      coachMessage = 'Afternoon slump? A quick refill keeps the momentum.';
    }

  } else if (timeBucket === 'evening' && paceBucket === 'behind') {
    coachMessage =
      isVeryClose
        ? 'Almost done for the day. Just a glass or two left.'
        : "Winding down? Let's top off that goal before bed.";

  } else if (paceBucket === 'onTrack' || paceBucket === 'ahead') {
    coachMessage =
      paceBucket === 'ahead'
        ? 'Great momentum today. Sip at your leisure.'
        : 'Pacing perfectly. Keep it up.';

  } else {
    if (isNearBottleRange && remainingOz > bottleCapacityOz) {
      coachMessage = "About one refill left. You're in a good spot.";
    } else if (isNearBottleRange) {
      coachMessage = 'Finish line in sight. Keep sipping.';
    } else {
      coachMessage = 'Small, steady sips make the rest easy.';
    }
  }

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
        {streakCount > 0 && (
          <Text style={styles.streakText}>🔥 {streakCount}</Text>
        )}
      </View>

      {/* ── B. Progress block — flat, no card background ───────────────────── */}
      <View style={styles.progressBlock}>

        <Text style={styles.intakeLine}>
          <Text style={[styles.intakeLarge, { color: progressColor }]}>
            {todayIntakeOz} oz
          </Text>
          <Text style={styles.intakeGoalText}> / {dailyGoalOz} oz</Text>
        </Text>

        <Text style={styles.percentText}>{percentInt}% of your daily goal</Text>

        <Text style={styles.remainingText}>
          {goalHit ? 'Goal reached' : `${remainingOz} oz to go`}
        </Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { flex: barFill, backgroundColor: progressColor }]} />
          <View style={{ flex: barRemainder }} />
        </View>

      </View>

      {/* Thin divider — separates today stats from coach nudge */}
      <View style={styles.sectionDivider} />

      {/* ── Coach card ──────────────────────────────────────────────────────── */}
      <CoachCard message={coachMessage} />

      {/* ── C. Bottle workspace — bottle hero + vertical ruler sidecar ─────── */}
      <View style={styles.bottleWorkspace}>

        {/* Bottle column */}
        <View style={styles.bottleColumn}>
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

        {/* Gap between bottle and ruler */}
        <View style={styles.rulerGap} />

        {/* Vertical ruler sidecar — aligned with bottle body (offset by cap) */}
        <View style={[styles.rulerSidecar, { marginTop: capHeight + 2 }]}>

          {/* Track area: rotated slider + quarter marks */}
          <View style={styles.rulerArea}>

            {/* Slider container: RULER_W × BOTTLE_BODY_H.
                The Slider element is BOTTLE_BODY_H × RULER_W in layout space,
                rotated -90° so it renders as a vertical track:
                  top    = maximumValue (bottleCapacityOz — always full height)
                  bottom = minimumValue (0)
                Thumb position = draftBottleLevelOz / bottleCapacityOz, matching
                the bottle fill exactly.
                Upward clamp: onValueChange caps draft at committedBottleLevelOz,
                so the user cannot drag above their current committed level. */}
            <View style={styles.rulerSliderContainer}>
              <Slider
                style={styles.verticalSlider}
                value={draftBottleLevelOz}
                onSlidingStart={(val) => {
                  sliderBucketRef.current = Math.floor(Math.round(val) / 4);
                }}
                onValueChange={(val) => {
                  // Clamp upward at committed level — this is the core interaction bound.
                  const clamped = Math.min(Math.round(val), committedBottleLevelOz);
                  setDraftBottleLevelOz(clamped);
                  const bucket = Math.floor(clamped / 4);
                  if (bucket !== sliderBucketRef.current) {
                    sliderBucketRef.current = bucket;
                    Haptics.selectionAsync();
                  }
                }}
                minimumValue={0}
                maximumValue={bottleCapacityOz}
                step={1}
                disabled={sliderDisabled}
                minimumTrackTintColor={bottleColorHex}
                maximumTrackTintColor={palette.bgEdge}
                thumbTintColor={palette.accent}
              />
            </View>

            {/* Quarter marks — sparse dots at 3/4, 1/2, 1/4 of track height */}
            <View style={styles.rulerMarksColumn}>
              <View style={[styles.rulerMark, { top: markTopAt(0.25) }]} />
              <View style={[styles.rulerMark, { top: markTopAt(0.50) }]} />
              <View style={[styles.rulerMark, { top: markTopAt(0.75) }]} />
            </View>

          </View>

          {/* Live draft label — anchored below the track, clearly part of the ruler */}
          <Text style={styles.ozLeftLabel}>
            {draftBottleLevelOz} oz left
          </Text>

        </View>

      </View>

      {/* ── E. Profile edit sheet ───────────────────────────────────────────── */}
      <ProfileEditSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* ── D. Interaction zone ─────────────────────────────────────────────── */}
      <View style={styles.interactionZone}>

        {/* 1. Primary CTA — logs consumed = committed - draft */}
        <Pressable
          style={({ pressed }) => [
            styles.ctaButton,
            ctaDisabled
              ? styles.ctaButtonDisabled
              : pressed
              ? styles.ctaButtonPressed
              : null,
          ]}
          onPress={ctaDisabled ? undefined : () => {
            const consumed = committedBottleLevelOz - draftBottleLevelOz;
            if (consumed <= 0) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            logWater(consumed);
            setBottleLevel(draftBottleLevelOz);
          }}
          disabled={ctaDisabled}
        >
          <Text style={[styles.ctaText, ctaDisabled && styles.ctaTextDisabled]}>
            {ctaLabel}
          </Text>
        </Pressable>

        {/* 2. Refill button — resets digital bottle to full, no intake change */}
        <Pressable
          style={({ pressed }) => [
            styles.refillButton,
            refillDisabled
              ? styles.refillButtonDisabled
              : pressed
              ? styles.refillButtonPressed
              : null,
          ]}
          onPress={refillDisabled ? undefined : () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            refillBottle(bottleCapacityOz);
          }}
          disabled={refillDisabled}
        >
          <Text style={[styles.refillText, refillDisabled && styles.refillTextDisabled]}>
            Refill bottle
          </Text>
        </Pressable>

        {/* 3. Undo affordance — bare text link, visible only when an action is undoable */}
        {lastAction !== null && (
          <Pressable
            style={styles.undoLink}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              undoLastAction();
            }}
            hitSlop={8}
          >
            <Text style={styles.undoLinkText}>
              {lastAction.type === 'drink'
                ? `Undo last drink (${lastAction.consumedOz} oz)`
                : 'Undo refill'}
            </Text>
          </Pressable>
        )}

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

  // ── Progress block — flat, editorial, no background card ────────────────────
  progressBlock: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: palette.bgEdge,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xs,
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
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.bgEdge,
    overflow: 'hidden',
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: 6,
  },

  // ── Bottle workspace — horizontal row: bottle + ruler sidecar ────────────────
  bottleWorkspace: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bottleColumn: {
    alignItems: 'center',
  },
  bottleCap: {
    opacity: 0.9,
  },
  bottleBody: {
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
    opacity: 0.75,
  },
  // ── Ruler sidecar ─────────────────────────────────────────────────────────────
  rulerGap: {
    width: 20,
  },
  rulerSidecar: {
    alignItems: 'center',
  },
  rulerArea: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    height: BOTTLE_BODY_H,
  },

  // Slider is BOTTLE_BODY_H × 44 in layout space, positioned so its center
  // coincides with the center of the RULER_W × BOTTLE_BODY_H container,
  // then rotated -90° to render vertically:
  //   top  → max value (committedBottleLevelOz)
  //   bottom → min value (0)
  rulerSliderContainer: {
    width: RULER_W,
    height: BOTTLE_BODY_H,
    overflow: 'visible',
  },
  verticalSlider: {
    position: 'absolute',
    width: BOTTLE_BODY_H,
    height: RULER_W,
    left: (RULER_W - BOTTLE_BODY_H) / 2,   // = -78
    top: (BOTTLE_BODY_H - RULER_W) / 2,    // = 78
    transform: [{ rotate: '-90deg' }],
  },

  // Live draft label anchored directly below the track
  ozLeftLabel: {
    marginTop: spacing.sm,
    fontSize: fontSize.small,
    color: palette.inkSoft,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Quarter-mark dots beside the slider track
  rulerMarksColumn: {
    width: 6,
    height: BOTTLE_BODY_H,
    position: 'relative',
    marginLeft: 4,
  },
  rulerMark: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.inkMuted,
    left: 0,
    opacity: 0.5,
  },

  // ── Interaction zone ──────────────────────────────────────────────────────────
  interactionZone: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
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

  // ── Refill button — secondary, ghost-style, clearly below CTA in hierarchy ────
  refillButton: {
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: palette.bgEdge,
    backgroundColor: palette.bgSoft,
  },
  refillButtonDisabled: {
    opacity: 0.4,
  },
  refillButtonPressed: {
    backgroundColor: palette.bgEdge,
  },
  refillText: {
    color: palette.inkSoft,
    fontSize: fontSize.body,
    fontWeight: '500',
  },
  refillTextDisabled: {
    color: palette.inkMuted,
  },

  // ── Undo link ─────────────────────────────────────────────────────────────────
  undoLink: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: -spacing.xs,
  },
  undoLinkText: {
    fontSize: fontSize.body,
    fontWeight: '500',
    color: palette.support,
  },
});
