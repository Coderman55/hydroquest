// HydroQuest — Apple Health adapter.
//
// This is the ONLY file in the project that imports from
// @kingstinct/react-native-healthkit. All other files call the
// plain functions exported here, staying insulated from library details.
//
// Non-iOS platforms and devices without HealthKit receive safe no-ops.
// The native module is loaded lazily on first iOS use so it is never
// initialised on Android/web, preventing native-module-init errors.

import { Platform } from 'react-native';

// ─── Internal constants ────────────────────────────────────────────────────────

const WATER_IDENTIFIER = 'HKQuantityTypeIdentifierDietaryWater' as const;
// 'fl_oz_us' is the UnitOfVolume string for US fluid ounces in this library.
const WATER_UNIT = 'fl_oz_us' as const;

const STEP_IDENTIFIER = 'HKQuantityTypeIdentifierStepCount' as const;
const STEP_UNIT = 'count' as const;

// ─── Lazy module loader ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _hk: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getModule(): any | null {
  if (Platform.OS !== 'ios') return null;
  if (!_hk) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _hk = require('@kingstinct/react-native-healthkit');
  }
  return _hk;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if HealthKit is available on this device.
 * Synchronous. Returns false on non-iOS or if the call throws.
 */
export function isHealthKitAvailable(): boolean {
  const hk = getModule();
  if (!hk) return false;
  try {
    return hk.isHealthDataAvailable() === true;
  } catch {
    return false;
  }
}

/**
 * Request HealthKit write-only authorization for dietary water.
 *
 * Returns true if authorization was granted (or was already granted).
 * Returns false on denial, unavailability, or any thrown error.
 *
 * Apple's system sheet may not appear if the user already acted on this
 * request — that is expected behaviour, not a bug.
 */
export async function requestHealthKitAuthorization(): Promise<boolean> {
  const hk = getModule();
  if (!hk) return false;
  try {
    return await hk.requestAuthorization({
      toShare: [WATER_IDENTIFIER],
      toRead: [],
    });
  } catch {
    return false;
  }
}

/**
 * Write a single dietary-water sample to Apple Health.
 *
 * @param amountOz   The volume in fluid ounces.
 * @param isoTimestamp  UTC ISO 8601 string from the drink event.
 * @returns  The HealthKit sample UUID on success, or null on failure.
 *           The UUID is stored on the DrinkEvent for deletion on undo.
 */
export async function writeDrinkSample(
  amountOz: number,
  isoTimestamp: string,
): Promise<string | null> {
  const hk = getModule();
  if (!hk) return null;
  try {
    const date = new Date(isoTimestamp);
    const sample = await hk.saveQuantitySample(
      WATER_IDENTIFIER,
      WATER_UNIT,
      amountOz,
      date,
      date,
    );
    // sample is QuantitySampleTyped which extends BaseObject { uuid: string }.
    // On non-iOS the stub returns undefined; we guard with typeof check.
    return typeof sample?.uuid === 'string' ? sample.uuid : null;
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[healthKit] writeDrinkSample failed:', e);
    }
    return null;
  }
}

/**
 * Delete a previously-written Apple Health water sample by its UUID.
 * Called by undoLastAction when the undone drink event has an hkSampleUuid.
 *
 * Failure is logged in DEV and silently swallowed — the caller must always
 * complete its local undo regardless of whether this deletion succeeds.
 */
export async function deleteDrinkSample(hkSampleUuid: string): Promise<void> {
  const hk = getModule();
  if (!hk) return;
  try {
    // FilterForSamplesBase exposes `uuid?: string` for single-sample deletion.
    await hk.deleteObjects(WATER_IDENTIFIER, { uuid: hkSampleUuid });
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[healthKit] deleteDrinkSample failed:', e);
    }
  }
}

/**
 * Request HealthKit read-only authorization for step count.
 *
 * Called by ProfileEditSheet when the user enables the activity-context toggle.
 * Uses a separate requestAuthorization call so write-water and read-steps
 * consents remain independent — the user can enable one without the other.
 *
 * Returns true if authorization was granted (or was already granted).
 */
export async function requestHealthKitActivityAuthorization(): Promise<boolean> {
  const hk = getModule();
  if (!hk) return false;
  try {
    return await hk.requestAuthorization({
      toShare: [],
      toRead: [STEP_IDENTIFIER],
    });
  } catch {
    return false;
  }
}

/**
 * Read today's cumulative step count from Apple Health.
 *
 * Time range: midnight local time → now.
 * Returns the integer step total, or 0 if no samples exist yet today.
 * Returns null only on an unexpected error — callers should treat null as
 * a signal to degrade silently rather than show an error state.
 */
export async function readTodayStepCount(): Promise<number | null> {
  const hk = getModule();
  if (!hk) return null;
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const result = await hk.queryStatisticsForQuantity(
      STEP_IDENTIFIER,
      ['cumulativeSum'],
      {
        filter: {
          date: {
            startDate: startOfToday,
            endDate: now,
          },
        },
        unit: STEP_UNIT,
      },
    );

    const raw = result?.sumQuantity?.quantity;
    // No samples recorded today returns undefined sumQuantity — treat as 0.
    return typeof raw === 'number' ? Math.round(raw) : 0;
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[healthKit] readTodayStepCount failed:', e);
    }
    return null;
  }
}
