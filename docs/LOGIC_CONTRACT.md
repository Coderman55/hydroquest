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
baseOz         = weightLb × 0.40

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
  medium             → +4
  high               → +8

climateAdjOz:
  cool               → +0
  moderate           → +4
  hot                → +8

total = baseOz + sexAdjOz + ageAdjOz + activityAdjOz + climateAdjOz
recommendedGoalOz = round(total to nearest 4oz, midpoint ties go down)
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
2. `bottleLevelOz` — committed ounces currently left in the digital bottle. `null` = treat as full (first launch / migrated old installs). Persisted. NOT reset on new-day — the digital bottle persists across midnight.
3. `dailyGoalOz` — the user's automatically computed daily hydration target.
4. `recommendedGoalOz` — always stored; equals `dailyGoalOz` in the MVP; kept separate for schema stability and future flexibility.
5. `selectedBottleId` — the chosen bottle archetype.
6. `bottleColor` — the chosen bottle color.
7. `streakCount` — the current streak of consecutive successful hydration days.
8. `lastOpenedDate` — local calendar date string (YYYY-MM-DD) of the last app open; used for new-day detection and reset.
9. `lastGoalHitDate` — local calendar date string (YYYY-MM-DD) of the last day the user reached or exceeded their goal; used for streak evaluation.
10. `lastAction` — ephemeral (not persisted). Holds the most recent committed action for one-level undo. `null` = nothing to undo this session. Cleared on cold start and new-day reset. See §13.

---

## 5. Bottle behavior

### Locked bottle capacities (MVP)
| Archetype | Capacity |
|---|---|
| Sport Curve | 24 oz |
| Block Tumbler | 30 oz |

These values are constants, not user-editable. They define the visual scale of each bottle archetype.

### Fill level math (reverse-fill model)
```
selectedBottleCapacityOz = capacity of selectedBottleId (constant above)
committedBottleLevelOz   = min(bottleLevelOz ?? selectedBottleCapacityOz, selectedBottleCapacityOz)
bottleFillPercent        = min(draftBottleLevelOz / selectedBottleCapacityOz, 1.0)
```

- `bottleLevelOz` is the committed level stored in the hydration store.
- `draftBottleLevelOz` is local UI state set by the slider. The bottle previews the draft before confirm.
- `null` bottle level is treated as full capacity (first launch / migrated install safety).
- If the user's stored level exceeds current bottle capacity (e.g., after changing archetype), it is clamped at the UI layer to `selectedBottleCapacityOz`.
- There is no multi-bottle or overflow visualization in the MVP.

### Behavior rules
1. The bottle represents **how much water is left**, not how much has been consumed or selected to log.
2. The slider sets the **draft remaining level** before confirm. The bottle previews the draft position.
3. On CTA confirm: `consumedOz = committedBottleLevelOz - draftBottleLevelOz` is logged, then `bottleLevelOz` is updated to `draftBottleLevelOz`.
4. Refill resets `bottleLevelOz` to full capacity. It does not add to `todayIntakeOz`.
5. `bottleLevelOz` is NOT reset on new-day. The digital bottle persists across midnight.
6. Upward draft movement (slider above committed level) previews but cannot be committed through the CTA. The CTA is disabled when `consumedOz <= 0`.

---

## 6. Quick-log behavior
Quick-log buttons were removed in the Day 9 alpha revision. They were incompatible with the reverse-fill mechanic because they called `logWater()` directly without modifying `bottleLevelOz`, which would create an incoherent state where intake rises without the bottle visually changing.

All logging now goes through the reverse-fill CTA flow: slider → confirm → `logWater(consumed)` + `setBottleLevel(draft)`.

---

