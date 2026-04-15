// HydroQuest — WeatherKit native adapter.
//
// This is the ONLY file in the project that imports from expo-weather-kit.
// All other files call the plain functions exported here, staying insulated
// from library details.
//
// Non-iOS platforms receive safe no-ops — the native module is loaded lazily
// so it is never initialised on Android/web.
//
// The caller must provide coordinates (latitude, longitude). This file does
// NOT request location permission — that is the responsibility of the UI layer
// (ProfileEditSheet) before the user's weatherContextEnabled preference is set.

import { Platform } from 'react-native';

// ─── Narrow payload — only what Weather v1 needs ──────────────────────────────

export type WeatherPayload = {
  /** Today's forecast high in Fahrenheit. Used for climate bucket classification. */
  forecastHighF: number;
  /** Current temperature in Fahrenheit. Flavor-only — not used for classification. */
  currentTempF: number | null;
  /** Short condition description (e.g. "Clear", "Partly Cloudy"). Flavor-only. */
  conditionSummary: string | null;
};

// ─── Lazy module loader ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _wk: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getModule(): any | null {
  if (Platform.OS !== 'ios') return null;
  if (!_wk) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _wk = require('expo-weather-kit');
  }
  return _wk;
}

// ─── Temperature unit normalisation ───────────────────────────────────────────
// expo-weather-kit reflects the device locale for temperature units.
// Our classification thresholds are in °F, so normalise everything here.

function toFahrenheit(value: number, unitSymbol: string): number {
  if (unitSymbol === '°F') return value;
  // Treat anything that isn't °F as Celsius (the WeatherKit default).
  return value * (9 / 5) + 32;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true when WeatherKit is available on this platform (iOS only).
 * Synchronous. Used by ProfileEditSheet to gate the opt-in toggle.
 */
export function isWeatherKitAvailable(): boolean {
  return Platform.OS === 'ios';
}

/**
 * Fetch today's weather for the given coordinates.
 *
 * Requests only current + daily data. Today's daily entry is `daily[0]`.
 * Returns null on any failure so callers can degrade gracefully.
 *
 * @param latitude   Device latitude from expo-location.
 * @param longitude  Device longitude from expo-location.
 */
export async function fetchTodayWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherPayload | null> {
  const wk = getModule();
  if (!wk) return null;

  try {
    const result = await wk.getWeatherQuery({
      latitude,
      longitude,
      current: true,
      daily: true,
    });

    // daily[0] is always today when no dailyRange is specified.
    const today = result?.daily?.[0];
    if (today == null) return null;

    const forecastHighF = toFahrenheit(
      today.high,
      today.highUnit ?? '°C',
    );

    let currentTempF: number | null = null;
    if (result?.current?.temperature != null) {
      currentTempF = toFahrenheit(
        result.current.temperature,
        result.current.temperatureUnit ?? '°C',
      );
    }

    const conditionSummary: string | null =
      typeof result?.current?.condition === 'string'
        ? result.current.condition
        : null;

    return { forecastHighF, currentTempF, conditionSummary };
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[weatherKit] fetchTodayWeather failed:', e);
    }
    return null;
  }
}
