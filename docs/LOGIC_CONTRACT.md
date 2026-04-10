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
4. The formula should use:
   - weight
   - age
   - sex
   - activity level
   - climate
5. The final output is stored as dailyGoalOz.
6. The computed daily goal is set silently and is not user-editable during the MVP.
7. If the user later changes a goal-driving variable that the PM decides should affect the goal, the app may recompute the daily goal.

> **Open question (Flag 2):** The exact formula using these five inputs has not been defined yet. The formula must be agreed on and documented in `lib/` before the hydration store can be implemented. It should output a reasonable oz value in the range of approximately 60–120oz for a typical adult user.

> **Open question (Flag 4):** Climate is a goal input and can be changed daily. It is not yet decided whether a climate change after onboarding should trigger a goal recomputation. This must be resolved before the store is built. The store architecture differs depending on the answer.

---

## 3. Climate behavior
1. Climate is selected manually by the user.
2. Allowed climate values are:
   - cool
   - moderate
   - hot
3. Climate should be understandable through suggested temperature ranges:
   - cool: below 60°F
   - moderate: 60°F to 80°F
   - hot: above 80°F
4. Climate can be changed after onboarding from the main hydration experience.
5. Climate changes are persisted.
6. For MVP simplicity, climate changes do not need a live weather integration.

---

## 4. Main hydration state
1. todayIntakeOz is the total water logged for the current day.
2. draftLogOz is the current amount selected before logging.
3. dailyGoalOz is the user's automatically computed daily hydration target.
4. recommendedGoalOz may be stored separately if useful for debugging or future flexibility.
5. selectedBottleId stores the chosen bottle archetype.
6. bottleColor stores the chosen bottle color.
7. streakCount stores the current streak of successful hydration days.

> **Open question (Flag 5):** Whether `recommendedGoalOz` is always stored or only optionally stored should be decided before the schema is finalized. Recommend always storing it to simplify future debugging and avoid schema drift.

---

## 5. Bottle behavior
1. The bottle visual represents the currently selected log amount, not the full-day total.
2. A full visual bottle corresponds to the maximum selected amount for that interaction.
3. The visual model should support a "draining bottle" concept.
4. When the selected amount is consumed/logged, the bottle can visually drain toward empty.
5. When the bottle empties, the UI may celebrate completion and allow a refill/reset interaction.
6. On Day 2, the store only needs to support this logic concept; polished animation can come later.

> **Open question (Flag 3):** It is not yet specified whether tapping a quick-log button (a) sets `draftLogOz` first and then logs it, or (b) bypasses `draftLogOz` entirely and adds directly to `todayIntakeOz`. This must be decided before building the logging UI. The bottle visual behavior differs between the two models.

---

## 6. Quick-log behavior
1. Quick-log buttons should log common fixed amounts such as 4oz, 16oz, and 32oz.
2. Pressing a quick-log button should add that amount to todayIntakeOz.
3. Quick-log actions should be deterministic and immediate.
4. Quick-log amounts must not corrupt state even if the user is already above goal.
5. Going above goal is allowed.

---

## 7. Custom amount behavior
1. The user may enter a custom amount.
2. The custom amount must be validated before being logged.
3. Invalid custom values should be rejected gracefully.
4. Valid custom amounts are added to todayIntakeOz.
5. The app must not accept nonsense values such as empty input, non-numeric input, zero, or negative numbers.

---

## 8. Goal progress behavior
1. goalPercent is derived from todayIntakeOz divided by dailyGoalOz.
2. remainingOz is derived from dailyGoalOz minus todayIntakeOz, floored at zero for display if desired.
3. Exceeding the goal is allowed and should not break progress calculations.
4. Once the user reaches or exceeds the goal for the day, the user is considered successful for that day.

---

## 9. Streak behavior
1. A streak day counts when the user reaches or exceeds their goal by the end of the local day.
2. If the user misses a day, the streak resets to zero.
3. If the user hits the goal on consecutive days, the streak increments by one per successful day.
4. Exceeding the goal still counts as success.

---

## 10. New-day reset behavior
1. The app should detect when a new local calendar day has started.
2. When a new day begins, todayIntakeOz resets to zero.
3. The app should evaluate whether the previous day counted toward the streak before resetting.
4. Daily values reset; persistent profile data does not.
5. The app must store enough date information to avoid repeating streak updates incorrectly.

> **Implementation risk (Flag 1):** The app has no background process. Streak evaluation and daily reset can only happen when the app is opened. If the user skips a day and opens the app two days later, the app must correctly infer that a day was missed. This requires storing `lastOpenedDate` (or equivalent) so the app can compute the gap on launch. The exact missed-day detection logic must be defined before implementing streak or reset behavior.

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
