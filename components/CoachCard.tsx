// HydroQuest — Purely presentational coach message card.
// Renders a single message string passed in from HomeScreen.
// No store imports. No business logic. Props only.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fontSize, palette, radius, spacing } from '../constants/theme';

type Props = {
  message: string;
};

export function CoachCard({ message }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    maxWidth: '80%',
    marginBottom: spacing.xs,
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    // Ink color at 8% opacity — soft message bubble, not a system banner.
    // Derived from palette.ink (#2F4858 = rgb(47, 72, 88)) without editing theme.ts.
    backgroundColor: 'rgba(47, 72, 88, 0.08)',
  },
  message: {
    fontSize: 12,
    fontWeight: '500',
    color: palette.ink,
    textAlign: 'center',
    lineHeight: 17,
  },
});
