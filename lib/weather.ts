// HydroQuest — JS weather adapter (Open-Meteo).
//
// No API key or authentication is required.
//
// Caller contract (unchanged):
//   The caller must supply coordinates. This file does NOT request location
//   permission — that remains ProfileEditSheet's responsibility before
//   weatherContextEnabled is set true.

import { Platform } from 'react-native';

// ─── Narrow payload — only what the weather context needs ────────────────────

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

const REQUEST_TIMEOUT_MS = 10_000;
const MIN_REASONABLE_TEMP_F = -150;
const MAX_REASONABLE_TEMP_F = 150;

function isFiniteTemperature(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_REASONABLE_TEMP_F &&
    value <= MAX_REASONABLE_TEMP_F
  );
}

function isValidWmoCode(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true when weather context is available on this platform.
 * iOS only — retained for compatibility with the existing opt-in flow.
 */
export function isWeatherAvailable(): boolean {
  return Platform.OS === 'ios';
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
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data = await res.json();

    const dailyMax = data?.daily?.temperature_2m_max;
    if (!Array.isArray(dailyMax)) return null;
    const forecastHighF: unknown = dailyMax[0];
    if (!isFiniteTemperature(forecastHighF)) return null;

    const rawCurrentTempF: unknown = data?.current?.temperature_2m;
    if (rawCurrentTempF != null && !isFiniteTemperature(rawCurrentTempF)) return null;
    const currentTempF: number | null =
      rawCurrentTempF == null
        ? null
        : rawCurrentTempF;

    const rawWmoCode: unknown = data?.current?.weathercode;
    if (rawWmoCode != null && !isValidWmoCode(rawWmoCode)) return null;
    const wmoCode = isValidWmoCode(rawWmoCode) ? rawWmoCode : null;
    const conditionSummary: string | null =
      wmoCode != null ? (WMO_CONDITION[wmoCode] ?? null) : null;

    return { forecastHighF, currentTempF, conditionSummary };
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[weather] fetchTodayWeather failed:', e);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
