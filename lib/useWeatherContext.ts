// Ephemeral weather context. It refreshes only while the app is active and is
// never written to a profile or goal.
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';

import { fetchTodayWeather, isWeatherAvailable } from './weather';
import { createContextRefreshLifecycle, createRefreshGeneration, resolveWithin } from './contextRefreshLifecycle';
import { getTodayString } from './dateUtils';
import type { Climate } from '../constants';

export type WeatherStatus = 'disabled' | 'idle' | 'loading' | 'success' | 'denied' | 'unavailable' | 'error';
export type WeatherDebugInfo = {
  permissionStatus: string | null;
  hasCoords: boolean;
  lastError: string | null;
};
export type WeatherContext = {
  status: WeatherStatus;
  detectedClimate: Climate | null;
  currentTempF: number | null;
  conditionSummary: string | null;
  _debug: WeatherDebugInfo;
};

const LOCATION_TIMEOUT_MS = 12_000;
const emptyDebug = (): WeatherDebugInfo => ({ permissionStatus: null, hasCoords: false, lastError: null });
function classifyClimate(high: number): Climate { return high < 60 ? 'cool' : high <= 80 ? 'moderate' : 'hot'; }

export function useWeatherContext(enabled: boolean): WeatherContext {
  const [status, setStatus] = useState<WeatherStatus>(enabled ? 'idle' : 'disabled');
  const [detectedClimate, setDetectedClimate] = useState<Climate | null>(null);
  const [currentTempF, setCurrentTempF] = useState<number | null>(null);
  const [conditionSummary, setConditionSummary] = useState<string | null>(null);
  const [_debug, setDebug] = useState<WeatherDebugInfo>(emptyDebug);
  const generationRef = useRef(createRefreshGeneration());

  useEffect(() => {
    const generation = generationRef.current;
    const clear = (nextStatus: WeatherStatus, error: string | null = null, resetDebug = true) => {
      setDetectedClimate(null); setCurrentTempF(null); setConditionSummary(null);
      if (resetDebug) setDebug({ ...emptyDebug(), lastError: error });
      setStatus(nextStatus);
    };
    if (!enabled) { generation.invalidate(); clear('disabled'); return; }
    if (!isWeatherAvailable()) { generation.invalidate(); clear('unavailable'); return; }

    let disposed = false;
    const refresh = () => {
      const request = generation.begin();
      const requestedDate = getTodayString();
      clear('loading');
      const valid = () => !disposed && generation.isCurrent(request);
      const retryForNewDay = () => {
        if (valid() && getTodayString() !== requestedDate) refresh();
      };
      void (async () => {
        try {
          const permission = await resolveWithin(Location.getForegroundPermissionsAsync(), LOCATION_TIMEOUT_MS);
          if (!valid()) return;
          if (getTodayString() !== requestedDate) { retryForNewDay(); return; }
          if (!permission) { clear('error', 'Location permission check timed out or failed'); return; }
          setDebug(prev => ({ ...prev, permissionStatus: permission.status }));
          if (permission.status !== Location.PermissionStatus.GRANTED) { clear('denied', null, false); return; }
          const location = await resolveWithin(
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), LOCATION_TIMEOUT_MS,
          );
          if (!valid()) return;
          if (getTodayString() !== requestedDate) { retryForNewDay(); return; }
          if (!location) { clear('error', 'Location request timed out or failed'); return; }
          setDebug(prev => ({ ...prev, hasCoords: true }));
          const payload = await fetchTodayWeather(location.coords.latitude, location.coords.longitude);
          if (!valid()) return;
          if (getTodayString() !== requestedDate) { retryForNewDay(); return; }
          if (!payload) { clear('error', 'Weather request failed'); return; }
          setDetectedClimate(classifyClimate(payload.forecastHighF));
          setCurrentTempF(payload.currentTempF); setConditionSummary(payload.conditionSummary); setStatus('success');
        } catch (error) {
          if (valid()) clear('error', `Unexpected: ${String(error)}`);
        }
      })();
    };
    const makeLifecycle = () => createContextRefreshLifecycle({ onBoundary: refresh, boundaries: [[0, 0]] });
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
        clear('idle');
        lifecycle?.();
        lifecycle = null;
      }
    });
    return () => { disposed = true; generation.invalidate(); lifecycle?.(); subscription.remove(); };
  }, [enabled]);
  return { status, detectedClimate, currentTempF, conditionSummary, _debug };
}