## 7. Slider and CTA behavior (reverse-fill model)
1. The slider is always visible on the main hydration screen.
2. The slider sets `draftBottleLevelOz` — local UI state only. No store write during drag.
3. Slider range: `[0, selectedBottleCapacityOz]`. The maximum is always the current bottle's capacity.
4. The CTA computes `consumedOz = committedBottleLevelOz - draftBottleLevelOz` and calls `logWater(consumedOz)` followed by `setBottleLevel(draftBottleLevelOz)`.
5. The CTA is disabled when `consumedOz <= 0` (i.e., when the draft is at or above the committed level).
6. Upward draft movement before confirm is allowed as a preview but cannot be committed through the CTA.
7. `draftBottleLevelOz` resets to `committedBottleLevelOz` whenever committed level or bottle capacity changes (via `useEffect`).
8. There is no upper cap on consumed ounces in the store — the goal cap applies to the daily target, not individual entries.

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
1. `todayIntakeOz` resets to `0` on new day; persistent profile data does not.
2. `lastAction` is cleared to `null` on new day.
3. `bottleLevelOz` is **NOT** reset on new day — the digital bottle persists across midnight.
4. `lastOpenedDate` is always updated to today after the check runs.
5. On the very first app open (no `lastOpenedDate` stored), treat as a fresh state — no streak evaluation needed.
6. Date strings must use local calendar time, not UTC, to avoid midnight edge-case bugs.
7. **Goal recomputation on new-day open is the canonical daily refresh.** When `runNewDayCheck()` fires on a new day, it always calls `calculateGoal()` with the current stored profile and climate. It does not override any streak history or intake from the day just ended.

---

## 11. Persistence behavior
1. Onboarding/profile data persists across app restarts.
2. Hydration data for the current day persists across app restarts.
3. Streak data persists across app restarts.
4. `bottleLevelOz` persists across app restarts and across midnight.
5. Temporary UI state does not need to persist unless explicitly useful.
6. `lastAction` is NOT persisted — the undo token is session-only and cleared on cold start.
7. The persisted store should include a schemaVersion field for future migration safety.

---

## 12. Error-handling behavior
1. Invalid onboarding inputs should not complete onboarding.
2. Invalid custom hydration inputs should not update intake.
3. Missing required data should block completion of onboarding.
4. The app should prefer simple safeguards over complex recovery logic.
5. The app should fail predictably and visibly during development rather than silently corrupting state.

### setBottleLevel validity rules
6. `setBottleLevel(oz)` accepts `0` and positive finite values. It rejects negative, NaN, or non-finite values.
7. Callers must pass an already-normalized value; the action does not clamp to capacity.

### logWater validity rules
8. `logWater(amountOz)` must reject any call where `amountOz` is `0`, negative, `NaN`, or non-finite. On rejection, `todayIntakeOz` must not change and no streak evaluation must run.
9. The CTA computes `consumedOz` before calling `logWater`. The `consumedOz <= 0` guard in the UI prevents the invalid path from reaching the store in normal use, but the store-level guard must still exist.

---

## 13. Undo-last-action behavior

1. **One-level only.** Only the most recent committed action (drink or refill) is undoable. There is no history model and no multi-step undo.
2. **Action token.** `lastAction` is a discriminated union (`'drink'` | `'refill'`) that captures the exact pre-action snapshot before any mutation. Each new committed action overwrites the previous token. Calling `undoLastAction` when `lastAction` is `null` is a no-op.
3. **Session-only / non-persisted.** `lastAction` is excluded from persistence via `partialize`. It is `null` on cold start and after any new-day reset. A user who closes and reopens the app loses the undo token; this is expected and intentional.
4. **Token is cleared by:** using undo, making a new drink or refill (overwrites), app restart, new-day reset, and `resetHydration`.
5. **Drink undo.** Restores the exact pre-action snapshot: `todayIntakeOz`, `streakCount`, `lastGoalHitDate`, and `bottleLevelOz`. No rollback logic is derived after the fact — the full prior state was captured before the mutation.
6. **Refill undo.** Restores `bottleLevelOz` to the value before the refill. Does not touch `todayIntakeOz`, `streakCount`, or `lastGoalHitDate` — refill never changed them.
7. **Bottle level after undo.** `undoLastAction` restores `bottleLevelOz` from the snapshot. HomeScreen's `useEffect` then syncs `draftBottleLevelOz` to the restored committed level.
8. **Streak display.** When `streakCount === 0`, the streak display is hidden entirely. It appears once the user earns their first successful day.
