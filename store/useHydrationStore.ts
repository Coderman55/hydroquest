// HydroQuest — Hydration / streak / date Zustand store.
// Persisted to AsyncStorage via persist middleware.
// `lastAction` is intentionally excluded from persistence (ephemeral session value).
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

// ---------- Undo action discriminated union ----------
// Captures the exact pre-action snapshot so undoLastAction can restore state
// directly without deriving rollback heuristics after the fact.
type LastAction =
  | {
      type: 'drink';
      consumedOz: number;
      prevBottleLevelOz: number | null;
      prevTodayIntakeOz: number;
      prevStreakCount: number;
      prevLastGoalHitDate: string | null;
    }
  | {
      type: 'refill';
      prevBottleLevelOz: number | null;
    };

// ---------- State shape ----------
type HydrationState = {
  schemaVersion: string;
  todayIntakeOz: number;
  dailyGoalOz: number;
  recommendedGoalOz: number;
  streakCount: number;
  lastOpenedDate: string | null;
  lastGoalHitDate: string | null;
  /**
   * Committed ounces currently left in the bottle.
   * null = treat as full (first launch / migrated old installs with no stored level).
   * Persisted. NOT reset on new day — the physical bottle does not auto-refill at midnight.
   */
  bottleLevelOz: number | null;
  /**
   * Ephemeral undo buffer. Holds the last committed action (drink or refill).
   * null = nothing to undo this session.
   * Excluded from persistence — cleared on cold start and new-day reset.
   */
  lastAction: LastAction | null;
  /** True after persist middleware finishes loading from AsyncStorage. */
  hasHydrated: boolean;
};

type HydrationActions = {
  /** Add water to today's intake. Rejects 0, negative, NaN, non-finite. */
  logWater: (amountOz: number) => void;
  /**
   * Write committed bottle level. Accepts 0 and positive finite values.
   * Caller provides an already-valid normalized value.
   */
  setBottleLevel: (oz: number) => void;
  /**
   * Refill the bottle to full capacity. No-op if already at or above capacity.
   * Does not touch todayIntakeOz, streakCount, or lastGoalHitDate.
   * Caller must pass the current bottle's full capacity.
   */
  refillBottle: (fullCapacityOz: number) => void;
  /** Write goal fields. Called by profile store after onboarding/climate change. */
  setGoal: (goal: GoalResult) => void;
  /** Run the new-day reset algorithm from Logic §10. Caller passes current profile. */
  runNewDayCheck: (profile: GoalInputs) => void;
  /** Internal: marks the store as fully rehydrated from AsyncStorage. */
  setHasHydrated: (value: boolean) => void;
  /** Reset everything to initial state. Used by debug "Reset All". */
  resetHydration: () => void;
  /**
   * Reverse the most recent committed action (drink or refill). One-level only.
   * No-op if lastAction is null.
   * Drink undo: restores the exact pre-action snapshot from lastAction.
   * Refill undo: restores prior bottle level only; intake and streak are not changed.
   */
  undoLastAction: () => void;
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
  bottleLevelOz: null,
  lastAction: null,
};

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function shiftDateStringBackOneDay(dateString: string | null): string | null {
  if (dateString === null) return null;

  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
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

        // Capture exact pre-action snapshot before mutating — used by undoLastAction.
        // Storing the full snapshot avoids having to re-derive rollback logic at undo time.
        const action: LastAction = {
          type: 'drink',
          consumedOz: amountOz,
          prevBottleLevelOz: state.bottleLevelOz,
          prevTodayIntakeOz: state.todayIntakeOz,
          prevStreakCount: state.streakCount,
          prevLastGoalHitDate: state.lastGoalHitDate,
        };

        // Streak: increment immediately on first goal hit of the day.
        const justHitGoal =
          newIntake >= state.dailyGoalOz && state.lastGoalHitDate !== today;

        if (justHitGoal) {
          set({
            todayIntakeOz: newIntake,
            streakCount: state.streakCount + 1,
            lastGoalHitDate: today,
            lastAction: action,
          });
        } else {
          set({
            todayIntakeOz: newIntake,
            lastAction: action,
          });
        }
      },

      setBottleLevel: (oz) => {
        if (!Number.isFinite(oz) || oz < 0) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[setBottleLevel] Rejected invalid value:', oz);
          }
          return;
        }
        set({ bottleLevelOz: oz });
      },

      refillBottle: (fullCapacityOz) => {
        if (!isPositiveFinite(fullCapacityOz)) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[refillBottle] Rejected invalid capacity:', fullCapacityOz);
          }
          return;
        }

        const state = get();
        const current = state.bottleLevelOz;

        // null means already full; numeric >= capacity means already full.
        // Either way: no-op, no lastAction written.
        if (current === null || current >= fullCapacityOz) {
          return;
        }

        set({
          lastAction: { type: 'refill', prevBottleLevelOz: current },
          bottleLevelOz: fullCapacityOz,
        });
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
            lastAction: null,
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
            lastAction: null,
            // bottleLevelOz intentionally NOT reset — the digital bottle persists across midnight.
            recommendedGoalOz: newGoal.recommendedGoalOz,
            dailyGoalOz: newGoal.dailyGoalOz,
            lastOpenedDate: today,
          });
        } else {
          // More than one day passed — at least one day was skipped.
          set({
            streakCount: 0,
            todayIntakeOz: 0,
            lastAction: null,
            // bottleLevelOz intentionally NOT reset.
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
        // initialState includes bottleLevelOz: null and lastAction: null.
        set({ ...initialState });
      },

      undoLastAction: () => {
        const { lastAction } = get();
        if (lastAction === null) return;

        if (lastAction.type === 'drink') {
          // Restore exact pre-action snapshot directly — no derived rollback calculations.
          // The snapshot was captured before any mutation in logWater, so this is always safe.
          set({
            todayIntakeOz: lastAction.prevTodayIntakeOz,
            streakCount: lastAction.prevStreakCount,
            lastGoalHitDate: lastAction.prevLastGoalHitDate,
            bottleLevelOz: lastAction.prevBottleLevelOz,
            lastAction: null,
          });
        } else {
          // type === 'refill': only restore bottle level.
          // Intake and streak are not touched — refill never changed them.
          set({
            bottleLevelOz: lastAction.prevBottleLevelOz,
            lastAction: null,
          });
        }
      },

      _setLastOpenedDateToYesterday: () => {
        const state = get();

        set({
          lastOpenedDate: shiftDateStringBackOneDay(state.lastOpenedDate),
          lastGoalHitDate: shiftDateStringBackOneDay(state.lastGoalHitDate),
        });
      },
    }),
    {
      name: HYDRATION_STORE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Persisted: schemaVersion, todayIntakeOz, dailyGoalOz, recommendedGoalOz,
      //            streakCount, lastOpenedDate, lastGoalHitDate, bottleLevelOz.
      // Not persisted: lastAction, hasHydrated.
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        todayIntakeOz: state.todayIntakeOz,
        dailyGoalOz: state.dailyGoalOz,
        recommendedGoalOz: state.recommendedGoalOz,
        streakCount: state.streakCount,
        lastOpenedDate: state.lastOpenedDate,
        lastGoalHitDate: state.lastGoalHitDate,
        bottleLevelOz: state.bottleLevelOz,
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
