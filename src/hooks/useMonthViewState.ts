import { useCallback } from "react";
import { parseDate } from "../utils/date";

interface UseMonthViewStateProps {
  date: string;
  noteDates: Set<string>;
  navigateToDate: (date: string) => void;
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

export function useMonthViewState({
  date,
  noteDates,
  navigateToDate,
}: UseMonthViewStateProps) {
  const parsedDate = parseDate(date);
  const year = parsedDate?.getFullYear() ?? new Date().getFullYear();
  const month = parsedDate?.getMonth() ?? new Date().getMonth();
  const notesInMonth = getNotesInMonth(noteDates, year, month);

  const selectDate = useCallback(
    (nextDate: string) => {
      navigateToDate(nextDate);
    },
    [navigateToDate],
  );

  const selectPreviousNote = useCallback(() => {
    if (notesInMonth.length === 0) return;

    const currentIndex = notesInMonth.indexOf(date);
    if (currentIndex > 0) {
      navigateToDate(notesInMonth[currentIndex - 1]);
    }
  }, [date, notesInMonth, navigateToDate]);

  const selectNextNote = useCallback(() => {
    if (notesInMonth.length === 0) return;

    const currentIndex = notesInMonth.indexOf(date);
    if (currentIndex >= 0 && currentIndex < notesInMonth.length - 1) {
      navigateToDate(notesInMonth[currentIndex + 1]);
    }
  }, [date, notesInMonth, navigateToDate]);

  const canSelectPrevious =
    notesInMonth.length > 0 && notesInMonth.indexOf(date) > 0;

  const canSelectNext =
    notesInMonth.length > 0 &&
    notesInMonth.indexOf(date) < notesInMonth.length - 1 &&
    notesInMonth.indexOf(date) !== -1;

  return {
    selectedDate: date,
    notesInMonth,
    selectDate,
    selectPreviousNote,
    selectNextNote,
    canSelectPrevious,
    canSelectNext,
  };
}
