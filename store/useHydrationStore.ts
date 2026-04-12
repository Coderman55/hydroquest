// HydroQuest — Hydration / streak / date Zustand store.
// Persisted to AsyncStorage via persist middleware.
// `draftLogOz`, `lastLogAmountOz`, and `previousLastGoalHitDate` are intentionally
// excluded from persistence (ephemeral session values).
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
  /**
   * Ephemeral undo buffer. Holds the amount from the most recent successful log.
   * Null means there is nothing to undo this session.
   * Excluded from persistence — cleared on cold start and new-day reset.
   */
  lastLogAmountOz: number | null;
  /**
   * Ephemeral. Captures the value of `lastGoalHitDate` *before* the log that
   * first triggered today's goal hit. Required so `undoLastLog` can restore the
   * exact pre-hit date rather than guessing it.
   * Only written when `justHitGoal` is true; never overwritten on subsequent logs.
   * Excluded from persistence.
   */
  previousLastGoalHitDate: string | null;
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
  /**
   * Reverse the most recent successful log. One-level undo only.
   * No-op if `lastLogAmountOz` is null.
   * If undoing causes today's intake to drop below the daily goal — and the goal
   * was hit today — also rolls back the streak increment and restores
   * `lastGoalHitDate` to its pre-hit value.
   */
  undoLastLog: () => void;
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
  lastLogAmountOz: null,
  previousLastGoalHitDate: null,
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

        // Streak: increment immediately on first goal hit of the day.
        const justHitGoal =
          newIntake >= state.dailyGoalOz && state.lastGoalHitDate !== today;

        if (justHitGoal) {
          set({
            todayIntakeOz: newIntake,
            draftLogOz: amountOz,
            streakCount: state.streakCount + 1,
            lastGoalHitDate: today,
            lastLogAmountOz: amountOz,
            // Capture the pre-hit date so undoLastLog can restore it exactly.
            // Only written here — subsequent logs above goal must not overwrite it.
            previousLastGoalHitDate: state.lastGoalHitDate,
          });
        } else {
          set({
            todayIntakeOz: newIntake,
            draftLogOz: amountOz,
            lastLogAmountOz: amountOz,
            // previousLastGoalHitDate intentionally not touched:
            // if the goal was already hit earlier today, that save is still valid.
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
            lastLogAmountOz: null,
            previousLastGoalHitDate: null,
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
            lastLogAmountOz: null,
            previousLastGoalHitDate: null,
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
            lastLogAmountOz: null,
            previousLastGoalHitDate: null,
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
        // initialState includes lastLogAmountOz: null and previousLastGoalHitDate: null,
        // so both undo fields are cleared automatically here.
        set({ ...initialState });
      },

      undoLastLog: () => {
        const state = get();

        // Nothing to undo.
        if (state.lastLogAmountOz === null) return;

        const today = getTodayString();
        const newIntake = Math.max(0, state.todayIntakeOz - state.lastLogAmountOz);

        // Determine whether this undo crosses back below the goal line and whether
        // the goal-hit event that occurred today needs to be reversed.
        // Conditions for streak rollback (all must be true):
        //   1. The user hit the goal at some point today (lastGoalHitDate === today).
        //   2. Before undo the intake was at or above goal.
        //   3. After undo the intake drops below goal.
        const goalWasHitToday    = state.lastGoalHitDate === today;
        const wasAtOrAboveGoal   = state.todayIntakeOz >= state.dailyGoalOz;
        const isNowBelowGoal     = newIntake < state.dailyGoalOz;
        const mustRollBackStreak = goalWasHitToday && wasAtOrAboveGoal && isNowBelowGoal;

        if (mustRollBackStreak) {
          set({
            todayIntakeOz: newIntake,
            draftLogOz: 0,
            lastLogAmountOz: null,
            streakCount: Math.max(0, state.streakCount - 1),
            // Restore the exact date that was saved before today's goal-hit log.
            // This keeps runNewDayCheck correct — it needs lastGoalHitDate to reflect
            // the last day the goal was genuinely sustained, not today's cancelled hit.
            lastGoalHitDate: state.previousLastGoalHitDate,
            previousLastGoalHitDate: null,
          });
        } else {
          set({
            todayIntakeOz: newIntake,
            draftLogOz: 0,
            lastLogAmountOz: null,
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
      // Exclude ephemeral fields from persistence.
      // Persisted: schemaVersion, todayIntakeOz, dailyGoalOz, recommendedGoalOz,
      //            streakCount, lastOpenedDate, lastGoalHitDate.
      // Not persisted: draftLogOz, hasHydrated, lastLogAmountOz, previousLastGoalHitDate.
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
