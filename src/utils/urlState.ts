import { ViewType, type UrlState } from "../types";
import { URL_PARAMS, VIEW_PREFERENCE_KEY } from "./constants";
import { getTodayString, isFuture, parseDate } from "./date";

export type ViewPreference = "year" | "month";

export function getViewPreference(): ViewPreference {
  if (typeof window === "undefined") return "year";
  const pref = localStorage.getItem(VIEW_PREFERENCE_KEY);
  return pref === "month" ? "month" : "year";
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

export function resolveUrlState(search: string): ResolvedUrlState {
  const params = new URLSearchParams(search);
  const today = getTodayString();
  const currentYear = new Date().getFullYear();

  // Web Share Target: open today's note so the editor can read shared files from cache
  if (params.has("share-target")) {
    return {
      state: {
        view: ViewType.Note,
        date: today,
        year: currentYear,
        month: null,
        monthDate: null,
      },
      canonicalSearch: `?${URL_PARAMS.DATE}=${today}`,
      needsRedirect: false,
    };
  }

  // Check if there's a month param first (combined month+date takes priority)
  if (!params.has(URL_PARAMS.MONTH) && params.has(URL_PARAMS.DATE)) {
    const dateParam = params.get(URL_PARAMS.DATE) ?? "";
    const parsed = parseDate(dateParam);
    if (parsed && !isFuture(dateParam)) {
      return {
        state: {
          view: ViewType.Note,
          date: dateParam,
          year: parsed.getFullYear(),
          month: null,
          monthDate: null,
        },
        canonicalSearch: `?${URL_PARAMS.DATE}=${dateParam}`,
        needsRedirect: false,
      };
    }

    return {
      state: {
        view: ViewType.Note,
        date: today,
        year: currentYear,
        month: null,
        monthDate: null,
      },
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
        // Check if there's also a date param for split view
        let monthDate: string | null = null;
        if (params.has(URL_PARAMS.DATE)) {
          const dateParam = params.get(URL_PARAMS.DATE) ?? "";
          const parsedDate = parseDate(dateParam);
          // Validate date is in the selected month and not in the future
          if (
            parsedDate &&
            !isFuture(dateParam) &&
            parsedDate.getFullYear() === year &&
            parsedDate.getMonth() === month
          ) {
            monthDate = dateParam;
          }
        }
        const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
        const canonicalSearch = monthDate
          ? `?${URL_PARAMS.MONTH}=${monthStr}&${URL_PARAMS.DATE}=${monthDate}`
          : `?${URL_PARAMS.MONTH}=${monthStr}`;
        return {
          state: {
            view: ViewType.Calendar,
            date: null,
            year,
            month,
            monthDate,
          },
          canonicalSearch,
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
      state: {
        view: ViewType.Calendar,
        date: null,
        year,
        month: null,
        monthDate: null,
      },
      canonicalSearch: `?${URL_PARAMS.YEAR}=${year}`,
      needsRedirect: false,
    };
  }

  // No URL params - check view preference
  const preference = getViewPreference();
  if (preference === "month") {
    const currentMonth = new Date().getMonth();
    const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    return {
      state: {
        view: ViewType.Calendar,
        date: null,
        year: currentYear,
        month: currentMonth,
        monthDate: null,
      },
      canonicalSearch: `?${URL_PARAMS.MONTH}=${monthStr}`,
      needsRedirect: true,
    };
  }

  return {
    state: {
      view: ViewType.Calendar,
      date: null,
      year: currentYear,
      month: null,
      monthDate: null,
    },
    canonicalSearch: "/",
    needsRedirect: false,
  };
}

export function serializeUrlState(state: UrlState): string {
  if (state.view === ViewType.Calendar) {
    if (state.month !== null) {
      const monthStr = String(state.month + 1).padStart(2, "0");
      const base = `?${URL_PARAMS.MONTH}=${state.year}-${monthStr}`;
      // Include date in URL if monthDate is set (split view with selected note)
      if (state.monthDate) {
        return `${base}&${URL_PARAMS.DATE}=${state.monthDate}`;
      }
      return base;
    }
    return `?${URL_PARAMS.YEAR}=${state.year}`;
  }

  if (state.date) {
    return `?${URL_PARAMS.DATE}=${state.date}`;
  }

  return "/";
}
