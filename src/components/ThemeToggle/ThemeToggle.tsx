import { useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import type { ThemePreference } from "../../services/themePreferences";
import styles from "./ThemeToggle.module.css";

const LABELS: Record<ThemePreference, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function AutoIcon() {
  // Combined sun/moon icon with diagonal separator
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Sun rays on the left side */}
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="12" y1="21" x2="12" y2="23" />
      {/* Moon crescent */}
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      {/* Diagonal separator */}
      <line x1="4" y1="20" x2="20" y2="4" />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, resolvedTheme, cycleTheme } = useTheme();
  const [hasInteracted, setHasInteracted] = useState(false);

  const handleClick = () => {
    setHasInteracted(true);
    cycleTheme();
  };

  // Determine which icon to show:
  // - System mode, never interacted: show current OS theme (sun/moon)
  // - System mode, has interacted: show system/auto icon
  // - Light mode: show sun
  // - Dark mode: show moon
  let icon: React.ReactNode;
  if (theme === "system" && !hasInteracted) {
    icon = resolvedTheme === "dark" ? <MoonIcon /> : <SunIcon />;
  } else if (theme === "system") {
    icon = <AutoIcon />;
  } else if (theme === "dark") {
    icon = <MoonIcon />;
  } else {
    icon = <SunIcon />;
  }

  return (
    <button
      className={styles.toggle}
      onClick={handleClick}
      aria-label={LABELS[theme]}
      title={LABELS[theme]}
    >
      {icon}
    </button>
  );
}
