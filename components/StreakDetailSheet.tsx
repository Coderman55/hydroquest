// HydroQuest — Read-only streak + recent-history bottom sheet.
// Opened by tapping the streak badge (or "Recent activity" fallback) on HomeScreen.
// Derives all display data from the passed eventLedger + current hydration state.
// Zero store writes. Zero navigation. Zero scope beyond recent-history visibility.

import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fonts, fontSize, palette, radius, spacing } from '../constants/theme';
import { getTodayString } from '../lib/dateUtils';

// ─── Local event types ────────────────────────────────────────────────────────
// Structurally compatible with the store's HydrationEvent union.
// Typed locally so this component carries no store dependency.

type DrinkEntry = {
  date: string;
  type: 'drink';
  effectiveHydrationOz: number;
};

type RefillEntry = {
  date: string;
  type: 'refill';
};

type LedgerEntry = DrinkEntry | RefillEntry;

// ─── Derived types ────────────────────────────────────────────────────────────

type DayStatus = 'hit' | 'partial' | 'empty';

type DaySummary = {
  dateString: string;
  shortLabel: string;   // 'Mon' | 'Yest' | 'Today'
  fullLabel: string;    // 'Monday' | 'Yesterday' | 'Today'
  status: DayStatus;
  totalIntakeOz: number;
  refillCount: number;
};

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
  streakCount: number;
  eventLedger: LedgerEntry[];
  dailyGoalOz: number;
  lastGoalHitDate: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAY_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const STATUS_COLORS: Record<DayStatus, string> = {
  hit:     palette.accent,   // coral pink — goal achieved
  partial: palette.support,  // dusty blue — something logged, short of goal
  empty:   palette.bgEdge,   // warm edge  — nothing recorded
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function subtractDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - n);
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0'),
  ].join('-');
}

function getLast7DateStrings(today: string): string[] {
  // Returns [oldest, ..., today] — index 0 is 6 days ago, index 6 is today.
  return [6, 5, 4, 3, 2, 1, 0].map((n) => subtractDays(today, n));
}

