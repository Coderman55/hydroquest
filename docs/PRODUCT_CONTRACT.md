# HydroQuest MVP Product Contract

## Purpose
HydroQuest is an iPhone hydration-tracking MVP designed to prove that hydration logging can feel frictionless, personalized, and satisfying without requiring hardware.

This MVP must be usable by one beta tester through TestFlight within 14 days.

---

## Core Product Thesis
The app should make hydration tracking feel:
- fast
- visually satisfying
- personalized
- low-friction
- premium without complexity

The MVP should validate whether a software-only bottle interface plus contextual personalization is enough to make logging feel materially better than standard hydration apps.

---

## MVP Success Criteria
The MVP is successful if, by Day 14, it:
- installs on the tester's iPhone via TestFlight
- opens reliably
- persists user data across restarts
- collects onboarding data cleanly
- computes a hydration goal automatically
- allows fast water logging
- shows a satisfying bottle-based visual interaction
- shows a daily streak
- feels polished enough to demonstrate the concept credibly

---

## Target User
- single beta tester
- iPhone user
- no multi-user support
- no accounts
- no cloud sync

---

## Core UX Structure
The user experience has two major phases:

1. **Onboarding**
   - collect required personalization data
   - compute a hydration goal automatically
   - set initial bottle archetype and color
   - mark onboarding complete

2. **Main Hydration Experience**
   - show today's progress
   - show current streak
   - show selected bottle
   - allow quick water logging
   - allow daily climate adjustment
   - show lightweight contextual coaching text

---

## Onboarding Is In Scope
Onboarding is a core MVP feature and differentiator.

It should feel:
- fast
- premium
- simple
- low-friction

It should not feel:
- medical
- bureaucratic
- like account signup
- like a settings form

---

## Required Onboarding Inputs
The MVP onboarding collects:
- age
- sex
- weight
- activity level
- climate context
- bottle archetype
- bottle color

These inputs are used to compute a recommended hydration goal automatically.

The user does **not** manually choose or edit the goal during onboarding in the MVP.

---

## Goal Recommendation Rule
The hydration goal is computed silently using a locked formula based on:
- age
- sex
- weight (entered in pounds)
- activity level
- climate context

This is an MVP heuristic, not medical advice.

The formula is:
- simple
- explainable
- deterministic
- easy to debug

### Locked MVP Formula

```
baseOz = weightLb × 0.5

sexAdjOz:
  male                → +8
  female              → +0
  other/prefer not    → +4

ageAdjOz:
  under 18            → -8
  18–34               → +0
  35–54               → +4
  55+                 → +8

activityAdjOz:
  low                 → +0
  medium              → +8
  high                → +16

climateAdjOz:
  cool                → +0
  moderate            → +6
  hot                 → +12

total = baseOz + sexAdjOz + ageAdjOz + activityAdjOz + climateAdjOz
recommendedGoalOz = round(total to nearest 4oz)
recommendedGoalOz = clamp(recommendedGoalOz, min: 48oz, max: 160oz)
dailyGoalOz = recommendedGoalOz
```

Both `recommendedGoalOz` and `dailyGoalOz` are always stored. In the MVP they will match. Storing both keeps the schema stable for future flexibility.

The result is stored as the user's daily goal in ounces.

---

## Climate Handling
The MVP uses a **manual climate selector** only.

Available climate options:
- cool
- moderate
- hot

These should correspond to suggested temperature ranges for user understanding:
- cool: below 60°F
- moderate: 60°F to 80°F
- hot: above 80°F

Climate can be changed by the user daily from the main app experience.

When the user changes climate, `dailyGoalOz` is recomputed immediately using the locked formula with the new climate value. This affects the current day's remaining target only. It does not retroactively change `todayIntakeOz` or any streak history.

No live location or weather API is required for MVP.

---

## Main Hydration Interaction
The main interaction is fast hydration logging.

The app should support:
- quick-log buttons
- custom input
- bottle interaction
- visible progress feedback

The bottle visual represents the **selected log amount**, not the full-day total.

Example:
- a 32oz selected log amount corresponds to a full bottle visual

