import { isToday } from "./date";

const ALLOW_PAST_EDIT_KEY = "dailynote_allow_past_edit";

export function isPastEditAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ALLOW_PAST_EDIT_KEY) === "1";
}

export function canEditNote(dateStr: string): boolean {
  if (isPastEditAllowed()) {
    return true;
  }
  return isToday(dateStr);
}
