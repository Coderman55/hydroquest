# HydroQuest MVP Logic Contract

## 1. Onboarding completion
1. The app is considered onboarded only when all required onboarding fields are set:
   - age
   - sex
   - weight
   - activity level
   - climate
   - bottle archetype
   - bottle color
2. Once all required onboarding inputs are valid, the app computes a daily hydration goal automatically.
3. After the goal is computed and saved, onboarding is marked complete.
4. On future app opens, if onboardingComplete is true, the app should skip onboarding and open the main hydration experience.

---

## 2. Hydration goal calculation
1. The daily goal is computed automatically from onboarding data.
2. The formula is a simple MVP heuristic, not medical advice.
3. The formula must be deterministic: the same inputs always produce the same goal.
4. The formula uses: weight (in pounds), age, sex, activity level, and climate.
5. Both `recommendedGoalOz` and `dailyGoalOz` are always stored. In the MVP they will always match.
6. The computed daily goal is set silently and is not user-editable during the MVP.
7. Climate is a goal-driving variable. Changing climate after onboarding triggers an immediate recomputation of `dailyGoalOz` for the current day (see §3).

### Locked MVP Formula

```
baseOz         = weightLb × 0.5

sexAdjOz:
  male               → +8
  female             → +0
  other/prefer not   → +4

ageAdjOz:
  under 18           → -8
  18–34              → +0
  35–54              → +4
  55+                → +8

activityAdjOz:
  low                → +0
  medium             → +8
  high               → +16

climateAdjOz:
  cool               → +0
  moderate           → +6
  hot                → +12

total = baseOz + sexAdjOz + ageAdjOz + activityAdjOz + climateAdjOz
recommendedGoalOz = round(total to nearest 4oz)
recommendedGoalOz = clamp(recommendedGoalOz, min: 48, max: 160)
dailyGoalOz = recommendedGoalOz
```

This formula is implemented in `lib/calculateGoal.ts` and must not be duplicated elsewhere.

---

## 3. Climate behavior
1. Climate is selected manually by the user.
2. Allowed climate values are:
   - cool
   - moderate
   - hot
3. Suggested temperature ranges for user understanding:
   - cool: below 60°F
   - moderate: 60°F to 80°F
   - hot: above 80°F
4. Climate can be changed after onboarding from the main hydration experience.
5. Climate changes are persisted.
6. When the user changes climate, `dailyGoalOz` is recomputed immediately using the locked formula with the new climate value.
7. A climate change does not retroactively change `todayIntakeOz`.
8. A climate change does not retroactively change `streakCount` or `lastGoalHitDate`.
9. A climate change only affects the current day's goal target and therefore the derived `remainingOz`.
10. No live location or weather API is required for MVP.

---

## 4. Main hydration state
1. `todayIntakeOz` — total water logged for the current day.
2. `draftLogOz` — the amount currently selected before logging; used by the bottle visual and the slider/custom flow. Starts at `0` on first load and after a new-day reset. `0` is a sentinel meaning "nothing selected yet / empty bottle." All positive values represent a user-selected amount.
3. `dailyGoalOz` — the user's automatically computed daily hydration target.
4. `recommendedGoalOz` — always stored; equals `dailyGoalOz` in the MVP; kept separate for schema stability and future flexibility.
5. `selectedBottleId` — the chosen bottle archetype.
6. `bottleColor` — the chosen bottle color.
7. `streakCount` — the current streak of consecutive successful hydration days.
8. `lastOpenedDate` — local calendar date string (YYYY-MM-DD) of the last app open; used for new-day detection and reset.
9. `lastGoalHitDate` — local calendar date string (YYYY-MM-DD) of the last day the user reached or exceeded their goal; used for streak evaluation.

---

## 5. Bottle behavior

### Locked bottle capacities (MVP)
| Archetype | Capacity |
|---|---|
| Sport Curve | 24 oz |
| Block Tumbler | 30 oz |

These values are constants, not user-editable. They define the visual scale of each bottle archetype.

### Fill level math
```
selectedBottleCapacityOz = capacity of selectedBottleId (constant above)
bottleFillPercent = min(draftLogOz / selectedBottleCapacityOz, 1.0)
```

- If `draftLogOz` is below bottle capacity, the bottle shows a proportional fill.
- If `draftLogOz` equals or exceeds bottle capacity, the bottle shows as visually full (capped at 1.0).
- The exact selected ounce amount is always shown in text regardless of fill level.
- There is no multi-bottle or overflow visualization in the MVP.
- If `draftLogOz` is `0`, the bottle shows empty (fill = 0).

### Behavior rules
1. The bottle visual represents `draftLogOz`, not the full-day total.
2. The visual model supports a "draining bottle" concept.
3. When the selected amount is logged, the bottle can visually drain toward empty.
4. When the bottle empties, the UI may celebrate completion and allow a refill/reset interaction.
5. On Day 2, the store only needs to support this logic concept; polished animation can be implemented later.

---

## 6. Quick-log behavior
1. Quick-log buttons log common fixed amounts such as 4oz, 16oz, and 32oz.
2. All logging — from any input method — goes through a single `logWater(amountOz)` action.
3. Pressing a quick-log button:
   - calls `logWater(amountOz)` immediately, adding that amount to `todayIntakeOz`
   - also sets `draftLogOz = amountOz` so the bottle UI reflects the last selected amount
4. Quick-log actions are deterministic and immediate. No confirmation step required.
5. Quick-log amounts must not corrupt state even if the user is already above goal.
6. Going above goal is allowed.

