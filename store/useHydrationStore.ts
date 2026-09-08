// HydroQuest — Hydration / streak / date Zustand store.
// Persisted to AsyncStorage via persist middleware.
// `lastAction` and `lastEventId` are intentionally excluded from persistence
// (ephemeral session values).
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
import { getDaysBetween, getTodayString, getUtcIsoTimestamp } from '../lib/dateUtils';
import { createRecoverableStorage } from '../lib/recoverableStorage';

type PersistenceStatus = 'loading' | 'ready' | 'error';
const recoverableStorage = createRecoverableStorage(AsyncStorage);
let updatePersistenceStatus: ((value: PersistenceStatus) => void) | null = null;
import { writeDrinkSample, deleteDrinkSample } from '../lib/healthKit';

// ---------- Event ledger types ----------
// Additive infrastructure only — no UI reads this in the MVP.
// Kept minimal: no derived, speculative, or sync-status fields today.

type DrinkEvent = {
  id: string;
  timestampIsoUtc: string; // canonical UTC ISO 8601, e.g. "2026-04-14T09:32:15.123Z"
  date: string;            // local calendar date "YYYY-MM-DD" — partition key for day queries
  type: 'drink';
  beverageType: 'water';   // Day 1 only; field exists now for future drink-type expansion
  volumeOz: number;        // raw consumed amount
  effectiveHydrationOz: number; // equals volumeOz for water; future beverage types may differ
  /**
   * UUID of the corresponding Apple Health dietary-water sample.
   * Absent when HealthKit is disabled or the write failed.
   * Used by undoLastAction to delete the matching sample on undo.
   */
  hkSampleUuid?: string;
};

type RefillEvent = {
  id: string;
  timestampIsoUtc: string;
  date: string;
  type: 'refill';
  previousLevelOz: number;
  newLevelOz: number;
};

type HydrationEvent = DrinkEvent | RefillEvent;

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

// ---------- ID generation ----------
// UUID v4-format string using Math.random(). No external dependency.
// Sufficient for local dedup and future Apple Health sync idempotency.
function generateEventId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
   * Private persisted action ledger. Appended on each committed drink or refill.
   * Used as future infrastructure for Apple Health sync and drink-type logging.
   * No UI reads this in the MVP.
   */
  eventLedger: HydrationEvent[];
  /**
   * Ephemeral undo buffer. Holds the last committed action (drink or refill).
   * null = nothing to undo this session.
   * Excluded from persistence — cleared on cold start and new-day reset.
   */
  lastAction: LastAction | null;
  /**
   * Ephemeral. Holds the id of the last ledger event written this session.
   * Used by undoLastAction to pop the matching ledger entry.
   * null = no undoable event this session.
   * Excluded from persistence — cleared on cold start and new-day reset.
   */
  lastEventId: string | null;
  /** True after persist middleware finishes loading from AsyncStorage. */
  hasHydrated: boolean;
  /** Transient persistence state. Error keeps the app behind a retry gate. */
  persistenceStatus: PersistenceStatus;
};

type HydrationActions = {
  /** Ensure aggregate day state is current before accepting a mutation. */
  ensureCurrentDay: () => boolean;
  /** Add water to today's intake. Rejects 0, negative, NaN, non-finite. */
  logWater: (amountOz: number) => void;
  /**
   * Write committed bottle level. Accepts 0 and positive finite values.
   * Caller provides an already-valid normalized value.
   */
  setBottleLevel: (oz: number) => void;
  /**
   * Refill the bottle to a target level. No-op if current level is already at
   * or above targetLevelOz, or if bottleLevelOz is null (treated as full).
   * Does not touch todayIntakeOz, streakCount, or lastGoalHitDate.
   * Tap path: pass bottleCapacityOz. Hold-release path: pass held preview level.
   */
  refillBottle: (targetLevelOz: number) => void;
  /** Write goal fields. Called by profile store after onboarding/climate change. */
  setGoal: (goal: GoalResult) => void;
  /** Run the new-day reset algorithm from Logic §10. Caller passes current profile. */
  runNewDayCheck: (profile: GoalInputs) => void;
  /** Internal: marks the store as fully rehydrated from AsyncStorage. */
  setHasHydrated: (value: boolean) => void;
  setPersistenceStatus: (value: PersistenceStatus) => void;
  /** Retry a failed AsyncStorage restore without allowing a default-state write. */
  retryHydration: () => void;
  /** Reset everything to initial state. Used by debug "Reset All". */
  resetHydration: () => void;
  /**
   * Reverse the most recent committed action (drink or refill). One-level only.
   * No-op if lastAction is null.
   * Drink undo: restores the exact pre-action snapshot from lastAction.
   * Refill undo: restores prior bottle level only; intake and streak are not changed.
   * Also pops the matching last ledger entry if lastEventId matches.
   */
  undoLastAction: () => void;
  /** Debug-only: rewinds lastOpenedDate to yesterday so new-day logic can be tested. */
  _setLastOpenedDateToYesterday: () => void;
};

