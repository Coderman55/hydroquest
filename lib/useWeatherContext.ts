// HydroQuest — Ephemeral weather context hook.
//
// Fetches once on mount (or when enabled flips to true).
// Never persisted — stale weather context is worse than no context.
// No store writes. No automatic climate or goal changes.
//
// Permission contract:
//   Permission is requested by ProfileEditSheet as part of the opt-in flow.
//   This hook only CHECKS whether permission is already granted.
//   If permission has been revoked since opt-in, status returns 'denied'
//   and the app degrades gracefully without re-prompting.

import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

import { fetchTodayWeather, isWeatherKitAvailable } from './weatherKit';
import type { Climate } from '../constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WeatherStatus =
  | 'disabled'      // weatherContextEnabled is false — do not fetch
  | 'idle'          // enabled but fetch not yet started
  | 'loading'       // fetch in progress
  | 'success'       // fetch succeeded — weather state is populated
  | 'denied'        // location permission not granted — degrade silently
  | 'unavailable'   // non-iOS platform or WeatherKit not available
  | 'error';        // location or weather fetch threw — degrade silently

export type WeatherContext = {
  status: WeatherStatus;
  /** Climate bucket classified from today's forecast high. null when unavailable. */
  detectedClimate: Climate | null;
  /** Current temperature in °F. Flavor-only. null when unavailable. */
  currentTempF: number | null;
  /** Short condition string (e.g. "Clear", "Partly Cloudy"). Flavor-only. */
  conditionSummary: string | null;
};

// ─── Classification ───────────────────────────────────────────────────────────
// Uses the locked thresholds from the HydroQuest climate model.
// forecastHighF < 60   → 'cool'
// forecastHighF <= 80  → 'moderate'
// forecastHighF > 80   → 'hot'

function classifyClimate(forecastHighF: number): Climate {
  if (forecastHighF < 60) return 'cool';
  if (forecastHighF <= 80) return 'moderate';
  return 'hot';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns ephemeral weather context for the current session.
 *
 * @param enabled  Pass `weatherContextEnabled` from the profile store.
 *                 When false, returns immediately with status 'disabled'.
 */
export function useWeatherContext(enabled: boolean): WeatherContext {
  const [status, setStatus] = useState<WeatherStatus>(
    enabled ? 'idle' : 'disabled',
  );
  const [detectedClimate, setDetectedClimate] = useState<Climate | null>(null);
  const [currentTempF, setCurrentTempF]       = useState<number | null>(null);
  const [conditionSummary, setConditionSummary] = useState<string | null>(null);

  useEffect(() => {
    // ── Disabled path ───────────────────────────────────────────────────────
    if (!enabled) {
      setStatus('disabled');
      setDetectedClimate(null);
      setCurrentTempF(null);
      setConditionSummary(null);
      return;
    }

    // ── Platform guard ──────────────────────────────────────────────────────
    if (!isWeatherKitAvailable()) {
      setStatus('unavailable');
      return;
    }

    let cancelled = false;

    async function fetchWeather() {
      try {
        setStatus('loading');

        // Check permission — do NOT request it; that is ProfileEditSheet's job.
        const { status: locStatus } =
          await Location.getForegroundPermissionsAsync();

        if (locStatus !== Location.PermissionStatus.GRANTED) {
          if (!cancelled) setStatus('denied');
          return;
        }

        // Get current position at city-level accuracy — sufficient for weather.
        let latitude: number;
        let longitude: number;
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          latitude  = loc.coords.latitude;
          longitude = loc.coords.longitude;
        } catch {
          if (!cancelled) setStatus('error');
          return;
        }

        const payload = await fetchTodayWeather(latitude, longitude);

        if (cancelled) return;

        if (!payload) {
          setStatus('error');
          return;
        }

        setDetectedClimate(classifyClimate(payload.forecastHighF));
        setCurrentTempF(payload.currentTempF);
        setConditionSummary(payload.conditionSummary);
        setStatus('success');
      } catch (err) {
        // Safety net — catches any unexpected synchronous throw (e.g. native
        // module unavailable) so status never hangs at 'loading' indefinitely.
        if (!cancelled) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[useWeatherContext] fetchWeather threw unexpectedly:', err);
          }
          setStatus('error');
        }
      }
    }

    fetchWeather();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { status, detectedClimate, currentTempF, conditionSummary };
}
