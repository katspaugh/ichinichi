import { THEME_KEY } from "../utils/constants";

export type ThemePreference = "system" | "light" | "dark";

const VALID_THEMES: ThemePreference[] = ["system", "light", "dark"];

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(THEME_KEY);
  if (stored && VALID_THEMES.includes(stored as ThemePreference)) {
    return stored as ThemePreference;
  }
  return "system";
}

export function setThemePreference(theme: ThemePreference): void {
  if (typeof window === "undefined") return;
  if (theme === "system") {
    localStorage.removeItem(THEME_KEY);
  } else {
    localStorage.setItem(THEME_KEY, theme);
  }
}
