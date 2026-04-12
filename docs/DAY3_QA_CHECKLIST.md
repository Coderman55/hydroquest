# Day 3 QA Checklist

## Cold Start (Fresh Install / AsyncStorage Cleared)

### Screen 1: Welcome
- [ ] App loads to cream background (`#FFE8D1`)
- [ ] Minimal bottle emblem centered in upper-middle area
- [ ] Headline reads "Refresh your day." in serif font
- [ ] Subtext reads "A hydration plan that actually fits your life, not the other way around."
- [ ] "Get started" button is positioned near bottom with generous padding
- [ ] Button is coral pink (`#E36588`), text is white, shape is pill-rounded
- [ ] No back button visible

### Screen 2: About you
- [ ] Headline reads "Let's build your baseline."
- [ ] Subtext reads "A few quick details help us calculate a daily target that makes sense for your body."
- [ ] Back button visible in top-left
- [ ] Age field present: large, centered, premium typography
- [ ] Weight (lbs) field present: large, centered, premium typography
- [ ] Sex field shows three selectable chips (Male, Female, Other)
- [ ] CTA labeled "Next" is disabled initially (text muted, button grayed)
- [ ] Typing age does not enable CTA without sex selection
- [ ] Selecting sex without complete inputs keeps CTA disabled
- [ ] Once age + weight + sex are all set, CTA becomes enabled (coral pink, white text)
- [ ] Tap "Next" → proceeds to Screen 3

### Screen 3: Your day
- [ ] Headline reads "How's your environment?"
- [ ] Subtext reads "Movement and climate change how much water you need."
- [ ] Back button visible in top-left
- [ ] Activity level section shows three selectable cards (Low, Moderate, High)
- [ ] Climate section shows three selectable cards (Cool, Moderate, Hot)
- [ ] Card border and text color change to accent (`#E36588`) when selected
- [ ] CTA labeled "Next" is disabled until both activity and climate are selected
- [ ] Tap "Next" with both selected → proceeds to Screen 4

### Screen 4: Your bottle
- [ ] Headline reads "Build your bottle."
- [ ] Back button visible in top-left
- [ ] Large bottle visual in center (initially placeholder text "Pick a bottle below")
- [ ] Two bottle family cards: "Sport Curve" (24 oz) and "Block Tumbler" (30 oz)
- [ ] Tapping Sport Curve shows Sport Curve silhouette (tall, narrow with neck)
- [ ] Tapping Block Tumbler shows Block Tumbler silhouette (wide, squat with flat lid)
- [ ] Three color swatches below bottle: blue (`#7CA5B8`), green (`#A8C5A0`), pink (`#E36588`)
- [ ] Tapping a color swatch changes bottle silhouette color immediately
- [ ] Selected color swatch has visible border/highlight
- [ ] CTA labeled "Next" is disabled until both bottle family and color are selected
- [ ] Tap "Next" with both selected → proceeds to Screen 5

### Screen 5: Your setup is ready
- [ ] Headline reads "Your setup is ready"
- [ ] Back button visible in top-left
- [ ] Large bottle visual displays at 1.4x scale with final selected color
- [ ] Below bottle, display shows calculated daily goal in large serif font (e.g., "86 oz")
- [ ] Goal label reads "daily goal" in small caps
- [ ] Subtext reads "Your custom hydration plan is locked in. Let's get to it."
- [ ] CTA labeled "Start logging" is prominently displayed
- [ ] CTA has generous horizontal padding (text does not touch edges)
- [ ] CTA is pill-shaped, coral pink, white text, centered
- [ ] Goal preview is computed from user's actual inputs (use calculateGoal)
- [ ] Tap "Start logging" → completes onboarding, transitions to MainPanel

## Post-Onboarding (MainPanel)
- [ ] App background is warm cream (`#FFE8D1`)
- [ ] If `todayIntakeOz === 0`, empty-state banner displays: "Log your first sip to start your streak."
- [ ] Empty-state banner has "Log 8 oz" button (coral pink)
- [ ] Tapping "Log 8 oz" logs water, banner disappears
- [ ] Debug panel shows all store values
- [ ] "Reset All" button is present in DEBUG ACTIONS

## Back Navigation
- [ ] Screen 2 back button → returns to Screen 1
- [ ] Screen 3 back button → returns to Screen 2
- [ ] Screen 4 back button → returns to Screen 3
- [ ] Screen 5 back button → returns to Screen 4
- [ ] Backing out does not lose partial form data (fields retain selected values)
- [ ] Back from Screen 2 to Screen 1 → all Screen 2 inputs still present if revisit

## Goal Preview Validation (Screen 5)
- [ ] Goal matches expected formula: `(weightLb * 0.40) + adjustments`, clamped [48–160], rounded to nearest 4 (midpoint ties go down)
- [ ] Test case: 150 lb, age 30, male, moderate activity, moderate climate
  - Expected: (150 * 0.40) + 8 + 0 + 4 + 4 = 76 oz
  - Verify display shows 76 oz
- [ ] Test case: 120 lb, age 70, female, low activity, cool climate
  - Expected: (120 * 0.40) + 0 + 8 + 0 + 0 = 56 oz
  - Verify display shows 56 oz

## Final CTA Commit
- [ ] Tap "Start logging" on Screen 5 calls `completeOnboarding()` exactly once
- [ ] `onboardingComplete` flag is set to `true` in profile store
- [ ] App transitions immediately to MainPanel (no lag)
- [ ] Back button disappears (not navigable back to onboarding)

## Force Close & Relaunch
- [ ] Complete onboarding successfully
- [ ] Force-close the app (no explicit logout)
- [ ] Relaunch app
- [ ] App should skip onboarding and go directly to MainPanel
- [ ] All profile fields should persist (age, weight, sex, activity, climate, bottle, color)
- [ ] All hydration state should persist (goal, today's intake, streak)

## Keyboard & Input Validation
- [ ] Tap Age field → numeric keyboard opens
- [ ] Tap Weight field → decimal keyboard opens
- [ ] Invalid age (0, negative, non-numeric) → CTA remains disabled
- [ ] Invalid weight (0, negative, non-numeric) → CTA remains disabled
- [ ] Max valid inputs accepted without truncation (e.g., 99 years, 300+ lbs)

## Spacing & Polish (Day 3 polish adjustments)
- [ ] About you numeric input values sit ~8px above underline (not flush)
- [ ] "Start logging" button has ~32px horizontal padding (text has breathing room)
- [ ] Button height and pill shape remain premium and intentional

---

## Pass Criteria
- All screens render without crashes
- All validation and transitions work as specified
- Back navigation preserves partial data
- Goal preview is computed correctly
- Final commit happens only on Screen 5 CTA tap
- Force-close/relaunch preserves all persistent state
- No console errors or warnings in Expo Go

