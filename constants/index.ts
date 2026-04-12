// HydroQuest — App-wide constants and shared types.
// This file is the single source of vocabulary for the rest of the codebase.
// No logic. No React. Pure data and types.

// ---------- AsyncStorage keys ----------
export const PROFILE_STORE_KEY = '@hydroquest/profile';
export const HYDRATION_STORE_KEY = '@hydroquest/hydration';

// ---------- Schema version (bump on breaking persisted-shape changes) ----------
export const SCHEMA_VERSION = '1';

// ---------- Goal formula bounds ----------
export const DEFAULT_GOAL_OZ = 72; // fallback when calculateGoal receives invalid input
export const GOAL_MIN_OZ = 48;
export const GOAL_MAX_OZ = 160;
export const GOAL_ROUND_TO_OZ = 4;

// ---------- Quick-log amounts ----------
export const QUICK_LOG_AMOUNTS = [4, 16, 32] as const;

// ---------- Bottle archetypes ----------
export const BOTTLE_IDS = ['sport-curve', 'block-tumbler'] as const;
export type BottleId = (typeof BOTTLE_IDS)[number];

export const BOTTLE_CAPACITIES: Record<BottleId, number> = {
  'sport-curve': 24,
  'block-tumbler': 30,
};

// ---------- Bottle colors (placeholder palette for MVP) ----------
export const BOTTLE_COLORS = ['blue', 'green', 'pink'] as const;
export type BottleColor = (typeof BOTTLE_COLORS)[number];

// ---------- Sex ----------
export const SEX_OPTIONS = ['male', 'female', 'other'] as const;
export type Sex = (typeof SEX_OPTIONS)[number];

// ---------- Activity level ----------
export const ACTIVITY_LEVELS = ['low', 'medium', 'high'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

// ---------- Climate ----------
export const CLIMATE_OPTIONS = ['cool', 'moderate', 'hot'] as const;
export type Climate = (typeof CLIMATE_OPTIONS)[number];
