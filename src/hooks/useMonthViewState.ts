import { useCallback, useEffect, useRef } from "react";
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
 * - Past month (navigated forwards in time): select first note in that month
 * - Future month (navigated backwards in time): select latest note in that month
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
  // Track previous month to determine navigation direction
  const prevMonthRef = useRef<{ year: number; month: number } | null>(null);
  const hasAutoSelectedRef = useRef(false);

  // Track if we're coming from a different view (not month view)
  const wasNotInMonthView = useRef(true);

  // Determine if we're viewing the current month
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // Get today's date string
  const todayStr = getTodayString();

  // Get notes in the current month view
  const notesInMonth = getNotesInMonth(noteDates, year, month);

  // Reset refs when leaving month view
  useEffect(() => {
    if (!enabled) {
      prevMonthRef.current = null;
      hasAutoSelectedRef.current = false;
    }
  }, [enabled]);

  // Handle auto-selection on month change
  useEffect(() => {
    // Skip if not in month view
    if (!enabled) {
      return;
    }

    // Don't auto-select if a date is already selected via URL
    if (monthDate) {
      hasAutoSelectedRef.current = true;
      prevMonthRef.current = { year, month };
      wasNotInMonthView.current = false;
      return;
    }

    // Determine navigation direction
    const prev = prevMonthRef.current;
    let direction: "forward" | "backward" | "initial" = "initial";

    if (prev) {
      const prevTime = new Date(prev.year, prev.month).getTime();
      const currentTime = new Date(year, month).getTime();

      if (currentTime > prevTime) {
        direction = "forward"; // Going to a later month
      } else if (currentTime < prevTime) {
        direction = "backward"; // Going to an earlier month
      }
    }

    // Update prev ref
    prevMonthRef.current = { year, month };

    // If already auto-selected for this month, skip
    // But allow auto-selection when coming from year view (prev was null)
    const isFromYearView = prev === null;
    if (
      hasAutoSelectedRef.current &&
      direction === "initial" &&
      !isFromYearView
    ) {
      return;
    }

    // Auto-select logic
    if (isCurrentMonth) {
      // Current month: select today
      hasAutoSelectedRef.current = true;
      navigateToMonthDate(todayStr);
    } else if (notesInMonth.length > 0) {
      hasAutoSelectedRef.current = true;
      if (direction === "forward") {
        // Going forward in time: select first note in month
        navigateToMonthDate(notesInMonth[0]);
      } else {
        // Going backward in time (or initial load): select latest note in month
        navigateToMonthDate(notesInMonth[notesInMonth.length - 1]);
      }
    }
    // If no notes in month, don't auto-select anything (and don't mark as auto-selected
    // so we can retry when noteDates loads)
  }, [
    enabled,
    year,
    month,
    monthDate,
    isCurrentMonth,
    todayStr,
    notesInMonth,
    navigateToMonthDate,
  ]);

  // Reset auto-select flag when month changes
  useEffect(() => {
    return () => {
      hasAutoSelectedRef.current = false;
    };
  }, [year, month]);

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
