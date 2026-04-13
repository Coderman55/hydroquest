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
baseOz = weightLb × 0.40

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
  medium              → +4
  high                → +8

climateAdjOz:
  cool                → +0
  moderate            → +4
  hot                 → +8

total = baseOz + sexAdjOz + ageAdjOz + activityAdjOz + climateAdjOz
recommendedGoalOz = round(total to nearest 4oz, midpoint ties go down)
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
The main interaction is bottle-centered hydration logging.

The app supports:
- a bottle visual showing how much water is left
- a slider to set the draft remaining level
- a confirm CTA to log consumed water
- a refill button to reset the digital bottle to full
- one-level undo for the last drink or refill

The bottle visual represents **how much water is left**, not a selected log amount.

### Logging Model

All intake logging goes through a single `logWater(amountOz)` action.

**Reverse-fill / slider flow:**
- the slider is always visible on the main hydration screen
- the slider sets `draftBottleLevelOz` (local UI state only — no store write during drag)
- slider range is `[0, bottleCapacityOz]` — always matches the selected bottle's capacity
- the CTA computes `consumedOz = committedBottleLevelOz - draftBottleLevelOz`
- the CTA is disabled when `consumedOz <= 0` (draft at or above committed level)
- on confirm: `logWater(consumedOz)` is called, then `setBottleLevel(draftBottleLevelOz)`

**Refill:**
- resets `bottleLevelOz` to full capacity
- does NOT add to `todayIntakeOz`
- only committed "add water" action
- disabled when the bottle is already full

**Bottle persistence:**
- `bottleLevelOz` persists across restarts and across midnight
- the digital bottle does not auto-refill at midnight — it holds its state until the user refills

Quick-log buttons were removed in the Day 9 alpha. They bypassed bottle level and created an incoherent mental model in the reverse-fill mechanic.

---

## Bottle Visual Concept
The bottle represents how much water is **currently left** inside.

Visual direction:
- the bottle **drains** as the user drags the slider down and confirms
- when the bottle is empty, the user refills via the refill button to start the next cycle
- the bottle previews the draft slider position before confirm — the fill level moves live during drag

### Locked bottle capacities (MVP)
| Archetype | Capacity |
|---|---|
| Sport Curve | 24 oz |
| Block Tumbler | 30 oz |

### Bottle fill math
```
committedBottleLevelOz = min(bottleLevelOz ?? selectedBottleCapacityOz, selectedBottleCapacityOz)
bottleFillPercent      = min(draftBottleLevelOz / selectedBottleCapacityOz, 1.0)
```

- The bottle shows `draftBottleLevelOz` during interaction (live slider preview)
- `bottleLevelOz = null` is treated as full (first launch / migrated installs)
- Persisted level is clamped to current capacity at the UI layer if bottle archetype changes
- No multi-bottle or overflow visualization in the MVP

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
- committed bottle level (persists across restarts and midnight)
- reverse-fill interaction: slider sets draft level, CTA logs consumed ounces

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
