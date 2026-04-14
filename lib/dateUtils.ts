// HydroQuest — Local-calendar date helpers.
// All HydroQuest date logic uses LOCAL calendar time, never UTC.
// This avoids midnight edge-case bugs around new-day detection.

/**
 * Returns the current UTC time as a canonical ISO 8601 timestamp string.
 * Used as the persisted timestamp field on event ledger entries.
 * Example: "2026-04-14T09:32:15.123Z"
 */
export function getUtcIsoTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Returns today's local calendar date as "YYYY-MM-DD".
 */
export function getTodayString(): string {
  const now = new Date();
  return formatLocalDate(now);
}

/**
 * Returns the integer number of calendar days from `from` to `to`.
 * Both inputs must be "YYYY-MM-DD" strings interpreted as local dates.
 *
 * - Same day → 0
 * - `to` is one day after `from` → 1
 * - `to` is earlier than `from` → negative integer
 *
 * Anchored to noon local time on each side to avoid DST cliff bugs
 * (DST transitions never cross noon).
 */
export function getDaysBetween(from: string, to: string): number {
  const fromDate = parseDateString(from);
  const toDate = parseDateString(to);

  const fromNoon = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
    12,
  );
  const toNoon = new Date(
    toDate.getFullYear(),
    toDate.getMonth(),
    toDate.getDate(),
    12,
  );

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((toNoon.getTime() - fromNoon.getTime()) / msPerDay);
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateString(s: string): Date {
  const [year, month, day] = s.split('-').map(Number);
  return new Date(year, month - 1, day);
}
