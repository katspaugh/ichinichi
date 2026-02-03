import type { UnitPreference } from "./WeatherPreferences";

const US_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "America/Honolulu",
  "America/Detroit",
  "America/Indianapolis",
  "America/Boise",
  "America/Juneau",
  "America/Adak",
  "Pacific/Honolulu",
];

export function isLikelyUS(location?: { countryCode: string | null }): boolean {
  // If we have country code from geocoding API, use it - most accurate
  if (location?.countryCode) {
    return location.countryCode === "US";
  }

  // Fall back to timezone detection
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      // Check for explicit US timezones
      if (US_TIMEZONES.includes(timezone)) {
        return true;
      }
      // If timezone is clearly non-American, return false
      if (
        timezone.startsWith("Europe/") ||
        timezone.startsWith("Asia/") ||
        timezone.startsWith("Africa/") ||
        timezone.startsWith("Australia/") ||
        timezone.startsWith("Pacific/") // except Honolulu, already checked
      ) {
        return false;
      }
    }
  } catch {
    // Intl API not available
  }

  // Fall back to locale region only if timezone didn't give a clear answer
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

  return false;
}

export function resolveUnitPreference(
  preference: UnitPreference,
  location?: { countryCode: string | null },
): "C" | "F" {
  if (preference === "C" || preference === "F") return preference;
  return isLikelyUS(location) ? "F" : "C";
}
