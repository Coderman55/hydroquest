// HydroQuest — Profile / onboarding Zustand store.
// Persisted to AsyncStorage via persist middleware. All fields are persisted.
//
// This store calls into the hydration store via `useHydrationStore.getState()`
// to write goal updates after onboarding completion or climate change.
// The hydration store does NOT import this store — dependency is one-way.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PROFILE_STORE_KEY,
  SCHEMA_VERSION,
  type ActivityLevel,
  type BottleColor,
  type BottleId,
  type Climate,
  type Sex,
} from '../constants';
import { calculateGoal } from '../lib/calculateGoal';
import { useHydrationStore } from './useHydrationStore';

// ---------- Editable onboarding fields (used by setProfileField) ----------
type EditableProfileFields = {
  age: number | null;
  sex: Sex | null;
  weightLb: number | null;
  activityLevel: ActivityLevel | null;
  climate: Climate | null;
  selectedBottleId: BottleId | null;
  bottleColor: BottleColor | null;
};

// ---------- State shape ----------
type ProfileState = EditableProfileFields & {
  schemaVersion: string;
  onboardingComplete: boolean;
  /** Whether the user has opted in to Apple Health write sync. iOS only. */
  healthKitEnabled: boolean;
  /** Whether the user has opted in to HealthKit step-count reads for activity context. iOS only. */
  healthKitActivityEnabled: boolean;
  /**
   * Whether the user has opted in to local weather context. iOS only.
   * Permission is requested by the UI (ProfileEditSheet) before this is set true.
   * Default OFF. Does not automatically update climate or recompute goal.
   */
  weatherContextEnabled: boolean;
  /** True after persist middleware finishes loading from AsyncStorage. */
  hasHydrated: boolean;
};

type ProfileActions = {
  /** Set a single onboarding field. Type-safe via the K extends ... pattern. */
  setProfileField: <K extends keyof EditableProfileFields>(
    field: K,
    value: EditableProfileFields[K],
  ) => void;
  /**
   * Validate all 7 required fields, compute the goal, write it to the
   * hydration store, then mark onboarding complete.
   * Returns true on success, false if any required field is missing.
   */
  completeOnboarding: () => boolean;
  /**
   * Update climate. If onboarding is complete, immediately recompute the
   * daily goal with the new climate value (Logic §3 and §4).
   */
  setClimate: (climate: Climate) => void;
  /**
   * Update activity level. If onboarding is complete, immediately recompute
   * the daily goal with the new activity level.
   */
  setActivityLevel: (level: ActivityLevel) => void;
  /**
   * Persist the user's Apple Health opt-in preference.
   * The UI (ProfileEditSheet) is responsible for running the availability
   * check and authorization request before calling this with true.
   */
  setHealthKitEnabled: (value: boolean) => void;
  setHealthKitActivityEnabled: (value: boolean) => void;
  /**
   * Persist the user's weather context opt-in preference.
   * The UI (ProfileEditSheet) is responsible for requesting foreground
   * location permission before calling this with true.
   */
  setWeatherContextEnabled: (value: boolean) => void;
  setHasHydrated: (value: boolean) => void;
  /** Reset everything to initial state. Used by debug "Reset All". */
  resetProfile: () => void;
};

const initialState: Omit<ProfileState, 'hasHydrated'> = {
  schemaVersion: SCHEMA_VERSION,
  onboardingComplete: false,
  healthKitEnabled: false,
  healthKitActivityEnabled: false,
  weatherContextEnabled: false,
  age: null,
  sex: null,
  weightLb: null,
  activityLevel: null,
  climate: null,
  selectedBottleId: null,
  bottleColor: null,
};

export const useProfileStore = create<ProfileState & ProfileActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      hasHydrated: false,

      setProfileField: (field, value) => {
        // The dynamic-key set requires a cast — TS can't statically prove
        // that the key/value pair lines up after destructuring.
        set({ [field]: value } as Partial<ProfileState>);
      },

      completeOnboarding: () => {
        const state = get();

        // Validate all 7 required fields.
        if (
          state.age === null ||
          state.sex === null ||
          state.weightLb === null ||
          state.activityLevel === null ||
          state.climate === null ||
          state.selectedBottleId === null ||
          state.bottleColor === null
        ) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn(
              '[completeOnboarding] Missing required field(s); not completing.',
            );
          }
          return false;
        }

        // Compute the goal from the validated profile.
        const goal = calculateGoal({
          weightLb: state.weightLb,
          age: state.age,
          sex: state.sex,
          activityLevel: state.activityLevel,
          climate: state.climate,
        });

        // Write goal to the hydration store.
        useHydrationStore.getState().setGoal(goal);

        // Mark onboarding complete.
        set({ onboardingComplete: true });
        return true;
      },

      setClimate: (climate) => {
        const prev = get();
        set({ climate });

        // After onboarding, climate changes immediately recompute the goal.
        // Before onboarding, this is just an input update.
        if (prev.onboardingComplete) {
          const goal = calculateGoal({
            weightLb: prev.weightLb,
            age: prev.age,
            sex: prev.sex,
            activityLevel: prev.activityLevel,
            climate, // use the new climate
          });
          useHydrationStore.getState().setGoal(goal);
        }
      },

      setActivityLevel: (activityLevel) => {
        const prev = get();
        set({ activityLevel });

        // Mirrors setClimate: recompute goal immediately after onboarding.
        if (prev.onboardingComplete) {
          const goal = calculateGoal({
            weightLb: prev.weightLb,
            age: prev.age,
            sex: prev.sex,
            activityLevel, // use the new activity level
            climate: prev.climate,
          });
          useHydrationStore.getState().setGoal(goal);
        }
      },

      setHealthKitEnabled: (value) => {
        set({ healthKitEnabled: value });
      },

      setHealthKitActivityEnabled: (value) => {
        set({ healthKitActivityEnabled: value });
      },

      setWeatherContextEnabled: (value) => {
        set({ weatherContextEnabled: value });
      },

      setHasHydrated: (value) => {
        set({ hasHydrated: value });
      },

      resetProfile: () => {
        set({ ...initialState });
      },
    }),
    {
      name: PROFILE_STORE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Persist all profile fields. Exclude hasHydrated (transient).
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        onboardingComplete: state.onboardingComplete,
        healthKitEnabled: state.healthKitEnabled,
        healthKitActivityEnabled: state.healthKitActivityEnabled,
        weatherContextEnabled: state.weatherContextEnabled,
        age: state.age,
        sex: state.sex,
        weightLb: state.weightLb,
        activityLevel: state.activityLevel,
        climate: state.climate,
        selectedBottleId: state.selectedBottleId,
        bottleColor: state.bottleColor,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error && __DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[useProfileStore] rehydrate error:', error);
        }
        state?.setHasHydrated(true);
      },
    },
  ),
);
