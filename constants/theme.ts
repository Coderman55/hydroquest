// HydroQuest — Day 3 design tokens.
// Pure constants. No React, no logic. No imports from state or lib.
// Single source of truth for palette, typography, and spacing used by UI
// components. Kept in `constants/` so theming never pulls from app state.

import type { BottleColor } from './index';

// ---------- Palette ----------
// Warm / editorial direction. Background is a warm cream, text is deep teal,
// primary CTAs are coral pink.
export const palette = {
  bg: '#FFE8D1',          // background — warm cream
  bgSoft: '#FFF4E2',      // card / lifted surface on bg
  bgEdge: '#F5D9B7',      // subtle divider on warm bg
  ink: '#2F4858',         // primary text — deep teal
  inkSoft: '#6C7B86',     // secondary text
  inkMuted: '#A3ADB5',    // tertiary / placeholder
  accent: '#E36588',      // primary CTA — coral pink
  accentPressed: '#C9527A', // accent in pressed state
  highlight: '#F6F5AE',   // soft yellow — selected pill / progress dot
  support: '#7CA5B8',     // dusty blue — quieter secondary
  white: '#FFFFFF',
  shadow: 'rgba(47, 72, 88, 0.10)',
} as const;

// ---------- Bottle color swatches ----------
// Concrete hex values for the three bottle colors. Separate from the UI
// palette so swapping UI colors never touches bottle visuals.
export const BOTTLE_COLOR_HEX: Record<BottleColor, string> = {
  blue: '#7CA5B8',
  green: '#A8C5A0',
  pink: '#E36588',
};

// ---------- Fonts ----------
// Georgia ships on iOS. Used for headings only — body text stays on the
// system default so we don't mix serif into everyday copy.
export const fonts = {
  heading: 'Georgia',
} as const;

// ---------- Spacing scale ----------
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ---------- Radius scale ----------
export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

// ---------- Type scale ----------
export const fontSize = {
  caption: 12,
  small: 13,
  body: 15,
  lg: 17,
  xl: 22,
  display: 30,
  displayLg: 38,
} as const;
