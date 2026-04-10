# HydroQuest — Day 2 QA Checklist

Run these tests on a physical iPhone in Expo Go.
Use the debug harness in `App.tsx`.
Sample profile used throughout: age 30, male, 160 lb, medium activity.

---

## A. App launch and loading guard

- [ ] A1. First-ever launch shows `Loading stores…` briefly, then the onboarding panel.
- [ ] A2. No red error screen on launch.
- [ ] A3. No errors in the Metro/Expo terminal.

---

## B. Onboarding — invalid input rejection

- [ ] B1. Tap **COMPLETE ONBOARDING** with no fields filled → error message shown, `onboardingComplete` stays `false`.
- [ ] B2. Fill age and weight only (leave sex/activity/climate/bottle/color blank) → completion rejected, error shown.
- [ ] B3. Enter age `0` or a letter → completion rejected with "Age must be a positive number."
- [ ] B4. Enter weight `0` or a letter → completion rejected with "Weight must be a positive number."
- [ ] B5. Fill all 7 fields, tap **COMPLETE ONBOARDING** → main debug panel appears immediately.

---

## C. Goal formula verification

After completing onboarding with: age 30, male, 160 lb, medium activity, **moderate** climate:

```
base 80 + sex +8 + age +0 + activity +8 + climate +6 = 102 → rounded to 104
```

- [ ] C1. `dailyGoalOz` = 104
- [ ] C2. `recommendedGoalOz` = 104 (matches `dailyGoalOz`)
- [ ] C3. `todayIntakeOz` = 0
- [ ] C4. `streakCount` = 0
- [ ] C5. `draftLogOz` = 0

---

## D. Persistence — force-close and reopen

- [ ] D1. Force-quit Expo Go completely. Reopen and scan QR.
- [ ] D2. Main debug panel appears directly (onboarding is not shown again).
- [ ] D3. `dailyGoalOz`, `todayIntakeOz`, `streakCount`, `lastOpenedDate` all match values from before close.
- [ ] D4. `draftLogOz` = 0 after reopen (ephemeral — must not be persisted).
- [ ] D5. `onboardingComplete` = true (persisted correctly).

---

## E. Quick-log

- [ ] E1. Tap **16 oz** → `todayIntakeOz` increases by exactly 16, `draftLogOz` becomes 16.
- [ ] E2. Tap **4 oz** → `todayIntakeOz` increases by exactly 4, `draftLogOz` becomes 4.
- [ ] E3. Tap **32 oz** → `todayIntakeOz` increases by exactly 32, `draftLogOz` becomes 32.
- [ ] E4. Tapping any quick-log button does not require a confirmation step — state updates instantly.
- [ ] E5. `goalPercent` and `remainingOz` update correctly after each log.
- [ ] E6. Logging when already above goal does not corrupt `todayIntakeOz` or any other field.

---

## F. Draft-only (no log)

- [ ] F1. Tap **32** under SET DRAFT ONLY → `draftLogOz` = 32, `todayIntakeOz` unchanged.
- [ ] F2. For Sport Curve (24 oz capacity): `bottleFillPercent` = 100.0% when draft ≥ 24.
- [ ] F3. For Sport Curve: set draft to 12 → `bottleFillPercent` = 50.0%.
- [ ] F4. Tap **0 (clear)** → `draftLogOz` = 0, `bottleFillPercent` = 0.0%, `todayIntakeOz` unchanged.

---

## G. Custom log (slider path)

- [ ] G1. Type `20` in the custom field, tap **Log** → `todayIntakeOz` increases by 20, field clears.
- [ ] G2. Type `0`, tap **Log** → nothing changes (rejected).
- [ ] G3. Leave the field empty, tap **Log** → nothing changes (rejected).
- [ ] G4. Type `abc`, tap **Log** → nothing changes (rejected).
- [ ] G5. Type `-5`, tap **Log** → nothing changes (rejected).
- [ ] G6. Type `200` (above daily goal), tap **Log** → accepted, `todayIntakeOz` increases by 200.

---

## H. Climate change → goal recompute

Starting from the sample profile (104 oz goal, moderate climate):

- [ ] H1. Tap **hot** → `dailyGoalOz` updates to 108 (`+6` climate delta, re-rounded: 102 → 108... verify: 80+8+0+8+12=108).
- [ ] H2. `todayIntakeOz` is unchanged after climate change.
- [ ] H3. `streakCount` is unchanged after climate change.
- [ ] H4. `lastGoalHitDate` is unchanged after climate change.
- [ ] H5. `recommendedGoalOz` also updates to match new `dailyGoalOz`.
- [ ] H6. Tap **cool** → `dailyGoalOz` updates to 96 (80+8+0+8+0=96).
- [ ] H7. Tap **moderate** → `dailyGoalOz` returns to 104.
- [ ] H8. Force-close and reopen → climate change persists; `dailyGoalOz` reflects last-selected climate.

---

## I. Streak — increment on goal hit

- [ ] I1. `streakCount` = 0 immediately after completing onboarding.
- [ ] I2. Log enough water to reach `dailyGoalOz` (e.g. tap 16 oz repeatedly).
- [ ] I3. At the exact moment `todayIntakeOz >= dailyGoalOz`, `streakCount` becomes 1.
- [ ] I4. `lastGoalHitDate` is set to today's date string (YYYY-MM-DD).
- [ ] I5. Log more water after goal is hit → `streakCount` stays at 1 (no double-increment).
- [ ] I6. `todayIntakeOz` continues to increase above goal without breaking any field.

---

## J. New-day reset — streak preserved (goal was hit)

Setup: hit the daily goal so `streakCount` = 1 and `lastGoalHitDate` = today.

- [ ] J1. Tap **Simulate New Day** → both `lastOpenedDate` and `lastGoalHitDate` are shifted back 1 day, then `runNewDayCheck` fires.
- [ ] J2. `todayIntakeOz` resets to 0.
- [ ] J3. `draftLogOz` resets to 0.
- [ ] J4. `streakCount` stays at 1 (yesterday was a success).
- [ ] J5. `dailyGoalOz` is recomputed (same value unless climate changed).
- [ ] J6. `lastOpenedDate` = today's date.

---

## K. New-day reset — streak reset (goal was not hit)

Setup: log a small amount (e.g. 4 oz) so `todayIntakeOz` is well below `dailyGoalOz`. `lastGoalHitDate` is null or a past date.

- [ ] K1. Tap **Simulate New Day**.
- [ ] K2. `todayIntakeOz` resets to 0.
- [ ] K3. `draftLogOz` resets to 0.
- [ ] K4. `streakCount` resets to 0 (yesterday was a miss).
- [ ] K5. `lastOpenedDate` = today's date.

---

## L. Reset All

- [ ] L1. Tap **Reset All → back to onboarding** → main panel disappears, onboarding panel appears.
- [ ] L2. Force-close and reopen → onboarding panel still appears (AsyncStorage was cleared).
- [ ] L3. All state fields reset to defaults: `todayIntakeOz` = 0, `streakCount` = 0, `onboardingComplete` = false.

---

## M. New-day goal recompute on open

- [ ] M1. Change climate to **hot** (`dailyGoalOz` = 108). Force-close.
- [ ] M2. Tap **Simulate New Day**, then reopen (or just simulate on the same session).
- [ ] M3. `dailyGoalOz` on the new day reflects the stored climate (hot = 108), not a stale value.
