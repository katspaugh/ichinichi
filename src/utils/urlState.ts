import { ViewType, type UrlState } from "../types";
import { URL_PARAMS } from "./constants";
import { getTodayString, isFuture, parseDate } from "./date";

interface ResolvedUrlState {
  state: UrlState;
  canonicalSearch: string;
  needsRedirect: boolean;
}

export function resolveUrlState(search: string): ResolvedUrlState {
  const params = new URLSearchParams(search);
  const today = getTodayString();
  const currentYear = new Date().getFullYear();

  if (params.has(URL_PARAMS.DATE)) {
    const dateParam = params.get(URL_PARAMS.DATE) ?? "";
    const parsed = parseDate(dateParam);
    if (parsed && !isFuture(dateParam)) {
      return {
        state: {
          view: ViewType.Note,
          date: dateParam,
          year: parsed.getFullYear(),
          month: null,
        },
        canonicalSearch: `?${URL_PARAMS.DATE}=${dateParam}`,
        needsRedirect: false,
      };
    }

    return {
      state: { view: ViewType.Note, date: today, year: currentYear, month: null },
      canonicalSearch: `?${URL_PARAMS.DATE}=${today}`,
      needsRedirect: true,
    };
  }

  if (params.has(URL_PARAMS.MONTH)) {
    const monthParam = params.get(URL_PARAMS.MONTH) ?? "";
    const match = monthParam.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 0-indexed
      if (month >= 0 && month <= 11) {
        return {
          state: { view: ViewType.Calendar, date: null, year, month },
          canonicalSearch: `?${URL_PARAMS.MONTH}=${year}-${String(month + 1).padStart(2, '0')}`,
          needsRedirect: false,
        };
      }
    }
    // Invalid month format falls through to year view
  }

  if (params.has(URL_PARAMS.YEAR)) {
    const yearParam = params.get(URL_PARAMS.YEAR);
    const year = parseInt(yearParam ?? "", 10) || currentYear;
    return {
      state: { view: ViewType.Calendar, date: null, year, month: null },
      canonicalSearch: `?${URL_PARAMS.YEAR}=${year}`,
      needsRedirect: false,
    };
  }

  return {
    state: { view: ViewType.Calendar, date: null, year: currentYear, month: null },
    canonicalSearch: "/",
    needsRedirect: false,
  };
}

export function serializeUrlState(state: UrlState): string {
  if (state.view === ViewType.Calendar) {
    if (state.month !== null) {
      const monthStr = String(state.month + 1).padStart(2, '0');
      return `?${URL_PARAMS.MONTH}=${state.year}-${monthStr}`;
    }
    return `?${URL_PARAMS.YEAR}=${state.year}`;
  }

  if (state.date) {
    return `?${URL_PARAMS.DATE}=${state.date}`;
  }

  return "/";
}
