// HydroQuest — Post-onboarding profile edit sheet.
// Slides up as a native pageSheet (iOS) over the HomeScreen.
// Editable fields: climate, activity level, bottle archetype, bottle color.
// Uses local draft state; only commits to the store on Save.
// Cancel / swipe-down dismisses without writing.

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import * as Location from 'expo-location';

import {
  isHealthKitAvailable,
  requestHealthKitAuthorization,
} from '../lib/healthKit';
import { isWeatherKitAvailable } from '../lib/weatherKit';

import {
  ACTIVITY_LEVELS,
  BOTTLE_COLORS,
  BOTTLE_IDS,
  CLIMATE_OPTIONS,
  type ActivityLevel,
  type BottleColor,
  type BottleId,
  type Climate,
} from '../constants';

import {
  BOTTLE_COLOR_HEX,
  fontSize,
  fonts,
  palette,
  radius,
  spacing,
} from '../constants/theme';
import { useProfileStore } from '../store/useProfileStore';

// ─── Human-readable labels ────────────────────────────────────────────────────

const CLIMATE_LABELS: Record<Climate, string> = {
  cool:     'Cool',
  moderate: 'Moderate',
  hot:      'Hot',
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  low:    'Low',
  medium: 'Medium',
  high:   'High',
};

const BOTTLE_LABELS: Record<BottleId, string> = {
  'sport-curve':   'Sport Curve',
  'block-tumbler': 'Block Tumbler',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
  /**
   * Detected climate bucket from the current session's weather fetch.
   * Passed in from HomeScreen so ProfileEditSheet never imports the weather hook.
   * Undefined when weather is disabled or unavailable.
   */
  detectedClimate?: Climate;
};

// ─── ProfileEditSheet ─────────────────────────────────────────────────────────

