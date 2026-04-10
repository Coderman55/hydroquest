# HydroQuest — Day 2 Summary

---

## Approved state model

**Option A: Two Zustand stores, flat schema.**

| Store | Persisted | Key fields |
|---|---|---|
| `useProfileStore` | All fields | `onboardingComplete`, `age`, `sex`, `weightLb`, `activityLevel`, `climate`, `selectedBottleId`, `bottleColor`, `schemaVersion` |
| `useHydrationStore` | All fields except `draftLogOz` | `todayIntakeOz`, `dailyGoalOz`, `recommendedGoalOz`, `streakCount`, `lastOpenedDate`, `lastGoalHitDate`, `schemaVersion` |

`draftLogOz` is stored in `useHydrationStore` state but excluded from AsyncStorage via `partialize`. It is always `0` on app start.

Derived values (`goalPercent`, `remainingOz`, `bottleFillPercent`) are never stored. Computed inline in components.

---

## Approved business rules (implemented)

| Rule | Implementation |
|---|---|
| All 7 onboarding fields required | `completeOnboarding()` validates all before setting `onboardingComplete = true` |
| Goal formula locked | `lib/calculateGoal.ts` — single source; not duplicated |
| `dailyGoalOz = recommendedGoalOz` in MVP | Both written on every `setGoal()` call |
| Climate change recomputes goal immediately | `setClimate()` calls `calculateGoal()` and writes result to hydration store |
| `logWater()` rejects 0, negative, NaN, non-finite | `isPositiveFinite()` guard at action entry |
| `setDraftLog()` rejects negative, NaN, non-finite; accepts 0 as clear | Guard in action; 0 allowed for init/clear only |
| Streak increments immediately on goal hit | `logWater()` checks `newIntake >= dailyGoalOz && lastGoalHitDate !== today` |
| No double-increment | `lastGoalHitDate !== today` guard |
| New-day reset: 1-day gap evaluates streak | `runNewDayCheck()` checks `lastGoalHitDate === lastOpenedDate` |
| New-day reset: >1-day gap resets streak to 0 | `runNewDayCheck()` else branch |
| First-ever open: initialize without streak eval | `lastOpenedDate === null` branch |
| New-day recomputes goal from current profile + climate | `calculateGoal(profile)` called inside `runNewDayCheck()` |
| Date math uses local time, not UTC | `getTodayString()` uses `getFullYear/getMonth/getDate` |
| DST-safe day arithmetic | `getDaysBetween()` anchors both dates to noon |
| Schema version stored | `schemaVersion: '1'` in both stores |
| `hasHydrated` flag exposed | Both stores set it in `onRehydrateStorage` callback |
| AsyncStorage keys namespaced | `@hydroquest/profile`, `@hydroquest/hydration` |

---

## Files added or changed

| File | Status | Purpose |
|---|---|---|
| `constants/index.ts` | New | AsyncStorage keys, schema version, bottle capacities, enum types and constants |
| `lib/calculateGoal.ts` | New | Locked MVP goal formula — pure function, single source of truth |
| `lib/dateUtils.ts` | New | `getTodayString()` and `getDaysBetween()` — local-time, DST-safe |
| `store/useProfileStore.ts` | New | Profile and onboarding state; Zustand + AsyncStorage persist |
| `store/useHydrationStore.ts` | New | Hydration, streak, and date state; Zustand + AsyncStorage persist |
| `App.tsx` | Replaced | Day 2 debug harness; routes between onboarding panel and main panel |

No files deleted. `index.ts` and `app.json` are unchanged.

---

## What works now

- Both stores hydrate from AsyncStorage on app open; `hasHydrated` flag gates rendering
- `runNewDayCheck()` runs once per session, after hydration, before first render
- Onboarding input validation (all 7 fields required; age/weight parsed from text input)
- Goal computation on onboarding complete (formula verified, clamped to 48–160 oz)
- Goal recomputation on climate change (immediate, no side effects on intake or streak)
- `logWater()` — adds to intake, sets draft, evaluates streak in one atomic operation
- `setDraftLog()` — sets draft without logging; `bottleFillPercent` computes correctly
- Custom amount input validates before calling `logWater()`
- Streak increments on first goal hit per day; subsequent same-day logs do not re-increment
- New-day reset: preserves streak if goal was hit yesterday; resets to 0 if missed or skipped
- Reset All clears both stores and returns to onboarding
- All key state values visible as live text on device
- `_setLastOpenedDateToYesterday()` shifts both `lastOpenedDate` and `lastGoalHitDate` back 1 day, enabling both streak-preserve and streak-reset test scenarios

---

## Current limitations

- No real onboarding UI — text inputs and button rows only, no styling
- No real main screen — state readout and debug buttons only
- No bottle SVG or visual fill animation
- No slider component — custom amount is a plain text input
- No AI coach card
- No streak display UI
- No quick-log confirmation feedback (tap happens silently)
- `bottleColor` is collected in onboarding but has no visual effect yet
- Climate selector on the main panel is raw buttons, not a polished control
- App does not handle AsyncStorage load failure gracefully — falls back to initial state silently in production, logs warning in dev only

---

## Known debug-only elements (not production UI)

| Element | Where | Note |
|---|---|---|
| `_setLastOpenedDateToYesterday()` | `useHydrationStore` | Debug action; must be removed or gated before TestFlight |
| "Simulate New Day" button | `App.tsx` `MainPanel` | Debug only; shifts both tracked dates back 1 day |
| "Reset All → back to onboarding" button | `App.tsx` `MainPanel` | Debug only; should not exist in production |
| Full state readout (`KV` component block) | `App.tsx` `MainPanel` | Debug only; replace with real UI |
| "SET DRAFT ONLY" button row | `App.tsx` `MainPanel` | Debug only; slider handles this in real UI |
| Raw profile field dump | `App.tsx` `MainPanel` | Debug only |

---

## Deviations from contracts

| Contract spec | Actual implementation | Impact |
|---|---|---|
| `_setLastOpenedDateToYesterday()` described as shifting only `lastOpenedDate` | Implementation shifts both `lastOpenedDate` **and** `lastGoalHitDate` back one day | **Improvement.** Required for the "streak preserved" test to work correctly. The original spec would have broken that test scenario. |
| Contract says `draftLogOz` resets to `0` on new-day reset | Implemented: all three new-day branches (first open, +1 day, +N days) explicitly set `draftLogOz: 0` | Matches contract. |
| `runNewDayCheck` spec says goal recomputes on new day | Implemented in both the +1 day and +N day branches | Matches contract. Same-day open correctly skips recompute. |

No business logic deviations. All formula values, streak rules, and persistence boundaries match the contracts.

---

## What Day 3 should focus on

**Priority order:**

1. **Onboarding screen UI** — replace the debug form with a fast, premium-feeling multi-step flow. This is the first real user-facing screen. One step per field or field group. Must feel low-friction, not like a settings form.

2. **Main hydration screen scaffold** — layout the single-screen experience: bottle area (placeholder SVG), progress display, quick-log buttons, slider, streak card, coach card placeholder. No animation yet.

3. **Bottle SVG** — Sport Curve and Block Tumbler outlines with a fill layer driven by `bottleFillPercent`. Static fill for now; animation in a later pass.

4. **Slider component** — always-visible slider on the main screen that updates `draftLogOz` only. Confirm/Log button calls `logWater(draftLogOz)`.

5. **Remove all debug-only elements** — the debug harness should be stripped or moved behind a dev flag before any screen work begins on the real UI.

Before writing any Day 3 UI, confirm all Day 2 QA checklist items pass on the physical iPhone.