const initialState: Omit<HydrationState, 'hasHydrated' | 'persistenceStatus'> = {
  schemaVersion: SCHEMA_VERSION,
  todayIntakeOz: 0,
  dailyGoalOz: DEFAULT_GOAL_OZ,
  recommendedGoalOz: DEFAULT_GOAL_OZ,
  streakCount: 0,
  lastOpenedDate: null,
  lastGoalHitDate: null,
  bottleLevelOz: null,
  eventLedger: [],
  lastAction: null,
  lastEventId: null,
};

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function deleteDrinkSampleBestEffort(hkSampleUuid: string): void {
  void deleteDrinkSample(hkSampleUuid).catch(() => {});
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
    (set, get) => {
      updatePersistenceStatus = (value) => {
        set({ persistenceStatus: value, hasHydrated: value === 'ready' });
      };
      return ({
      ...initialState,
      hasHydrated: false,
      persistenceStatus: 'loading',

      // Every user mutation crosses this boundary first. The ledger remains
      // supporting data; runNewDayCheck resets aggregate day state directly.
      ensureCurrentDay: () => {
        const state = get();
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useProfileStore } = require('./useProfileStore') as typeof import('./useProfileStore');
        const profile = useProfileStore.getState();
        if (state.persistenceStatus !== 'ready' || profile.persistenceStatus !== 'ready') {
          return false;
        }
        state.runNewDayCheck({
          weightLb: profile.weightLb,
          age: profile.age,
          sex: profile.sex,
          activityLevel: profile.activityLevel,
          climate: profile.climate,
        });
        return true;
      },

      logWater: (amountOz) => {
        if (!get().ensureCurrentDay()) return;
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

        // Build and append a ledger event for this committed drink.
        const eventId = generateEventId();
        const drinkEvent: HydrationEvent = {
          id: eventId,
          timestampIsoUtc: getUtcIsoTimestamp(),
          date: today,
          type: 'drink',
          beverageType: 'water',
          volumeOz: amountOz,
          effectiveHydrationOz: amountOz,
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
            lastEventId: eventId,
            eventLedger: [...state.eventLedger, drinkEvent],
          });
        } else {
          set({
            todayIntakeOz: newIntake,
            lastAction: action,
            lastEventId: eventId,
            eventLedger: [...state.eventLedger, drinkEvent],
          });
        }

        // ── Apple Health write (non-blocking follow-on) ──────────────────────
        // Local state is already committed above. HealthKit write is a
        // fire-and-forget side effect. Any failure leaves local state intact.
        //
        // We read healthKitEnabled lazily via require() to avoid creating a
        // circular module-level import between the two store files.
        // By the time any action runs, both stores are fully initialised.
        {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { useProfileStore } = require('./useProfileStore') as typeof import('./useProfileStore');
          if (useProfileStore.getState().healthKitEnabled) {
            void writeDrinkSample(amountOz, drinkEvent.timestampIsoUtc)
              .then((hkUuid) => {
                if (!hkUuid) return;

                // The event can disappear while this non-blocking write is pending
                // (undo/reset). In that case, clean up the sample just created.
                if (!get().eventLedger.some((event) => event.id === eventId)) {
                  deleteDrinkSampleBestEffort(hkUuid);
                  return;
                }

                // The immutable event id binds an out-of-order Health completion
                // to its original drink, independent of the current undo action.
                set((prev) => ({
                  eventLedger: prev.eventLedger.map((event) =>
                    event.id === eventId
                      ? ({ ...event, hkSampleUuid: hkUuid } as HydrationEvent)
                      : event,
                  ),
                }));
              })
              .catch(() => {});
          }
        }
      },

      setBottleLevel: (oz) => {
        if (!get().ensureCurrentDay()) return;
        if (!Number.isFinite(oz) || oz < 0) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[setBottleLevel] Rejected invalid value:', oz);
          }
          return;
        }
        set({ bottleLevelOz: oz });
      },

      refillBottle: (targetLevelOz) => {
        if (!get().ensureCurrentDay()) return;
        if (!isPositiveFinite(targetLevelOz)) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[refillBottle] Rejected invalid target level:', targetLevelOz);
          }
          return;
        }

        const state = get();
        const current = state.bottleLevelOz;

        // null means already full; numeric >= target means no-op.
        // Either way: no lastAction or ledger event written.
        if (current === null || current >= targetLevelOz) {
          return;
        }

        // Build and append a ledger event for this committed refill.
        const eventId = generateEventId();
        const refillEvent: HydrationEvent = {
          id: eventId,
          timestampIsoUtc: getUtcIsoTimestamp(),
          date: getTodayString(),
          type: 'refill',
          previousLevelOz: current,
          newLevelOz: targetLevelOz,
        };

        set({
          lastAction: { type: 'refill', prevBottleLevelOz: current },
          lastEventId: eventId,
          bottleLevelOz: targetLevelOz,
          eventLedger: [...state.eventLedger, refillEvent],
        });
      },

      setGoal: ({ recommendedGoalOz, dailyGoalOz }) => {
        if (!get().ensureCurrentDay()) return;
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
            lastEventId: null,
            // eventLedger intentionally preserved — carries across days.
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
            lastEventId: null,
            // eventLedger intentionally preserved — carries across days.
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
            lastEventId: null,
            // eventLedger intentionally preserved — carries across days.
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

      setPersistenceStatus: (value) => {
        updatePersistenceStatus?.(value);
      },

      retryHydration: () => {
        recoverableStorage.closeWrites();
        set({ hasHydrated: false, persistenceStatus: 'loading' });
        useHydrationStore.persist.rehydrate();
      },

      resetHydration: () => {
        // initialState includes eventLedger: [], lastAction: null, lastEventId: null.
        set({ ...initialState });
      },

      undoLastAction: () => {
        if (!get().ensureCurrentDay()) return;
        const { lastAction, lastEventId, eventLedger } = get();
        if (lastAction === null) return;

        // Pop the matching last ledger entry if it was written by this session's action.
        // O(1): only ever checks the final element; no scan.
        const lastEntry = eventLedger[eventLedger.length - 1];
        const newLedger =
          lastEventId !== null &&
          eventLedger.length > 0 &&
          lastEntry.id === lastEventId
            ? eventLedger.slice(0, -1)
            : eventLedger;

        // Capture HealthKit UUID before removing the entry.
        // Only drink events can have hkSampleUuid; refill events never sync.
        const hkUuidToDelete =
          lastAction.type === 'drink' &&
          lastEventId !== null &&
          lastEntry?.id === lastEventId
            ? (lastEntry as DrinkEvent).hkSampleUuid ?? null
            : null;

        if (lastAction.type === 'drink') {
          // Restore exact pre-action snapshot directly — no derived rollback calculations.
          // The snapshot was captured before any mutation in logWater, so this is always safe.
          set({
            todayIntakeOz: lastAction.prevTodayIntakeOz,
            streakCount: lastAction.prevStreakCount,
            lastGoalHitDate: lastAction.prevLastGoalHitDate,
            bottleLevelOz: lastAction.prevBottleLevelOz,
            lastAction: null,
            lastEventId: null,
            eventLedger: newLedger,
          });
        } else {
          // type === 'refill': only restore bottle level.
          // Intake and streak are not touched — refill never changed them.
          set({
            bottleLevelOz: lastAction.prevBottleLevelOz,
            lastAction: null,
            lastEventId: null,
            eventLedger: newLedger,
          });
        }

        // ── Apple Health delete (non-blocking, best-effort) ──────────────────
        // Local undo is already committed above. If the HealthKit delete fails,
        // the sample becomes orphaned in the Health app — acceptable for v1.
        if (hkUuidToDelete) {
          deleteDrinkSampleBestEffort(hkUuidToDelete);
        }
      },

      _setLastOpenedDateToYesterday: () => {
        const state = get();

        set({
          lastOpenedDate: shiftDateStringBackOneDay(state.lastOpenedDate),
          lastGoalHitDate: shiftDateStringBackOneDay(state.lastGoalHitDate),
        });
      },
    });
    },
    {
      name: HYDRATION_STORE_KEY,
      storage: createJSONStorage(() => recoverableStorage),
      // Start after the store exists so even a synchronously-throwing adapter
      // can enter the retry state without referencing an uninitialized export.
      skipHydration: true,
      // Zustand persist version: bumped to 2 to register the new migration path.
      // This is a separate numeric counter from the schemaVersion string in state.
      version: 2,
      // v0 → v1: add eventLedger (schema v1 → v2).
      // v1 → v2: DrinkEvent gains optional hkSampleUuid. Existing events are
      //          valid as-is since the field is optional; no data transformation needed.
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          const old = persistedState as Record<string, unknown>;
          return { ...old, schemaVersion: '2', eventLedger: [] };
        }
        if (version === 1) {
          // hkSampleUuid is optional on DrinkEvent — existing persisted events
          // without it are structurally valid. No transformation required.
          return persistedState;
        }
        return persistedState;
      },
      // Persisted: schemaVersion, todayIntakeOz, dailyGoalOz, recommendedGoalOz,
      //            streakCount, lastOpenedDate, lastGoalHitDate, bottleLevelOz,
      //            eventLedger.
      // Not persisted: lastAction, lastEventId, hasHydrated, persistenceStatus.
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        todayIntakeOz: state.todayIntakeOz,
        dailyGoalOz: state.dailyGoalOz,
        recommendedGoalOz: state.recommendedGoalOz,
        streakCount: state.streakCount,
        lastOpenedDate: state.lastOpenedDate,
        lastGoalHitDate: state.lastGoalHitDate,
        bottleLevelOz: state.bottleLevelOz,
        eventLedger: state.eventLedger,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          recoverableStorage.closeWrites();
          // `state` is undefined on persist errors, so use the initialized
          // store action. The guarded adapter suppresses this write.
          updatePersistenceStatus?.('error');
          if (__DEV__) {
          // eslint-disable-next-line no-console
            console.warn('[useHydrationStore] rehydrate error:', error);
          }
          return;
        }
        // Open only after JSON parse, migration, and merge have all succeeded.
        recoverableStorage.openWrites();
        updatePersistenceStatus?.('ready');
      },
    },
  ),
);

void Promise.resolve().then(() => useHydrationStore.persist.rehydrate());