export function ProfileEditSheet({ visible, onClose, detectedClimate }: Props) {
  // ── Store reads ────────────────────────────────────────────────────────────
  const storeClimate     = useProfileStore((s) => s.climate);
  const storeActivity    = useProfileStore((s) => s.activityLevel);
  const storeBottleId    = useProfileStore((s) => s.selectedBottleId);
  const storeBottleColor = useProfileStore((s) => s.bottleColor);

  const storeHealthKitEnabled     = useProfileStore((s) => s.healthKitEnabled);
  const storeWeatherContextEnabled = useProfileStore((s) => s.weatherContextEnabled);

  // ── Store actions ──────────────────────────────────────────────────────────
  const setClimate                 = useProfileStore((s) => s.setClimate);
  const setActivityLevel           = useProfileStore((s) => s.setActivityLevel);
  const setProfileField            = useProfileStore((s) => s.setProfileField);
  const setHealthKitEnabled        = useProfileStore((s) => s.setHealthKitEnabled);
  const setWeatherContextEnabled   = useProfileStore((s) => s.setWeatherContextEnabled);

  // ── Local draft state ──────────────────────────────────────────────────────
  // Initialised with reasonable fallbacks; overwritten by the useEffect below
  // each time the sheet opens so the user always sees their current values.
  const [draftClimate,  setDraftClimate]  = useState<Climate>(storeClimate ?? 'moderate');
  const [draftActivity, setDraftActivity] = useState<ActivityLevel>(storeActivity ?? 'medium');
  const [draftBottleId, setDraftBottleId] = useState<BottleId>(storeBottleId ?? 'sport-curve');
  const [draftColor,    setDraftColor]    = useState<BottleColor>(storeBottleColor ?? 'blue');

  // Sync draft from store each time the sheet becomes visible.
  useEffect(() => {
    if (visible) {
      setDraftClimate(storeClimate ?? 'moderate');
      setDraftActivity(storeActivity ?? 'medium');
      setDraftBottleId(storeBottleId ?? 'sport-curve');
      setDraftColor(storeBottleColor ?? 'blue');
    }
  }, [visible, storeClimate, storeActivity, storeBottleId, storeBottleColor]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = () => {
    // Bottle fields first — no goal side-effects, always safe to write.
    setProfileField('selectedBottleId', draftBottleId);
    setProfileField('bottleColor', draftColor);

    // Goal-affecting fields: only write if the user changed the value.
    // Each call triggers an immediate goal recomputation via the store.
    // setClimate runs before setActivityLevel so that when setActivityLevel
    // reads `prev.climate`, it already sees the updated climate value.
    if (draftClimate  !== storeClimate)  setClimate(draftClimate);
    if (draftActivity !== storeActivity) setActivityLevel(draftActivity);

    onClose();
  };

  // ── Apple Health toggle ────────────────────────────────────────────────────
  // Bypasses draft state — writes directly to the store because permission
  // flow must resolve before the preference can be persisted.
  const handleHealthKitToggle = async (value: boolean) => {
    if (!value) {
      setHealthKitEnabled(false);
      return;
    }
    if (!isHealthKitAvailable()) {
      Alert.alert(
        'Not Available',
        'Apple Health is not available on this device.',
      );
      return;
    }
    const granted = await requestHealthKitAuthorization();
    if (granted) {
      setHealthKitEnabled(true);
    } else {
      Alert.alert(
        'Permission Required',
        'To enable Apple Health sync, go to Settings › Health › HydroQuest and allow access.',
      );
    }
  };

  // ── Local weather context toggle ───────────────────────────────────────────
  // Bypasses draft state — same pattern as HealthKit.
  // Requests foreground location permission here; preference persisted only on grant.
  // Does not re-prompt if permission is already denied — user must go to Settings.
  const handleWeatherToggle = async (value: boolean) => {
    if (!value) {
      setWeatherContextEnabled(false);
      return;
    }
    if (!isWeatherKitAvailable()) {
      // Should not be reachable since the section is iOS-only, but guard anyway.
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === Location.PermissionStatus.GRANTED) {
      setWeatherContextEnabled(true);
    } else {
      Alert.alert(
        'Location Access Required',
        'To enable local weather context, go to Settings › Privacy & Security › Location Services › HydroQuest and allow access while using the app.',
      );
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.root}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.title}>Edit Profile</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.closeLabel}>✕</Text>
          </Pressable>
        </View>

        {/* ── Fields ────────────────────────────────────────────────────────── */}
        <View style={styles.body}>

          {/* Climate */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Climate</Text>
            <View style={styles.chipRow}>
              {CLIMATE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.chip, draftClimate === opt && styles.chipActive]}
                  onPress={() => setDraftClimate(opt)}
                >
                  <Text style={[styles.chipText, draftClimate === opt && styles.chipTextActive]}>
                    {CLIMATE_LABELS[opt]}
                  </Text>
                </Pressable>
              ))}
            </View>
            {/* Weather hint — shown only when detected climate differs from draft.
                Tapping Update sets draft only; user must still Save explicitly. */}
            {detectedClimate != null && detectedClimate !== draftClimate && (
              <View style={styles.weatherHintRow}>
                <Text style={styles.weatherHintText}>
                  Weather suggests: {CLIMATE_LABELS[detectedClimate]}
                </Text>
                <Pressable
                  onPress={() => setDraftClimate(detectedClimate)}
                  hitSlop={8}
                >
                  <Text style={styles.weatherHintUpdate}>Update</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Activity Level */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Activity Level</Text>
            <View style={styles.chipRow}>
              {ACTIVITY_LEVELS.map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.chip, draftActivity === opt && styles.chipActive]}
                  onPress={() => setDraftActivity(opt)}
                >
                  <Text style={[styles.chipText, draftActivity === opt && styles.chipTextActive]}>
                    {ACTIVITY_LABELS[opt]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Bottle Archetype */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Bottle</Text>
            <View style={styles.chipRow}>
              {BOTTLE_IDS.map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.chip, draftBottleId === opt && styles.chipActive]}
                  onPress={() => setDraftBottleId(opt)}
                >
                  <Text style={[styles.chipText, draftBottleId === opt && styles.chipTextActive]}>
                    {BOTTLE_LABELS[opt]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Bottle Color */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Bottle Color</Text>
            <View style={styles.swatchRow}>
              {BOTTLE_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => setDraftColor(color)}
                  style={[
                    styles.swatch,
                    { backgroundColor: BOTTLE_COLOR_HEX[color] },
                    draftColor === color && styles.swatchActive,
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Apple Health — iOS only */}
          {Platform.OS === 'ios' && (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Apple Health</Text>
              <View style={styles.healthKitRow}>
                <View style={styles.healthKitTextBlock}>
                  <Text style={styles.healthKitSubtitle}>
                    Write water intake to Apple Health
                  </Text>
                </View>
                <Switch
                  value={storeHealthKitEnabled}
                  onValueChange={handleHealthKitToggle}
                  trackColor={{ false: palette.bgEdge, true: palette.accent }}
                  thumbColor={palette.white}
                />
              </View>
            </View>
          )}

          {/* Local Weather — iOS only.
              Enabling requests foreground location permission.
              Preference is only persisted if permission is granted.
              Does not automatically change climate or recompute goal. */}
          {Platform.OS === 'ios' && (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Local Weather</Text>
              <View style={styles.healthKitRow}>
                <View style={styles.healthKitTextBlock}>
                  <Text style={styles.healthKitSubtitle}>
                    Use local weather to improve daily guidance
                  </Text>
                </View>
                <Switch
                  value={storeWeatherContextEnabled}
                  onValueChange={handleWeatherToggle}
                  trackColor={{ false: palette.bgEdge, true: palette.accent }}
                  thumbColor={palette.white}
                />
              </View>
            </View>
          )}

        </View>

        {/* ── Footer: Save ──────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
            ]}
            onPress={handleSave}
          >
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        </View>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
  },

  // ── Header ────────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgEdge,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    color: palette.ink,
    fontWeight: '600',
  },
  closeLabel: {
    fontSize: fontSize.lg,
    color: palette.inkSoft,
  },

  // ── Body ──────────────────────────────────────────────────────────────────────
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.xl,
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.small,
    color: palette.inkSoft,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // ── Weather hint (below climate chips) ───────────────────────────────────────
  weatherHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: 2,
  },
  weatherHintText: {
    fontSize: fontSize.small,
    color: palette.inkSoft,
    fontWeight: '400',
  },
  weatherHintUpdate: {
    fontSize: fontSize.small,
    color: palette.accent,
    fontWeight: '600',
  },

  // ── Chips (climate, activity, bottle archetype) ───────────────────────────────
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: palette.bgSoft,
    borderWidth: 1.5,
    borderColor: palette.bgEdge,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  chipText: {
    fontSize: fontSize.body,
    fontWeight: '500',
    color: palette.ink,
  },
  chipTextActive: {
    color: palette.white,
    fontWeight: '600',
  },

  // ── Color swatches ────────────────────────────────────────────────────────────
  swatchRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: palette.ink,
  },

  // ── Apple Health row ─────────────────────────────────────────────────────────
  healthKitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.bgSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: palette.bgEdge,
  },
  healthKitTextBlock: {
    flex: 1,
    marginRight: spacing.md,
  },
  healthKitSubtitle: {
    fontSize: fontSize.body,
    fontWeight: '500',
    color: palette.ink,
  },

  // ── Footer ────────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  saveButton: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonPressed: {
    backgroundColor: palette.accentPressed,
  },
  saveText: {
    color: palette.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
