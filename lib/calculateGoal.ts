// HydroQuest — Locked MVP goal formula.
// Pure function. No React, no side effects, no I/O.
// Implements the formula from docs/LOGIC_CONTRACT.md §2.

import {
  DEFAULT_GOAL_OZ,
  GOAL_MIN_OZ,
  GOAL_MAX_OZ,
  GOAL_ROUND_TO_OZ,
  type Sex,
  type ActivityLevel,
  type Climate,
} from '../constants';

export type GoalInputs = {
  weightLb: number | null;
  age: number | null;
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
  climate: Climate | null;
};

export type GoalResult = {
  recommendedGoalOz: number;
  dailyGoalOz: number;
};

function isValidNumber(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function getSexAdjOz(sex: Sex): number {
  switch (sex) {
    case 'male':
      return 8;
    case 'female':
      return 0;
    case 'other':
      return 4;
  }
}

function getAgeAdjOz(age: number): number {
  if (age < 18) return -8;
  if (age <= 34) return 0;
  if (age <= 54) return 4;
  return 8;
}

function getActivityAdjOz(activity: ActivityLevel): number {
  switch (activity) {
    case 'low':
      return 0;
    case 'medium':
      return 4;
    case 'high':
      return 8;
  }
}

function getClimateAdjOz(climate: Climate): number {
  switch (climate) {
    case 'cool':
      return 0;
    case 'moderate':
      return 4;
    case 'hot':
      return 8;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToNearest(value: number, step: number): number {
  const lower = Math.floor(value / step) * step;
  const upper = lower + step;
  // Use the upper bucket only when it is strictly closer. Ties go to lower.
  return (upper - value) < (value - lower) ? upper : lower;
}

export function calculateGoal(inputs: GoalInputs): GoalResult {
  const { weightLb, age, sex, activityLevel, climate } = inputs;

  // Validate all inputs. If any are missing or invalid, return the safe fallback.
  if (
    !isValidNumber(weightLb) ||
    !isValidNumber(age) ||
    sex === null ||
    activityLevel === null ||
    climate === null
  ) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[calculateGoal] Invalid inputs, using fallback', inputs);
    }
    return {
      recommendedGoalOz: DEFAULT_GOAL_OZ,
      dailyGoalOz: DEFAULT_GOAL_OZ,
    };
  }

  // After this point, TypeScript narrows: weightLb/age are number, enums are non-null.
  const baseOz = weightLb * 0.4;
  const total =
    baseOz +
    getSexAdjOz(sex) +
    getAgeAdjOz(age) +
    getActivityAdjOz(activityLevel) +
    getClimateAdjOz(climate);

  const rounded = roundToNearest(total, GOAL_ROUND_TO_OZ);
  const clamped = clamp(rounded, GOAL_MIN_OZ, GOAL_MAX_OZ);

  return {
    recommendedGoalOz: clamped,
    dailyGoalOz: clamped,
  };
}
