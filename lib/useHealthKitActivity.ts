// HydroQuest — Ephemeral HealthKit activity context hook.
//
// Reads today's step count once on mount (or when enabled flips to true).
// Never persisted — step data is only meaningful in the current session.
// No store writes from this hook.
//
// Permission contract:
//   Permission is requested by ProfileEditSheet as part of the opt-in flow.
//   This hook only READS — it never re-prompts.
//   If authorization was revoked after opt-in, the query returns 0 steps
//   (HealthKit's normal silent-denial behavior); the hook degrades gracefully.
//
// Suggestion eligibility contract:
//   - high  (>= 8 000 steps): eligible at any time of day
//   - medium (>= 4 000 steps): eligible at any time of day
//   - low   (<  4 000 steps): only eligible at 18:00 local time or later
//   - otherwise:              suggestedLevel = null, not eligible
//
//   This prevents a "low activity" suggestion from firing in the morning just
//   because the user hasn't had time to accumulate steps yet.

import { useEffect, useState } from 'react';

import { isHealthKitAvailable, readTodayStepCount } from './healthKit';
import type { ActivityLevel } from '../constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HKActivityStatus =
  | 'disabled'      // healthKitActivityEnabled is false
  | 'loading'       // fetch in progress
  | 'success'       // fetch succeeded — step data is populated
  | 'unavailable'   // non-iOS platform or HealthKit not available
  | 'error';        // query threw — degrade silently

export type HKActivityContext = {
  status: HKActivityStatus;
  /** Total steps recorded today, or null before a successful fetch. */
  stepsToday: number | null;
  /**
   * Derived activity level suggestion, or null when there is not yet
   * enough evidence to make a meaningful suggestion.
   * Never auto-written to the store — always requires explicit user action.
   */
  suggestedLevel: ActivityLevel | null;
  /**
   * True when suggestedLevel is non-null — i.e., the signal is strong enough
   * to surface a hint in the UI.
   */
  suggestionEligible: boolean;
};

// ─── Time-aware step → activity mapping ──────────────────────────────────────

function deriveActivitySuggestion(
  steps: number,
  hourOfDay: number,
): { suggestedLevel: ActivityLevel | null; suggestionEligible: boolean } {
  if (steps >= 8000) {
    return { suggestedLevel: 'high', suggestionEligible: true };
  }
  if (steps >= 4000) {
    return { suggestedLevel: 'medium', suggestionEligible: true };
  }
  // Low is only meaningful late in the day when the user has had a full
  // opportunity to accumulate steps. Before 18:00, low steps are ambiguous.
  if (hourOfDay >= 18) {
    return { suggestedLevel: 'low', suggestionEligible: true };
  }
  return { suggestedLevel: null, suggestionEligible: false };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns ephemeral HealthKit activity context for the current session.
 *
 * @param enabled  Pass `healthKitActivityEnabled` from the profile store.
 *                 When false, returns immediately with status 'disabled'.
 */
export function useHealthKitActivity(enabled: boolean): HKActivityContext {
  const [status, setStatus]                     = useState<HKActivityStatus>(enabled ? 'loading' : 'disabled');
  const [stepsToday, setStepsToday]             = useState<number | null>(null);
  const [suggestedLevel, setSuggestedLevel]     = useState<ActivityLevel | null>(null);
  const [suggestionEligible, setSuggestionEligible] = useState(false);

  useEffect(() => {
    // ── Disabled path ───────────────────────────────────────────────────────
    if (!enabled) {
      setStatus('disabled');
      setStepsToday(null);
      setSuggestedLevel(null);
      setSuggestionEligible(false);
      return;
    }

    // ── Platform guard ──────────────────────────────────────────────────────
    if (!isHealthKitAvailable()) {
      setStatus('unavailable');
      return;
    }

    let cancelled = false;

    async function fetchSteps() {
      try {
        setStatus('loading');

        const steps = await readTodayStepCount();

        if (cancelled) return;

        if (steps === null) {
          // readTodayStepCount returns null only on an unexpected error.
          setStatus('error');
          return;
        }

        const hour = new Date().getHours();
        const { suggestedLevel: level, suggestionEligible: eligible } =
          deriveActivitySuggestion(steps, hour);

        setStepsToday(steps);
        setSuggestedLevel(level);
        setSuggestionEligible(eligible);
        setStatus('success');
      } catch (e) {
        if (!cancelled) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[useHealthKitActivity] fetchSteps threw unexpectedly:', e);
          }
          setStatus('error');
        }
      }
    }

    fetchSteps();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { status, stepsToday, suggestedLevel, suggestionEligible };
}
