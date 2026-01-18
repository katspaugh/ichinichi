import { useState, useEffect, useCallback } from "react";
import {
  getThemePreference,
  setThemePreference,
  type ThemePreference,
} from "../services/themePreferences";

export type ResolvedTheme = "light" | "dark";

interface UseThemeReturn {
  /** User's theme preference: system, light, or dark */
  theme: ThemePreference;
  /** The actual theme being displayed */
  resolvedTheme: ResolvedTheme;
  /** Set a specific theme preference */
  setTheme: (theme: ThemePreference) => void;
  /** Cycle through themes: system → light → dark → system */
  cycleTheme: () => void;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  if (preference === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", preference);
  }
}

const THEME_CYCLE: ThemePreference[] = ["system", "light", "dark"];

export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<ThemePreference>(getThemePreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Apply theme to DOM whenever preference changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: ThemePreference) => {
    setThemePreference(newTheme);
    setThemeState(newTheme);
  }, []);

  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    setTheme(THEME_CYCLE[nextIndex]);
  }, [theme, setTheme]);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  return {
    theme,
    resolvedTheme,
    setTheme,
    cycleTheme,
  };
}
