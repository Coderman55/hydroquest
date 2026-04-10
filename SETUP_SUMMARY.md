# HydroQuest — Setup Summary

## Project created on
2026-04-09

---

## Command used to create the project

```bash
npx create-expo-app@latest hydroquest --template blank-typescript
```

**Template chosen:** `blank-typescript`
Reason: minimal scaffold, TypeScript enabled, zero Expo Router, zero tabs. Safest path for Expo Go on a physical iPhone.

---

## Expo SDK and key versions

| Package | Version |
|---|---|
| Expo SDK | 54.0.33 |
| React | 19.1.0 |
| React Native | 0.81.5 |
| TypeScript | 5.9.2 |

---

## Dependencies installed for Day 1–2

Installed using `npx expo install` (Expo's version-safe installer):

```bash
npx expo install zustand @react-native-async-storage/async-storage react-native-svg @react-native-community/slider
```

| Package | Version | Purpose |
|---|---|---|
| zustand | ^5.0.12 | Global app state (hydration log, bottle, profile) |
| @react-native-async-storage/async-storage | 2.2.0 | Local persistence across app restarts |
| react-native-svg | 15.12.1 | SVG-based custom bottle rendering |
| @react-native-community/slider | 5.0.1 | Drag-to-fill amount selector |

---

## Folder structure created

```
hydroquest/
├── App.tsx              # Entry point (do not move)
├── index.ts             # Registers App.tsx with Expo (do not modify)
├── app.json             # Expo config (name, icons, orientation, etc.)
├── tsconfig.json        # TypeScript config
├── assets/              # App icons and splash screen images
├── components/          # UI components (bottle, coach card, streak, etc.)
├── store/               # Zustand state stores
├── lib/                 # Pure utility functions (goal calc, coach logic)
├── constants/           # App-wide constants (colors, defaults, oz values)
├── docs/                # Strategy and reference documents
└── node_modules/        # Installed packages (do not edit)
```

---

## Notable scaffold details

- **New Architecture enabled** (`newArchEnabled: true` in app.json): This is Expo SDK 54's default. All four installed packages support it. No action needed.
- **Light mode locked** (`userInterfaceStyle: "light"` in app.json): Matches HydroQuest design spec. Already set correctly.
- **Portrait locked** (`orientation: "portrait"`): Correct for the MVP.
- **Git initialized**: The scaffold created a git repo and made an initial commit automatically.
- **Zustand v5**: Note this is Zustand version 5, not v4. The API is slightly different — stores use `create` from `zustand` (same import), but some middleware patterns changed. We will follow v5 patterns throughout.

---

## What was NOT installed

- No Expo Router
- No React Navigation
- No MMKV
- No HealthKit
- No weather/location packages
- No analytics
- No backend libraries

---

## How to launch the app on your iPhone

1. Open a terminal and navigate to the project:
   ```bash
   cd "/c/Users/alex/OneDrive/Desktop/Projects/hydroquest"
   ```

2. Start the Expo development server:
   ```bash
   npx expo start
   ```

3. A QR code will appear in the terminal.

4. On your iPhone, open the **Expo Go** app and scan the QR code.

5. The app will load. You should see the default screen: `"Open up App.tsx to start working on your app!"`

If the QR code does not load, make sure your iPhone and your Windows PC are on the **same Wi-Fi network**.

---

## What comes next

Before writing any feature code, the next step is to lock the Zustand state model for:
- user profile data
- hydration progress for today
- bottle selection and color
- streak state

State first. UI second.
