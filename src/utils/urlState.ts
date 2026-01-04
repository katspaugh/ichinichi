import { ViewType, type UrlState } from '../types';
import { URL_PARAMS } from './constants';
import { getTodayString, isFuture, parseDate } from './date';

interface ResolvedUrlState {
  state: UrlState;
  canonicalSearch: string;
  needsRedirect: boolean;
}

export function resolveUrlState(search: string): ResolvedUrlState {
  const params = new URLSearchParams(search);
  const today = getTodayString();
  const currentYear = new Date().getFullYear();

  if (params.has(URL_PARAMS.YEAR)) {
    const yearParam = params.get(URL_PARAMS.YEAR);
    const year = parseInt(yearParam ?? '', 10) || currentYear;
    return {
      state: { view: ViewType.Calendar, date: null, year },
      canonicalSearch: `?${URL_PARAMS.YEAR}=${year}`,
      needsRedirect: false
    };
  }

  if (params.has(URL_PARAMS.DATE)) {
    const dateParam = params.get(URL_PARAMS.DATE) ?? '';
    const parsed = parseDate(dateParam);
    if (parsed && !isFuture(dateParam)) {
      return {
        state: { view: ViewType.Note, date: dateParam, year: parsed.getFullYear() },
        canonicalSearch: `?${URL_PARAMS.DATE}=${dateParam}`,
        needsRedirect: false
      };
    }

    return {
      state: { view: ViewType.Note, date: today, year: currentYear },
      canonicalSearch: `?${URL_PARAMS.DATE}=${today}`,
      needsRedirect: true
    };
  }

  return {
    state: { view: ViewType.Note, date: today, year: currentYear },
    canonicalSearch: '/',
    needsRedirect: false
  };
}

export function serializeUrlState(state: UrlState): string {
  if (state.view === ViewType.Calendar) {
    return `?${URL_PARAMS.YEAR}=${state.year}`;
  }

  if (state.date) {
    return `?${URL_PARAMS.DATE}=${state.date}`;
  }

  return '/';
}