---

## 7. Slider and custom amount behavior
1. The slider is always visible on the main hydration screen. It is not hidden behind a "custom" button.
2. The slider and any manual numeric input update `draftLogOz` only. They do not log water immediately.
3. A separate confirm/log action (e.g. a "Log" button) calls `logWater(draftLogOz)` to commit the amount.
4. Custom amount is not a saved setting. It resets to `0` on new-day reset and is not persisted.
5. The user can update the selected amount at any time during the session by adjusting the slider or typing a value.
6. If practical in a future UI iteration, the ounce label may be tap-to-type for precise numeric entry. For Day 2, a simple numeric input field is acceptable.
7. Before calling `logWater(draftLogOz)` from the confirm action, the current `draftLogOz` must be validated: it must be a finite number greater than zero. If invalid, the log is rejected and no state changes.
8. The app must not accept custom values of zero, negative numbers, non-numeric input, NaN, or non-finite values.
9. There is no upper cap enforced in the store for custom log amounts — a single large entry is allowed. The goal cap applies to the daily target, not individual entries.

---

## 8. Goal progress behavior
1. goalPercent is derived from todayIntakeOz divided by dailyGoalOz.
2. remainingOz is derived from dailyGoalOz minus todayIntakeOz, floored at zero for display if desired.
3. Exceeding the goal is allowed and should not break progress calculations.
4. Once the user reaches or exceeds the goal for the day, the user is considered successful for that day.

---

## 9. Streak behavior
1. A streak day counts when the user reaches or exceeds their goal on a given local calendar day.
2. If the user misses a day, the streak resets to zero.
3. If the user hits the goal on consecutive days, the streak increments by one per successful day.
4. Exceeding the goal still counts as success.
5. `streakCount` is initialized to `0` after onboarding completes. It increments only when the user actually reaches or exceeds the goal for the first time on a local calendar day.
6. **Streak increments immediately on success** — the moment `todayIntakeOz >= dailyGoalOz` and `lastGoalHitDate != today`:
   - increment `streakCount` by 1
   - set `lastGoalHitDate = today`
   - this ensures the streak is always current and does not wait for the next app open
7. Subsequent logs on the same day after the goal is already hit do not increment the streak again (enforced by the `lastGoalHitDate != today` guard).

---

## 10. New-day reset behavior
The app has no background process. All date logic runs on app open only.

### On every app open, run this exact sequence:

```
today = local calendar date string (YYYY-MM-DD)
daysSinceLastOpen = calendar days between lastOpenedDate and today

if daysSinceLastOpen == 0:
  → do nothing (same session or same day re-open)

if daysSinceLastOpen == 1:
  → if lastGoalHitDate == lastOpenedDate:
      keep streakCount as-is (yesterday was a success, already counted)
    else:
      set streakCount = 0 (yesterday was missed)
  → reset todayIntakeOz = 0
  → recompute dailyGoalOz using current profile + climate
  → set lastOpenedDate = today

if daysSinceLastOpen > 1:
  → set streakCount = 0 (one or more days were skipped)
  → reset todayIntakeOz = 0
  → recompute dailyGoalOz using current profile + climate
  → set lastOpenedDate = today
```

Additional rules:
1. Daily values reset (`todayIntakeOz`, `draftLogOz` → `0`); persistent profile data does not.
2. `lastOpenedDate` is always updated to today after the check runs.
3. On the very first app open (no `lastOpenedDate` stored), treat as a fresh state — no streak evaluation needed.
4. Date strings must use local calendar time, not UTC, to avoid midnight edge-case bugs.
5. **Goal recomputation on new-day open is the canonical daily refresh.** When `runNewDayCheck()` fires on a new day, it always calls `calculateGoal()` with the current stored profile and climate. This is not a behavior change — it simply ensures the current day's goal reflects the user's stored climate preference. It does not override any streak history or intake from the day just ended.

---

## 11. Persistence behavior
1. Onboarding/profile data persists across app restarts.
2. Hydration data for the current day persists across app restarts.
3. Streak data persists across app restarts.
4. Temporary UI state does not need to persist unless explicitly useful.
5. The persisted store should include a schemaVersion field for future migration safety.

---

## 12. Error-handling behavior
1. Invalid onboarding inputs should not complete onboarding.
2. Invalid custom hydration inputs should not update intake.
3. Missing required data should block completion of onboarding.
4. The app should prefer simple safeguards over complex recovery logic.
5. The app should fail predictably and visibly during development rather than silently corrupting state.

### draftLogOz validity rules
6. `draftLogOz = 0` is valid only as the initial/cleared sentinel state. It is set to `0` on first load and on new-day reset. It must not be set to `0` through normal user interaction.
7. `setDraftLog(amountOz)` must accept `0` only when called explicitly for initialization or clear (e.g. during new-day reset). In all other call sites it should only be called with a positive value.
8. If `setDraftLog` is called with a negative number, `NaN`, or a non-finite value from a user interaction path, the call must be rejected and `draftLogOz` must remain unchanged.

### logWater validity rules
9. `logWater(amountOz)` must reject any call where `amountOz` is `0`, negative, `NaN`, or non-finite. On rejection, `todayIntakeOz` must not change, `draftLogOz` must not change, and no streak evaluation must run.
10. Quick-log buttons use hardcoded positive values and will never produce an invalid call under normal conditions, but the action-level guard must still exist.