### Logging Model

All logging goes through a single `logWater(amountOz)` action.

**Quick-log buttons:**
- call `logWater(amountOz)` immediately for speed
- also set `draftLogOz = amountOz` so the bottle UI reflects the last selected amount

**Slider / custom flow:**
- the slider is **always visible** on the main hydration screen — not hidden behind a button
- slider and manual numeric input update `draftLogOz` only (no immediate logging)
- a confirm/log action calls `logWater(draftLogOz)` when the user is ready to commit
- custom amounts are not saved settings; `draftLogOz` resets to `0` on new-day reset
- if practical in a future iteration, the ounce label may be tap-to-type for precise entry

**draftLogOz initial state:**
- starts at `0` on first load and after a new-day reset
- `0` means "nothing selected yet / empty bottle" — the sentinel state
- becomes positive only through user interaction (quick-log tap or slider movement)

This keeps quick-log frictionless, `draftLogOz` meaningful for the bottle interaction, and the logging path consistent regardless of input method.

---

## Bottle Visual Concept
The bottle should be conceptually treated as a bottle the user is drinking from.

Preferred visual direction:
- the bottle **drains** as the user consumes the currently selected amount
- when the bottle is emptied, the UI can celebrate completion
- the user can then refill/reset the bottle for the next log cycle

For Day 2 architecture, the store only needs to support this interaction model.
The final polished draining animation and refill celebration can be implemented later.

### Locked bottle capacities (MVP)
| Archetype | Capacity |
|---|---|
| Sport Curve | 24 oz |
| Block Tumbler | 30 oz |

### Bottle fill math
```
bottleFillPercent = min(draftLogOz / selectedBottleCapacityOz, 1.0)
```

- Below capacity: bottle shows a proportional fill level
- At or above capacity: bottle shows as visually full (capped at 1.0)
- The exact selected ounce amount is always shown in text
- Example: 32oz quick-log with a 24oz Sport Curve shows a full bottle and displays "32 oz"
- No multi-bottle or overflow visualization in the MVP
- `draftLogOz = 0`: bottle shows empty

---

## In Scope
- iPhone app only
- Expo-managed React Native app
- local-first storage
- onboarding flow
- automatic hydration goal calculation
- manual climate selector
- bottle archetype selection
- bottle color selection
- main hydration screen
- quick logging
- custom amount logging
- daily streak
- fake AI coach with hardcoded contextual copy
- local persistence with AsyncStorage
- Zustand state management
- light mode only
- pastel minimalist aesthetic

---

## Out of Scope
- HealthKit
- live weather API
- live location permission flow
- backend
- auth
- accounts
- cloud sync
- push notifications
- reminders backend
- social features
- Apple Watch
- widgets
- dark mode
- real AI API calls
- subscriptions
- analytics platforms

---

## Technical Constraints
- development machine is Windows
- local iPhone testing is through Expo Go
- final iOS build is through EAS/TestFlight
- Expo Go compatibility is preferred during MVP development
- avoid risky native modules
- prefer simple, debuggable solutions

---

## State Principles
The architecture must clearly separate:
- persistent user/profile data
- persistent hydration data
- ephemeral UI state
- derived display values

The architecture must support:
- onboarding completion state
- daily goal calculation
- climate changes triggering goal recomputation
- streak tracking with immediate success detection
- daily reset behavior using local calendar date comparison
- selected bottle state
- bottle-color state
- draft log amount
- future bottle-draining UI behavior

**Required persisted date fields:**
- `lastOpenedDate` — local calendar date string of the last app open; used for new-day detection
- `lastGoalHitDate` — local calendar date string of the last day the user hit their goal; used for streak evaluation

---

## Development Principles
- state first, UI second
- one small step at a time
- one small file at a time
- no code without approach approval
- low-risk solutions over elegant ones
- optimize for speed of iteration and debuggability

---

## Definition of Done for MVP
The MVP is done when:
- it installs through TestFlight
- onboarding works
- the daily goal is computed automatically
- logging works
- persistence works
- streak logic works
- the bottle interaction concept is believable
- the app feels coherent and presentable as a real product demo
