import { isFuture } from "./date";
import {
  type TimePeriod,
  type Season,
  JOURNALING_PROMPTS,
  PAST_EMPTY_MESSAGES,
  FUTURE_EMPTY_MESSAGES,
} from "./placeholderPrompts";

/**
 * Deterministic hash of a string to a non-negative integer (djb2).
 */
export function stringHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Get time period from hour (0-23). */
export function getTimePeriod(hour: number): TimePeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/** Get season from month index (0-11). Northern hemisphere. */
export function getSeason(month: number): Season {
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter";
}

function isWeekend(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Select a journaling prompt for today.
 * Deterministic within a (date, timePeriod) pair.
 * Accepts optional `salt` to force a different pick (for shuffle).
 */
export function getJournalingPrompt(
  dateStr: string,
  now: Date = new Date(),
  salt = 0,
): string {
  const hour = now.getHours();
  const period = getTimePeriod(hour);
  const season = getSeason(now.getMonth());
  const weekend = isWeekend(now.getDay());

  const candidates = JOURNALING_PROMPTS.filter((p) => {
    if (!p.periods.includes(period)) return false;
    if (p.seasons && !p.seasons.includes(season)) return false;
    if (p.weekendOnly && !weekend) return false;
    if (p.weekdayOnly && weekend) return false;
    return true;
  });

  // Fallback: if no candidates after all filters, use period-only
  const pool =
    candidates.length > 0
      ? candidates
      : JOURNALING_PROMPTS.filter((p) => p.periods.includes(period));

  const hash = stringHash(dateStr + period + (salt > 0 ? String(salt) : ""));
  return pool[hash % pool.length].text;
}

/** Get an empty-note message for a past date. Deterministic per date. */
export function getPastEmptyMessage(dateStr: string): string {
  const hash = stringHash(dateStr);
  return PAST_EMPTY_MESSAGES[hash % PAST_EMPTY_MESSAGES.length];
}

/** Get an empty-note message for a future date. Deterministic per date. */
export function getFutureEmptyMessage(dateStr: string): string {
  const hash = stringHash(dateStr);
  return FUTURE_EMPTY_MESSAGES[hash % FUTURE_EMPTY_MESSAGES.length];
}

/**
 * Get the appropriate placeholder text for a note.
 * Replaces the inline ternary in NoteEditor.tsx.
 */
export function getPlaceholderText(options: {
  isContentReady: boolean;
  isDecrypting: boolean;
  isOfflineStub: boolean;
  isEditable: boolean;
  date: string;
  now?: Date;
}): string {
  const { isContentReady, isDecrypting, isOfflineStub, isEditable, date, now } =
    options;

  if (!isContentReady || isDecrypting) return "Loading...";
  if (isOfflineStub)
    return "This note can't be loaded while offline. Go online to view it.";
  if (isEditable) return getJournalingPrompt(date, now);
  if (isFuture(date)) return getFutureEmptyMessage(date);
  return getPastEmptyMessage(date);
}
