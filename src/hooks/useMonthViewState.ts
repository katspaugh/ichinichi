import { useCallback, useEffect } from "react";
import { getTodayString, parseDate } from "../utils/date";

interface UseMonthViewStateProps {
  enabled: boolean;
  year: number;
  month: number;
  monthDate: string | null;
  noteDates: Set<string>;
  navigateToMonthDate: (date: string) => void;
}

/**
 * Get dates in a specific month from the noteDates set, sorted chronologically.
 */
function getNotesInMonth(
  noteDates: Set<string>,
  year: number,
  month: number,
): string[] {
  const notesInMonth: string[] = [];

  for (const dateStr of noteDates) {
    const parsed = parseDate(dateStr);
    if (
      parsed &&
      parsed.getFullYear() === year &&
      parsed.getMonth() === month
    ) {
      notesInMonth.push(dateStr);
    }
  }

  // Sort chronologically (oldest first)
  return notesInMonth.sort((a, b) => {
    const dateA = parseDate(a);
    const dateB = parseDate(b);
    if (!dateA || !dateB) return 0;
    return dateA.getTime() - dateB.getTime();
  });
}

/**
 * Hook for managing month view state including auto-selection of dates.
 *
 * Auto-select rules:
 * - Current month: select today
 * - Other months: select the last note in that month
 * - If no notes in month: no auto-select
 */
export function useMonthViewState({
  enabled,
  year,
  month,
  monthDate,
  noteDates,
  navigateToMonthDate,
}: UseMonthViewStateProps) {
  // Determine if we're viewing the current month
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // Get today's date string
  const todayStr = getTodayString();

  // Get notes in the current month view
  const notesInMonth = getNotesInMonth(noteDates, year, month);

  // Auto-select: if no date selected, pick today (current month) or last note (other months)
  useEffect(() => {
    if (!enabled || monthDate) {
      return;
    }

    if (isCurrentMonth) {
      navigateToMonthDate(todayStr);
    } else if (notesInMonth.length > 0) {
      navigateToMonthDate(notesInMonth[notesInMonth.length - 1]);
    }
  }, [enabled, monthDate, isCurrentMonth, todayStr, notesInMonth, navigateToMonthDate]);

  // Navigate to a specific date within the month
  const selectDate = useCallback(
    (date: string) => {
      navigateToMonthDate(date);
    },
    [navigateToMonthDate],
  );

  // Navigate to previous note in month
  const selectPreviousNote = useCallback(() => {
    if (!monthDate || notesInMonth.length === 0) return;

    const currentIndex = notesInMonth.indexOf(monthDate);
    if (currentIndex > 0) {
      navigateToMonthDate(notesInMonth[currentIndex - 1]);
    }
  }, [monthDate, notesInMonth, navigateToMonthDate]);

  // Navigate to next note in month
  const selectNextNote = useCallback(() => {
    if (!monthDate || notesInMonth.length === 0) return;

    const currentIndex = notesInMonth.indexOf(monthDate);
    if (currentIndex >= 0 && currentIndex < notesInMonth.length - 1) {
      navigateToMonthDate(notesInMonth[currentIndex + 1]);
    }
  }, [monthDate, notesInMonth, navigateToMonthDate]);

  // Check navigation boundaries
  const canSelectPrevious =
    monthDate !== null &&
    notesInMonth.length > 0 &&
    notesInMonth.indexOf(monthDate) > 0;

  const canSelectNext =
    monthDate !== null &&
    notesInMonth.length > 0 &&
    notesInMonth.indexOf(monthDate) < notesInMonth.length - 1;

  return {
    selectedDate: monthDate,
    notesInMonth,
    selectDate,
    selectPreviousNote,
    selectNextNote,
    canSelectPrevious,
    canSelectNext,
    isCurrentMonth,
  };
}