function makeDayLabels(
  dateString: string,
  today: string,
  yesterday: string,
): { shortLabel: string; fullLabel: string } {
  if (dateString === today)     return { shortLabel: 'Today', fullLabel: 'Today' };
  if (dateString === yesterday) return { shortLabel: 'Yest',  fullLabel: 'Yesterday' };
  const [y, m, d] = dateString.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return { shortLabel: WEEKDAY_SHORT[dow], fullLabel: WEEKDAY_FULL[dow] };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function statusText(s: DayStatus): string {
  if (s === 'hit')     return 'Goal hit';
  if (s === 'partial') return 'Logged';
  return 'No log';
}

function statusColor(s: DayStatus): string {
  if (s === 'hit')     return palette.accent;
  if (s === 'partial') return palette.support;
  return palette.inkMuted;
}

function refillLabel(count: number): string {
  if (count === 0) return '—';
  if (count === 1) return '1 refill';
  return `${count} refills`;
}

function resolveLastHitLabel(
  lastGoalHitDate: string | null,
  today: string,
  yesterday: string,
): string | null {
  if (!lastGoalHitDate) return null;
  if (lastGoalHitDate === today)     return 'Today';
  if (lastGoalHitDate === yesterday) return 'Yesterday';
  const [y, m, d] = lastGoalHitDate.split('-').map(Number);
  return WEEKDAY_FULL[new Date(y, m - 1, d).getDay()];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StreakDetailSheet({
  visible,
  onClose,
  streakCount,
  eventLedger,
  dailyGoalOz,
  lastGoalHitDate,
}: Props) {
  const today     = getTodayString();
  const yesterday = subtractDays(today, 1);

  // ── Derive per-day summaries ───────────────────────────────────────────────
  // Single pass over the ledger. Only events inside the 7-day window are bucketed.
  const daySummaries = useMemo((): DaySummary[] => {
    const dates   = getLast7DateStrings(today);
    const dateSet = new Set(dates);

    type Bucket = { totalIntakeOz: number; refillCount: number };
    const byDate = new Map<string, Bucket>();

    for (const event of eventLedger) {
      if (!dateSet.has(event.date)) continue;
      if (!byDate.has(event.date)) {
        byDate.set(event.date, { totalIntakeOz: 0, refillCount: 0 });
      }
      const bucket = byDate.get(event.date)!;
      if (event.type === 'drink') {
        bucket.totalIntakeOz += event.effectiveHydrationOz;
      } else {
        bucket.refillCount += 1;
      }
    }

    return dates.map((dateString) => {
      const { totalIntakeOz, refillCount } =
        byDate.get(dateString) ?? { totalIntakeOz: 0, refillCount: 0 };

      const status: DayStatus =
        totalIntakeOz > 0 && totalIntakeOz >= dailyGoalOz ? 'hit'     :
        totalIntakeOz > 0                                  ? 'partial' :
                                                             'empty';

      const { shortLabel, fullLabel } = makeDayLabels(dateString, today, yesterday);

      return { dateString, shortLabel, fullLabel, status, totalIntakeOz, refillCount };
    });
  }, [eventLedger, dailyGoalOz, today, yesterday]);

  // Detail list shows most-recent day first.
  const reversedSummaries = useMemo(() => [...daySummaries].reverse(), [daySummaries]);

  const streakHeadline =
    streakCount === 0 ? 'No active streak'         :
    streakCount === 1 ? '🔥 1-day streak'          :
                        `🔥 ${streakCount}-day streak`;

  const lastHitLabel = resolveLastHitLabel(lastGoalHitDate, today, yesterday);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>

        {/* Tap the area above the sheet to dismiss */}
        <Pressable style={{ flex: 1 }} onPress={onClose} />

        {/* ── Bottom sheet ─────────────────────────────────────────────────── */}
        <View style={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.streakHeadline}>{streakHeadline}</Text>
              {lastHitLabel !== null && (
                <Text style={styles.lastHitLine}>Last goal hit: {lastHitLabel}</Text>
              )}
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.divider} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >

            {/* ── 7-day dot row ──────────────────────────────────────────────── */}
            <View style={styles.dotRow}>
              {daySummaries.map((day) => (
                <View key={day.dateString} style={styles.dotCell}>
                  <View
                    style={[styles.dot, { backgroundColor: STATUS_COLORS[day.status] }]}
                  />
                  <Text
                    style={[
                      styles.dotLabel,
                      day.dateString === today && styles.dotLabelToday,
                    ]}
                  >
                    {day.shortLabel}
                  </Text>
                </View>
              ))}
            </View>

            {/* Dot legend */}
            <View style={styles.dotLegend}>
              <LegendItem color={STATUS_COLORS.hit}     label="Goal hit" />
              <LegendItem color={STATUS_COLORS.partial} label="Logged" />
              <LegendItem color={STATUS_COLORS.empty}   label="No log" />
            </View>

            <View style={styles.divider} />

            {/* ── Recent-day detail list ─────────────────────────────────────── */}
            {reversedSummaries.map((day, i) => (
              <View
                key={day.dateString}
                style={[
                  styles.detailRow,
                  i === reversedSummaries.length - 1 && styles.detailRowLast,
                ]}
              >
                <Text style={styles.detailDay}>{day.fullLabel}</Text>
                <Text style={[styles.detailStatus, { color: statusColor(day.status) }]}>
                  {statusText(day.status)}
                </Text>
                <Text style={styles.detailRefills}>{refillLabel(day.refillCount)}</Text>
              </View>
            ))}

            {/* Footnote — one quiet line, does not compete visually */}
            <Text style={styles.footnote}>
              Goal status uses your current daily goal ({dailyGoalOz} oz).
            </Text>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  // ── Modal structure ──────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(47, 72, 88, 0.30)',
  },
  sheet: {
    backgroundColor: palette.bgSoft,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md,
    // Extra bottom padding covers the iPhone home indicator.
    paddingBottom: spacing.xl + spacing.md,
    maxHeight: '82%',
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 12,
  },

  // ── Header ───────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  headerLeft: {
    flex: 1,
  },
  streakHeadline: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    color: palette.ink,
    fontWeight: '700',
  },
  lastHitLine: {
    fontSize: fontSize.small,
    color: palette.inkSoft,
    marginTop: 2,
  },
  closeBtn: {
    minWidth: 36,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  closeBtnText: {
    fontSize: fontSize.lg,
    color: palette.inkSoft,
  },

  // ── Shared divider ────────────────────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: palette.bgEdge,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },

  // ── Scroll area ───────────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },

  // ── Dot row ───────────────────────────────────────────────────────────────────
  dotRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: spacing.xs,
  },
  dotCell: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dotLabel: {
    fontSize: fontSize.caption,
    color: palette.inkMuted,
    textAlign: 'center',
  },
  dotLabelToday: {
    color: palette.ink,
    fontWeight: '600',
  },

  // ── Dot legend ────────────────────────────────────────────────────────────────
  dotLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: fontSize.caption,
    color: palette.inkMuted,
  },

  // ── Recent-day detail list ────────────────────────────────────────────────────
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgEdge,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailDay: {
    flex: 2,
    fontSize: fontSize.body,
    color: palette.ink,
    fontWeight: '500',
  },
  detailStatus: {
    flex: 2,
    fontSize: fontSize.small,
  },
  detailRefills: {
    flex: 1,
    fontSize: fontSize.small,
    color: palette.inkSoft,
    textAlign: 'right',
  },

  // ── Footnote ──────────────────────────────────────────────────────────────────
  footnote: {
    fontSize: fontSize.caption,
    color: palette.inkMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 17,
  },
});
