import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getTodayString, isFuture, parseDate } from "../utils/date";
import { AuthState, ViewType } from "../types";
import { AppMode } from "../utils/appMode";
import { resolveUrlState, serializeUrlState } from "../utils/urlState";
import { AUTH_HAS_LOGGED_IN_KEY, INTRO_SEEN_KEY } from "../utils/constants";

function shouldShowIntro(search: string): boolean {
  if (typeof window === "undefined") return false;
  const hasParams = new URLSearchParams(search).toString().length > 0;
  if (hasParams) return false;
  if (localStorage.getItem(INTRO_SEEN_KEY) === "1") return false;
  return localStorage.getItem(AUTH_HAS_LOGGED_IN_KEY) !== "1";
}

function shouldGateAuth(mode: AppMode): boolean {
  if (typeof window === "undefined") return false;
  return (
    mode === AppMode.Cloud &&
    localStorage.getItem(AUTH_HAS_LOGGED_IN_KEY) === "1"
  );
}

interface UseUrlStateProps {
  authState: AuthState;
  mode: AppMode;
}

export function useUrlState({ authState, mode }: UseUrlStateProps) {
  const initialShowIntro =
    typeof window === "undefined"
      ? false
      : shouldShowIntro(window.location.search);
  const [state, setState] = useState(() => {
    // SSR-safe: check if window is available
    if (typeof window === "undefined") {
      return {
        view: ViewType.Calendar,
        date: null,
        year: new Date().getFullYear(),
        month: null,
        monthDate: null,
      };
    }
    const resolved = resolveUrlState(window.location.search);
    if (initialShowIntro) {
      return {
        view: ViewType.Calendar,
        date: null,
        year: resolved.state.year,
        month: null,
        monthDate: null,
      };
    }
    return resolved.state;
  });
  const stateRef = useRef(state);
  const lastCalendarRef = useRef<{ year: number; month: number | null } | null>(
    null,
  );
  const [showIntro, setShowIntro] = useState(initialShowIntro);
  const skippedRedirectRef = useRef(initialShowIntro);

  // Gate note view when user has logged in before but session expired
  const isAuthGated = useMemo(() => {
    return shouldGateAuth(mode) && authState !== AuthState.SignedIn;
  }, [authState, mode]);

  // Effective state: if auth-gated, force calendar view
  const effectiveState = useMemo(() => {
    if (isAuthGated && state.view === ViewType.Note) {
      return {
        view: ViewType.Calendar,
        date: null,
        year: state.year,
        month: state.month,
        monthDate: null,
      };
    }
    return state;
  }, [isAuthGated, state]);

  // Track if we're gated to skip initial redirect
  useEffect(() => {
    stateRef.current = state;
    if (state.view === ViewType.Calendar) {
      lastCalendarRef.current = { year: state.year, month: state.month };
    }
  }, [state]);

  // Handle browser back/forward navigation
  useEffect(() => {
    if (isAuthGated) {
      skippedRedirectRef.current = true;
    }
  }, [isAuthGated]);

  // Handle browser back/forward navigation
  useEffect(() => {
    // SSR-safe
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      setState(resolveUrlState(window.location.search).state);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Handle initial redirect if needed
  useEffect(() => {
    // SSR-safe
    if (typeof window === "undefined") return;

    const resolved = resolveUrlState(window.location.search);
    if (resolved.needsRedirect && !showIntro && !skippedRedirectRef.current) {
      window.history.replaceState({}, "", resolved.canonicalSearch);
    }
  }, [showIntro]);

  const dismissIntro = useCallback(() => {
    setShowIntro(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    }
  }, []);

  const navigateToDate = useCallback((date: string) => {
    if (typeof window === "undefined") return;
    if (!isFuture(date)) {
      if (stateRef.current.view === ViewType.Calendar) {
        lastCalendarRef.current = {
          year: stateRef.current.year,
          month: stateRef.current.month,
        };
      }
      const parsed = parseDate(date);
      const year = parsed?.getFullYear() ?? new Date().getFullYear();
      const nextState = {
        view: ViewType.Note,
        date,
        year,
        month: null,
        monthDate: null,
      };
      window.history.pushState({}, "", serializeUrlState(nextState));
      setState(nextState);
    }
  }, []);

  const startWriting = useCallback(() => {
    dismissIntro();
    navigateToDate(getTodayString());
  }, [dismissIntro, navigateToDate]);

  const navigateToCalendar = useCallback(
    (year?: number) => {
      if (typeof window === "undefined") return;
      const targetYear = year ?? state.year ?? new Date().getFullYear();
      const nextState = {
        view: ViewType.Calendar,
        date: null,
        year: targetYear,
        month: null,
        monthDate: null,
      };
      window.history.pushState({}, "", serializeUrlState(nextState));
      setState(nextState);
    },
    [state.year],
  );

  const navigateBackToCalendar = useCallback(() => {
    if (typeof window === "undefined") return;
    const fallbackYear = stateRef.current.year ?? new Date().getFullYear();
    const last = lastCalendarRef.current;
    const nextState = {
      view: ViewType.Calendar,
      date: null,
      year: last?.year ?? fallbackYear,
      month: last?.month ?? null,
      monthDate: null,
    };
    window.history.pushState({}, "", serializeUrlState(nextState));
    setState(nextState);
  }, []);

  const navigateToYear = useCallback((year: number) => {
    if (typeof window === "undefined") return;
    const nextState = {
      view: ViewType.Calendar,
      date: null,
      year,
      month: null,
      monthDate: null,
    };
    window.history.pushState({}, "", serializeUrlState(nextState));
    setState(nextState);
  }, []);

  const navigateToMonth = useCallback((year: number, month: number) => {
    if (typeof window === "undefined") return;
    const nextState = {
      view: ViewType.Calendar,
      date: null,
      year,
      month,
      monthDate: null,
    };
    window.history.pushState({}, "", serializeUrlState(nextState));
    setState(nextState);
  }, []);

  // Navigate to a date within month view (updates URL with both month and date)
  const navigateToMonthDate = useCallback((date: string) => {
    if (typeof window === "undefined") return;
    if (isFuture(date)) return;

    const parsed = parseDate(date);
    if (!parsed) return;

    const year = parsed.getFullYear();
    const month = parsed.getMonth();
    const nextState = {
      view: ViewType.Calendar,
      date: null,
      year,
      month,
      monthDate: date,
    };
    window.history.pushState({}, "", serializeUrlState(nextState));
    setState(nextState);
  }, []);

  return {
    ...effectiveState,
    showIntro,
    dismissIntro,
    startWriting,
    navigateToDate,
    navigateToCalendar,
    navigateBackToCalendar,
    navigateToYear,
    navigateToMonth,
    navigateToMonthDate,
  };
}

export type UrlState = ReturnType<typeof useUrlState>;
