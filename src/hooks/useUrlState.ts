import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getTodayString, isFuture, parseDate } from "../utils/date";
import { AuthState, ViewType } from "../types";
import { AppMode } from "../utils/appMode";
import {
  resolveUrlState,
  serializeUrlState,
  setViewPreference,
} from "../utils/urlState";
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
      };
    }
    const resolved = resolveUrlState(window.location.search);
    if (initialShowIntro) {
      return {
        view: ViewType.Calendar,
        date: null,
        year: resolved.state.year,
      };
    }
    return resolved.state;
  });
  const stateRef = useRef(state);
  const [showIntro, setShowIntro] = useState(initialShowIntro);
  const skippedRedirectRef = useRef(initialShowIntro);

  // Gate note view when user has logged in before but session expired
  const isAuthGated = useMemo(() => {
    return shouldGateAuth(mode) && authState !== AuthState.SignedIn;
  }, [authState, mode]);

  // Effective state: if auth-gated, force calendar view
  const effectiveState = useMemo(() => {
    if (isAuthGated && state.view === ViewType.Day) {
      return {
        view: ViewType.Calendar,
        date: null,
        year: state.year,
      };
    }
    return state;
  }, [isAuthGated, state]);

  // Track if we're gated to skip initial redirect
  useEffect(() => {
    stateRef.current = state;
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
    if (isFuture(date)) return;

    const parsed = parseDate(date);
    const year = parsed?.getFullYear() ?? new Date().getFullYear();
    const nextState = {
      view: ViewType.Day,
      date,
      year,
    };
    setViewPreference("day");
    window.history.pushState({}, "", serializeUrlState(nextState));
    setState(nextState);
  }, []);

  const startWriting = useCallback(() => {
    dismissIntro();
    navigateToDate(getTodayString());
  }, [dismissIntro, navigateToDate]);

  const navigateToCalendar = useCallback(
    (year?: number) => {
      if (typeof window === "undefined") return;
      const targetYear = year ?? stateRef.current.year ?? new Date().getFullYear();
      const nextState = {
        view: ViewType.Calendar,
        date: null,
        year: targetYear,
      };
      setViewPreference("year");
      window.history.pushState({}, "", serializeUrlState(nextState));
      setState(nextState);
    },
    [],
  );

  const navigateBackToCalendar = useCallback(() => {
    navigateToCalendar(stateRef.current.year);
  }, [navigateToCalendar]);

  const navigateToYear = useCallback((year: number) => {
    if (typeof window === "undefined") return;
    const nextState = {
      view: ViewType.Calendar,
      date: null,
      year,
    };
    setViewPreference("year");
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
  };
}

export type RoutingState = ReturnType<typeof useUrlState>;
