import { useState, useEffect, useCallback } from 'react';
import type { UrlState, ViewType } from '../types';
import { URL_PARAMS } from '../utils/constants';
import { getTodayString, parseDate, isFuture } from '../utils/date';

function getUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const dateParam = params.get(URL_PARAMS.DATE);
  const yearParam = params.get(URL_PARAMS.YEAR);

  // If year param is present, show calendar view
  if (yearParam !== null) {
    const year = parseInt(yearParam, 10) || new Date().getFullYear();
    return { view: 'calendar', date: null, year };
  }

  // If date param is present, show note view
  if (dateParam) {
    // Validate the date
    const parsed = parseDate(dateParam);
    if (parsed && !isFuture(dateParam)) {
      const year = parsed.getFullYear();
      return { view: 'note', date: dateParam, year };
    }
    // Invalid or future date - will redirect to today
  }

  // Default: redirect to today's note
  return { view: 'note', date: getTodayString(), year: new Date().getFullYear() };
}

function setUrlParams(view: ViewType, date: string | null, year: number): void {
  const params = new URLSearchParams();

  if (view === 'note' && date) {
    params.set(URL_PARAMS.DATE, date);
  } else if (view === 'calendar') {
    params.set(URL_PARAMS.YEAR, String(year));
  }

  const newUrl = params.toString() ? `?${params.toString()}` : '/';
  window.history.pushState({}, '', newUrl);
}

export function useUrlState() {
  const [state, setState] = useState<UrlState>(getUrlState);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setState(getUrlState());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle initial redirect if needed
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasParams = params.has(URL_PARAMS.DATE) || params.has(URL_PARAMS.YEAR);

    if (!hasParams) {
      // Redirect / to /?date=<today>
      const today = getTodayString();
      window.history.replaceState({}, '', `?${URL_PARAMS.DATE}=${today}`);
    } else {
      // Validate date param
      const dateParam = params.get(URL_PARAMS.DATE);
      if (dateParam) {
        const parsed = parseDate(dateParam);
        if (!parsed || isFuture(dateParam)) {
          // Invalid or future date - redirect to today
          const today = getTodayString();
          window.history.replaceState({}, '', `?${URL_PARAMS.DATE}=${today}`);
          setState(getUrlState());
        }
      }
    }
  }, []);

  const navigateToDate = useCallback((date: string) => {
    if (!isFuture(date)) {
      const parsed = parseDate(date);
      const year = parsed?.getFullYear() ?? new Date().getFullYear();
      setUrlParams('note', date, year);
      setState({ view: 'note', date, year });
    }
  }, []);

  const navigateToCalendar = useCallback((year?: number) => {
    const targetYear = year ?? state.year ?? new Date().getFullYear();
    setUrlParams('calendar', null, targetYear);
    setState({ view: 'calendar', date: null, year: targetYear });
  }, [state.year]);

  const navigateToYear = useCallback((year: number) => {
    setUrlParams('calendar', null, year);
    setState({ view: 'calendar', date: null, year });
  }, []);

  return {
    ...state,
    navigateToDate,
    navigateToCalendar,
    navigateToYear
  };
}
