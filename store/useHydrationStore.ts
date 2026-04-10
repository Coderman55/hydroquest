// HydroQuest — Hydration / streak / date Zustand store.
// Persisted to AsyncStorage via persist middleware.
// `draftLogOz` is intentionally excluded from persistence (ephemeral UI value).
//
// This store does NOT import the profile store. To avoid circular dependencies,
// `runNewDayCheck` accepts the current profile as a parameter — the caller
// (App.tsx or a hook) reads the profile store and passes it in.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_GOAL_OZ,
  HYDRATION_STORE_KEY,
  SCHEMA_VERSION,
} from '../constants';
import {
  calculateGoal,
  type GoalInputs,
  type GoalResult,
} from '../lib/calculateGoal';
import { getDaysBetween, getTodayString } from '../lib/dateUtils';

// ---------- State shape ----------
type HydrationState = {
  schemaVersion: string;
  todayIntakeOz: number;
  dailyGoalOz: number;
  recommendedGoalOz: number;
  streakCount: number;
  lastOpenedDate: string | null;
  lastGoalHitDate: string | null;
  /** Ephemeral. Always 0 on app start. Excluded from persistence via partialize. */
  draftLogOz: number;
  /** True after persist middleware finishes loading from AsyncStorage. */
  hasHydrated: boolean;
};

type HydrationActions = {
  /** Add water to today's intake. Rejects 0, negative, NaN, non-finite. */
  logWater: (amountOz: number) => void;
  /** Set the bottle's selected amount. 0 is allowed only as init/clear. */
  setDraftLog: (amountOz: number) => void;
  /** Write goal fields. Called by profile store after onboarding/climate change. */
  setGoal: (goal: GoalResult) => void;
  /** Run the new-day reset algorithm from Logic §10. Caller passes current profile. */
  runNewDayCheck: (profile: GoalInputs) => void;
  /** Internal: marks the store as fully rehydrated from AsyncStorage. */
  setHasHydrated: (value: boolean) => void;
  /** Reset everything to initial state. Used by debug "Reset All". */
  resetHydration: () => void;
  /** Debug-only: rewinds lastOpenedDate to yesterday so new-day logic can be tested. */
  _setLastOpenedDateToYesterday: () => void;
};

const initialState: Omit<HydrationState, 'hasHydrated'> = {
  schemaVersion: SCHEMA_VERSION,
  todayIntakeOz: 0,
  dailyGoalOz: DEFAULT_GOAL_OZ,
  recommendedGoalOz: DEFAULT_GOAL_OZ,
  streakCount: 0,
  lastOpenedDate: null,
  lastGoalHitDate: null,
  draftLogOz: 0,
};

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function getYesterdayString(): string {
  const today = new Date();
  const yesterday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1,
  );
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const useHydrationStore = create<HydrationState & HydrationActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      hasHydrated: false,

      logWater: (amountOz) => {
        if (!isPositiveFinite(amountOz)) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[logWater] Rejected invalid amount:', amountOz);
          }
          return;
        }

        const state = get();
        const newIntake = state.todayIntakeOz + amountOz;
        const today = getTodayString();

        // Streak: increment immediately on first goal hit of the day.
        const justHitGoal =
          newIntake >= state.dailyGoalOz && state.lastGoalHitDate !== today;

        if (justHitGoal) {
          set({
            todayIntakeOz: newIntake,
            draftLogOz: amountOz,
            streakCount: state.streakCount + 1,
            lastGoalHitDate: today,
          });
        } else {
          set({
            todayIntakeOz: newIntake,
            draftLogOz: amountOz,
          });
        }
      },

      setDraftLog: (amountOz) => {
        // 0 is the sentinel "empty bottle" state. Allowed only from init/clear sites.
        // Per Logic §12, callers must enforce this discipline; the action accepts 0
        // to support init and new-day reset.
        if (amountOz === 0) {
          set({ draftLogOz: 0 });
          return;
        }
        if (!isPositiveFinite(amountOz)) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[setDraftLog] Rejected invalid amount:', amountOz);
          }
          return;
        }
        set({ draftLogOz: amountOz });
      },

      setGoal: ({ recommendedGoalOz, dailyGoalOz }) => {
        set({ recommendedGoalOz, dailyGoalOz });
      },

      runNewDayCheck: (profile) => {
        const state = get();
        const today = getTodayString();

        // First-ever open: just initialize.
        if (state.lastOpenedDate === null) {
          set({
            lastOpenedDate: today,
            todayIntakeOz: 0,
            draftLogOz: 0,
          });
          return;
        }

        const daysSinceLastOpen = getDaysBetween(state.lastOpenedDate, today);

        if (daysSinceLastOpen <= 0) {
          // Same day (or clock skew). Do nothing.
          return;
        }

        // A new day has begun. Recompute goal using current profile + climate.
        const newGoal = calculateGoal(profile);

        if (daysSinceLastOpen === 1) {
          // Exactly one day passed.
          // If yesterday was a success, the streak was already incremented at hit time.
          const yesterdayWasSuccess =
            state.lastGoalHitDate === state.lastOpenedDate;
          set({
            streakCount: yesterdayWasSuccess ? state.streakCount : 0,
            todayIntakeOz: 0,
            draftLogOz: 0,
            recommendedGoalOz: newGoal.recommendedGoalOz,
            dailyGoalOz: newGoal.dailyGoalOz,
            lastOpenedDate: today,
          });
        } else {
          // More than one day passed — at least one day was skipped.
          set({
            streakCount: 0,
            todayIntakeOz: 0,
            draftLogOz: 0,
            recommendedGoalOz: newGoal.recommendedGoalOz,
            dailyGoalOz: newGoal.dailyGoalOz,
            lastOpenedDate: today,
          });
        }
      },

      setHasHydrated: (value) => {
        set({ hasHydrated: value });
      },

      resetHydration: () => {
        set({ ...initialState });
      },

      _setLastOpenedDateToYesterday: () => {
        set({ lastOpenedDate: getYesterdayString() });
      },
    }),
    {
      name: HYDRATION_STORE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Exclude draftLogOz and hasHydrated from persistence.
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        todayIntakeOz: state.todayIntakeOz,
        dailyGoalOz: state.dailyGoalOz,
        recommendedGoalOz: state.recommendedGoalOz,
        streakCount: state.streakCount,
        lastOpenedDate: state.lastOpenedDate,
        lastGoalHitDate: state.lastGoalHitDate,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error && __DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[useHydrationStore] rehydrate error:', error);
        }
        state?.setHasHydrated(true);
      },
    },
  ),
);
