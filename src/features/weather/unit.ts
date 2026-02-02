import type { UnitPreference } from "./WeatherPreferences";

export function isLikelyUS(): boolean {
  try {
    if (
      typeof Intl !== "undefined" &&
      "Locale" in Intl &&
      typeof navigator !== "undefined" &&
      navigator.language
    ) {
      const locale = new Intl.Locale(navigator.language);
      if (locale.region === "US") {
        return true;
      }
    }
  } catch {
    // Ignore locale parsing failures
  }

  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return false;
    return (
      timezone.startsWith("America/") &&
      !timezone.startsWith("America/Sao_Paulo") &&
      !timezone.startsWith("America/Bogota") &&
      !timezone.startsWith("America/Buenos_Aires") &&
      !timezone.startsWith("America/Santiago") &&
      !timezone.startsWith("America/Lima") &&
      !timezone.startsWith("America/Mexico_City")
    );
  } catch {
    // Intl API not available
  }

  return false;
}

export function resolveUnitPreference(
  preference: UnitPreference,
): "C" | "F" {
  if (preference === "C" || preference === "F") return preference;
  return isLikelyUS() ? "F" : "C";
}
