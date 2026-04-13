// HydroQuest — Day 9 home screen.
// Reverse-fill mechanic: the bottle represents how much water is LEFT.
// The slider sets a draft remaining level; the CTA logs consumed = committed - draft.
// Refill resets the digital bottle to full without adding to intake.
//
// Layout hierarchy (top → bottom):
//   SafeAreaView
//   ├── Top row          — streak (top-right, tertiary)
//   ├── Progress block   — intake display, %, remaining, pill bar  [centered]
//   ├── Bottle zone      — bottle visual  [flex: 1]
//   └── Interaction zone — slider (LEFT IN BOTTLE), CTA, refill, undo

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

// ─── Layout constant ──────────────────────────────────────────────────────────

// Fixed pixel height of the bottle body. The fill block grows from the bottom
// up to this height. Using a fixed value avoids onLayout complexity.
const BOTTLE_BODY_H = 200;

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
  const ctaLabel     = ctaDisabled ? 'Lower the bottle level to log' : `Log ${consumedOz} oz`;

  // ── Refill button state ───────────────────────────────────────────────────
  // Disabled when the bottle is already full. committedBottleLevelOz resolves
  // null → full, so this also handles the first-launch / migrated-install case.
  const refillDisabled = committedBottleLevelOz >= bottleCapacityOz;

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

      {/* ── B. Progress block ───────────────────────────────────────────────── */}
      <View style={styles.progressBlock}>

        <Text style={styles.intakeLine}>
          <Text style={[styles.intakeLarge, { color: progressColor }]}>
            {todayIntakeOz} oz
          </Text>
          <Text style={styles.intakeGoalText}> / {dailyGoalOz} oz</Text>
        </Text>

        <Text style={styles.percentText}>{percentInt}% of your daily goal</Text>

        <Text style={styles.remainingText}>
          {goalHit ? 'Goal reached' : `${remainingOz} oz left`}
        </Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { flex: barFill, backgroundColor: progressColor }]} />
          <View style={{ flex: barRemainder }} />
        </View>

      </View>

      {/* ── Coach card ──────────────────────────────────────────────────────── */}
      <CoachCard message={coachMessage} />

      {/* ── C. Bottle zone ──────────────────────────────────────────────────── */}
      <View style={styles.bottleZone}>

        <View style={styles.bottleWrapper}>

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

      </View>

      {/* ── E. Profile edit sheet ───────────────────────────────────────────── */}
      <ProfileEditSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* ── D. Interaction zone ─────────────────────────────────────────────── */}
      <View style={styles.interactionZone}>

        {/* 1. Slider — sets draft remaining bottle level */}
        <View style={styles.labeledGroup}>
          <Text style={[styles.eyebrowLabel, { marginBottom: 7 }]}>LEFT IN BOTTLE</Text>
          <View style={styles.sliderRow}>
            <Slider
              style={styles.slider}
              value={draftBottleLevelOz}
              onSlidingStart={(val) => {
                sliderBucketRef.current = Math.floor(Math.round(val) / 4);
              }}
              onValueChange={(val) => {
                const rounded = Math.round(val);
                setDraftBottleLevelOz(rounded);
                const bucket = Math.floor(rounded / 4);
                if (bucket !== sliderBucketRef.current) {
                  sliderBucketRef.current = bucket;
                  Haptics.selectionAsync();
                }
              }}
              minimumValue={0}
              maximumValue={bottleCapacityOz}
              step={1}
              minimumTrackTintColor={palette.accent}
              maximumTrackTintColor={palette.bgEdge}
              thumbTintColor={palette.accent}
            />
          </View>
        </View>

        {/* 2. Primary CTA — logs consumed = committed - draft */}
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

        {/* 3. Refill button — resets digital bottle to full, no intake change */}
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

        {/* 4. Undo affordance — bare text link, visible only when an action is undoable */}
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

  // ── Interaction zone ──────────────────────────────────────────────────────────
  interactionZone: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
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

  // ── Labeled interaction groups ─────────────────────────────────────────────
  labeledGroup: {
    gap: spacing.xs,
  },
  eyebrowLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: palette.support,
    textAlign: 'center',
    opacity: 0.85,
  },
});
