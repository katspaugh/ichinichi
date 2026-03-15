import { formatDate, isToday } from "./date";

const ALLOW_PAST_EDIT_KEY = "dailynote_allow_past_edit";

// Notes are editable until this hour (exclusive) of next day
const LATE_NIGHT_EDIT_UNTIL_HOUR = 3;

export function isPastEditAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ALLOW_PAST_EDIT_KEY) === "1";
}

export function canEditNote(dateStr: string): boolean {
  if (isPastEditAllowed()) {
    return true;
  }
  if (isToday(dateStr)) {
    return true;
  }
  // Allow editing yesterday's note during late night (before 3am)
  if (new Date().getHours() < LATE_NIGHT_EDIT_UNTIL_HOUR) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return dateStr === formatDate(yesterday);
  }
  return false;
}
