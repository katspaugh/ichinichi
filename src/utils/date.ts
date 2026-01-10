import { DayCellState } from "../types";
import {
  getWeekStartPreference,
  setWeekStartPreference as setStoredWeekStartPreference,
} from "../services/preferences";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const FALLBACK_LOCALE = "en-US";

function getResolvedLocale(): string {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
    return Intl.DateTimeFormat().resolvedOptions().locale || FALLBACK_LOCALE;
  }
  return FALLBACK_LOCALE;
}

function getLocaleWeekStart(): number {
  const locale = getResolvedLocale();
  if (typeof Intl !== "undefined" && "Locale" in Intl) {
    try {
      const localeInfo = new Intl.Locale(locale);
      const weekInfo = (
        localeInfo as Intl.Locale & { weekInfo?: { firstDay?: number } }
      ).weekInfo;
      if (weekInfo?.firstDay) {
        return weekInfo.firstDay % 7;
      }
    } catch {
      return 0;
    }
  }
  return 0;
}

export function setWeekStartPreference(dayIndex: number): void {
  setStoredWeekStartPreference(dayIndex);
}

function getWeekStart(): number {
  const stored = getWeekStartPreference();
  if (stored !== null) return stored;
  return getLocaleWeekStart();
}

/**
 * Format a Date object to DD-MM-YYYY string
 */
export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Parse a DD-MM-YYYY string to a Date object
 */
export function parseDate(dateStr: string): Date | null {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  const date = new Date(year, month, day);

  // Validate the date is real (e.g., not Feb 30)
  if (
    date.getDate() !== day ||
    date.getMonth() !== month ||
    date.getFullYear() !== year
  ) {
    return null;
  }

  return date;
}

/**
 * Get today's date as DD-MM-YYYY string
 */
export function getTodayString(): string {
  return formatDate(new Date());
}

/**
 * Format a date string for display (e.g., "Monday, January 1, 2024")
 */
export function formatDateDisplay(dateStr: string): string {
  const date = parseDate(dateStr);
  if (!date) return dateStr;

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Get the state of a day cell relative to today
 */
export function getDayCellState(
  date: Date,
  now: Date = new Date(),
): DayCellState {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);

  if (compareDate.getTime() === today.getTime()) return DayCellState.Today;
  if (compareDate < today) return DayCellState.Past;
  return DayCellState.Future;
}

/**
 * Check if a date string represents today
 */
export function isToday(dateStr: string): boolean {
  return dateStr === getTodayString();
}

/**
 * Check if a date string represents a future date
 */
export function isFuture(dateStr: string): boolean {
  const date = parseDate(dateStr);
  if (!date) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return date > today;
}

/**
 * Get the number of days in a month
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get the day of week the month starts on (0 = Sunday)
 */
export function getFirstDayOfMonth(year: number, month: number): number {
  const dayOfWeek = new Date(year, month, 1).getDay();
  const weekStart = getWeekStart();
  return (dayOfWeek - weekStart + 7) % 7;
}

/**
 * Get month name
 */
export function getMonthName(month: number): string {
  return MONTHS[month];
}

/**
 * Get weekday abbreviations
 */
export function getWeekdayOptions(): Array<{
  label: string;
  dayIndex: number;
}> {
  const locale = getResolvedLocale();
  const weekStart = getWeekStart();
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) {
    return WEEKDAYS.map((label, index) => ({
      label,
      dayIndex: (weekStart + index) % 7,
    }));
  }
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const baseDate = new Date(Date.UTC(2023, 0, 1));
  return Array.from({ length: 7 }, (_, index) => {
    const dayIndex = (weekStart + index) % 7;
    const date = new Date(baseDate);
    date.setUTCDate(baseDate.getUTCDate() + dayIndex);
    return {
      label: formatter.format(date),
      dayIndex,
    };
  });
}

export function getWeekdays(): string[] {
  return getWeekdayOptions().map((weekday) => weekday.label);
}
