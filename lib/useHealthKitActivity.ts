// Ephemeral HealthKit activity context. No permission prompts or store writes.
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isHealthKitAvailable, readTodayStepCount } from './healthKit';
import { createContextRefreshLifecycle, createRefreshGeneration, resolveWithin } from './contextRefreshLifecycle';
import { getTodayString } from './dateUtils';
import type { ActivityLevel } from '../constants';

export type HKActivityStatus = 'disabled' | 'loading' | 'success' | 'unavailable' | 'error';
export type HKActivityContext = {
  status: HKActivityStatus;
  stepsToday: number | null;
  suggestedLevel: ActivityLevel | null;
  suggestionEligible: boolean;
};

const STEP_QUERY_TIMEOUT_MS = 12_000;

export function deriveActivitySuggestion(steps: number, hourOfDay: number): { suggestedLevel: ActivityLevel | null; suggestionEligible: boolean } {
  if (steps >= 8000) return { suggestedLevel: 'high', suggestionEligible: true };
  if (steps >= 4000) return { suggestedLevel: 'medium', suggestionEligible: true };
  return hourOfDay >= 18
    ? { suggestedLevel: 'low', suggestionEligible: true }
    : { suggestedLevel: null, suggestionEligible: false };
}

export function useHealthKitActivity(enabled: boolean): HKActivityContext {
  const [status, setStatus] = useState<HKActivityStatus>(enabled ? 'loading' : 'disabled');
  const [stepsToday, setStepsToday] = useState<number | null>(null);
  const [suggestedLevel, setSuggestedLevel] = useState<ActivityLevel | null>(null);
  const [suggestionEligible, setSuggestionEligible] = useState(false);
  const generationRef = useRef(createRefreshGeneration());

  useEffect(() => {
    const generation = generationRef.current;
    const clear = (next: HKActivityStatus) => {
      setStepsToday(null); setSuggestedLevel(null); setSuggestionEligible(false); setStatus(next);
    };
    if (!enabled) { generation.invalidate(); clear('disabled'); return; }
    if (!isHealthKitAvailable()) { generation.invalidate(); clear('unavailable'); return; }

    let disposed = false;
    const refresh = () => {
      const request = generation.begin();
      const requestedDate = getTodayString();
      clear('loading');
      const valid = () => !disposed && generation.isCurrent(request);
      const retryForNewDay = () => { if (valid() && getTodayString() !== requestedDate) refresh(); };
      void (async () => {
        const steps = await resolveWithin(readTodayStepCount(), STEP_QUERY_TIMEOUT_MS);
        if (!valid()) return;
        if (getTodayString() !== requestedDate) { retryForNewDay(); return; }
        if (steps === null) { clear('error'); return; }
        const suggestion = deriveActivitySuggestion(steps, new Date().getHours());
        setStepsToday(steps); setSuggestedLevel(suggestion.suggestedLevel);
        setSuggestionEligible(suggestion.suggestionEligible); setStatus('success');
      })().catch(() => { if (valid()) clear('error'); });
    };
    // Midnight clears the day and queries the new daily aggregate. At 18:00 a
    // query also re-evaluates the low-activity threshold without remounting.
    const makeLifecycle = () => createContextRefreshLifecycle({ onBoundary: refresh, boundaries: [[0, 0], [18, 0]] });
    let currentAppState = AppState.currentState;
    let lifecycle: ReturnType<typeof makeLifecycle> | null = null;
    if (currentAppState === 'active') {
      lifecycle = makeLifecycle();
      refresh();
    }
    const subscription = AppState.addEventListener('change', next => {
      const wasActive = currentAppState === 'active';
      currentAppState = next;
      if (next === 'active' && !wasActive) {
        lifecycle ??= makeLifecycle();
        refresh();
      } else if (next !== 'active' && wasActive) {
        generation.invalidate();
        clear('loading');
        lifecycle?.();
        lifecycle = null;
      }
    });
    return () => { disposed = true; generation.invalidate(); lifecycle?.(); subscription.remove(); };
  }, [enabled]);
  return { status, stepsToday, suggestedLevel, suggestionEligible };
}
