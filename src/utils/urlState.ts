import { ViewType, type UrlState } from "../types";
import { URL_PARAMS, VIEW_PREFERENCE_KEY } from "./constants";
import { getTodayString, isFuture, parseDate } from "./date";

export type ViewPreference = "year" | "day";

export function getViewPreference(): ViewPreference {
  if (typeof window === "undefined") return "year";
  const pref = localStorage.getItem(VIEW_PREFERENCE_KEY);
  return pref === "day" || pref === "month" ? "day" : "year";
}

export function setViewPreference(preference: ViewPreference): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VIEW_PREFERENCE_KEY, preference);
}

interface ResolvedUrlState {
  state: UrlState;
  canonicalSearch: string;
  needsRedirect: boolean;
}

function createDayState(date: string): UrlState {
  const parsed = parseDate(date);

  return {
    view: ViewType.Day,
    date,
    year: parsed?.getFullYear() ?? new Date().getFullYear(),
  };
}

function createCalendarState(year: number): UrlState {
  return {
    view: ViewType.Calendar,
    date: null,
    year,
  };
}

export function resolveUrlState(search: string): ResolvedUrlState {
  const params = new URLSearchParams(search);
  const today = getTodayString();
  const currentYear = new Date().getFullYear();

  if (params.has("share-target")) {
    return {
      state: createDayState(today),
      canonicalSearch: `?${URL_PARAMS.DATE}=${today}`,
      needsRedirect: false,
    };
  }

  if (params.has(URL_PARAMS.DATE)) {
    const dateParam = params.get(URL_PARAMS.DATE) ?? "";
    const parsed = parseDate(dateParam);

    if (parsed && !isFuture(dateParam)) {
      return {
        state: createDayState(dateParam),
        canonicalSearch: `?${URL_PARAMS.DATE}=${dateParam}`,
        needsRedirect: false,
      };
    }

    return {
      state: createDayState(today),
      canonicalSearch: `?${URL_PARAMS.DATE}=${today}`,
      needsRedirect: true,
    };
  }

  const legacyMonthParam = params.get("month");
  if (legacyMonthParam) {
    const match = legacyMonthParam.match(/^(\d{4})-(\d{2})$/);
    const year = match ? Number.parseInt(match[1], 10) : currentYear;

    return {
      state: createCalendarState(year),
      canonicalSearch: `?${URL_PARAMS.YEAR}=${year}`,
      needsRedirect: true,
    };
  }

  if (params.has(URL_PARAMS.YEAR)) {
    const yearParam = params.get(URL_PARAMS.YEAR) ?? "";
    const year = Number.parseInt(yearParam, 10) || currentYear;

    return {
      state: createCalendarState(year),
      canonicalSearch: `?${URL_PARAMS.YEAR}=${year}`,
      needsRedirect: false,
    };
  }

  if (getViewPreference() === "day") {
    return {
      state: createDayState(today),
      canonicalSearch: `?${URL_PARAMS.DATE}=${today}`,
      needsRedirect: true,
    };
  }

  return {
    state: createCalendarState(currentYear),
    canonicalSearch: "/",
    needsRedirect: false,
  };
}

export function serializeUrlState(state: UrlState): string {
  if (state.view === ViewType.Day) {
    return state.date ? `?${URL_PARAMS.DATE}=${state.date}` : "/";
  }

  if (state.view === ViewType.Calendar) {
    return `?${URL_PARAMS.YEAR}=${state.year}`;
  }

  return "/";
}
