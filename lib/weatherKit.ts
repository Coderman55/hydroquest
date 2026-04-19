// HydroQuest — JS weather adapter (Open-Meteo).
//
// Replaces the former expo-weather-kit native adapter. Same public API — only
// the fetch mechanism changed. No API key. No auth. Pure network call.
//
// Caller contract (unchanged):
//   The caller must supply coordinates. This file does NOT request location
//   permission — that remains ProfileEditSheet's responsibility before
//   weatherContextEnabled is set true.

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

// ─── WMO weather code → short condition string ────────────────────────────────
// Open-Meteo returns WMO 4677 codes. We map only the common buckets;
// unmapped codes return null (conditionSummary shows nothing — safe).

const WMO_CONDITION: Record<number, string> = {
  0:  'Clear',
  1:  'Mainly Clear',
  2:  'Partly Cloudy',
  3:  'Overcast',
  45: 'Fog',
  48: 'Freezing Fog',
  51: 'Light Drizzle',
  53: 'Drizzle',
  55: 'Heavy Drizzle',
  61: 'Light Rain',
  63: 'Rain',
  65: 'Heavy Rain',
  71: 'Light Snow',
  73: 'Snow',
  75: 'Heavy Snow',
  80: 'Rain Showers',
  81: 'Rain Showers',
  82: 'Heavy Rain Showers',
  85: 'Snow Showers',
  86: 'Heavy Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm',
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true when weather context is available on this platform.
 * iOS only — mirrors the former WeatherKit platform gate so ProfileEditSheet
 * and useWeatherContext need no changes.
 */
export function isWeatherKitAvailable(): boolean {
  return Platform.OS === 'ios';
}

/**
 * [DEBUG] Always true — the JS fetch path has no native module to load.
 * Kept so useWeatherContext debug state reports cleanly without a code change.
 * Remove with the rest of the debug surface when done.
 */
export function isWeatherKitModuleLoaded(): boolean {
  return true;
}

/**
 * Fetch today's weather for the given coordinates via Open-Meteo.
 *
 * Returns null on any failure so callers degrade gracefully.
 * No API key required. No authentication.
 *
 * @param latitude   Device latitude from expo-location.
 * @param longitude  Device longitude from expo-location.
 */
export async function fetchTodayWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherPayload | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}` +
      `&longitude=${longitude}` +
      `&current=temperature_2m,weathercode` +
      `&daily=temperature_2m_max` +
      `&temperature_unit=fahrenheit` +
      `&forecast_days=1` +
      `&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();

    const forecastHighF: number | undefined = data?.daily?.temperature_2m_max?.[0];
    if (forecastHighF == null) return null;

    const currentTempF: number | null =
      typeof data?.current?.temperature_2m === 'number'
        ? data.current.temperature_2m
        : null;

    const wmoCode: number | undefined = data?.current?.weathercode;
    const conditionSummary: string | null =
      wmoCode != null ? (WMO_CONDITION[wmoCode] ?? null) : null;

    return { forecastHighF, currentTempF, conditionSummary };
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[weatherKit] fetchTodayWeather failed:', e);
    }
    return null;
  }
}
