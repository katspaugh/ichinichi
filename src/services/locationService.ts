/**
 * Location service for geolocation access.
 * Uses timezone/locale heuristics first, then precise geolocation if user confirms.
 */

import { LOCATION_PROMPT_SHOWN_KEY } from "../utils/constants";

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface ApproxLocation {
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export type LocationPermissionState =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "unavailable";

// Map country codes to names
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  UK: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  NZ: "New Zealand",
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  JP: "Japan",
  CN: "China",
  KR: "South Korea",
  BR: "Brazil",
  MX: "Mexico",
  IN: "India",
  RU: "Russia",
  NL: "Netherlands",
  BE: "Belgium",
  CH: "Switzerland",
  AT: "Austria",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  PT: "Portugal",
  IE: "Ireland",
  SG: "Singapore",
  HK: "Hong Kong",
  TW: "Taiwan",
  PH: "Philippines",
  ID: "Indonesia",
  TH: "Thailand",
  VN: "Vietnam",
  MY: "Malaysia",
  ZA: "South Africa",
  AE: "UAE",
  IL: "Israel",
  TR: "Turkey",
  GR: "Greece",
  CZ: "Czechia",
  RO: "Romania",
  HU: "Hungary",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colombia",
  PE: "Peru",
  UA: "Ukraine",
  EG: "Egypt",
  NG: "Nigeria",
};

// Map timezone cities/regions to country codes
const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Anchorage": "US",
  "America/Honolulu": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Montreal": "CA",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
  "America/Buenos_Aires": "AR",
  "America/Santiago": "CL",
  "America/Bogota": "CO",
  "America/Lima": "PE",
  "Europe/London": "GB",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Europe/Zurich": "CH",
  "Europe/Vienna": "AT",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK",
  "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL",
  "Europe/Lisbon": "PT",
  "Europe/Dublin": "IE",
  "Europe/Prague": "CZ",
  "Europe/Budapest": "HU",
  "Europe/Bucharest": "RO",
  "Europe/Athens": "GR",
  "Europe/Istanbul": "TR",
  "Europe/Moscow": "RU",
  "Europe/Kiev": "UA",
  "Asia/Tokyo": "JP",
  "Asia/Shanghai": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Singapore": "SG",
  "Asia/Seoul": "KR",
  "Asia/Taipei": "TW",
  "Asia/Bangkok": "TH",
  "Asia/Jakarta": "ID",
  "Asia/Manila": "PH",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Kolkata": "IN",
  "Asia/Dubai": "AE",
  "Asia/Jerusalem": "IL",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Pacific/Auckland": "NZ",
  "Africa/Johannesburg": "ZA",
  "Africa/Cairo": "EG",
  "Africa/Lagos": "NG",
  "Atlantic/Madeira": "PT",
  "Atlantic/Azores": "PT",
  "Atlantic/Canary": "ES",
};

// Approximate coordinates for major timezones (primary heuristic)
const TIMEZONE_TO_COORDS: Record<
  string,
  { lat: number; lon: number; city: string }
> = {
  "America/New_York": { lat: 40.71, lon: -74.01, city: "New York" },
  "America/Chicago": { lat: 41.88, lon: -87.63, city: "Chicago" },
  "America/Denver": { lat: 39.74, lon: -104.99, city: "Denver" },
  "America/Los_Angeles": { lat: 34.05, lon: -118.24, city: "Los Angeles" },
  "America/Phoenix": { lat: 33.45, lon: -112.07, city: "Phoenix" },
  "America/Anchorage": { lat: 61.22, lon: -149.9, city: "Anchorage" },
  "America/Honolulu": { lat: 21.31, lon: -157.86, city: "Honolulu" },
  "America/Toronto": { lat: 43.65, lon: -79.38, city: "Toronto" },
  "America/Vancouver": { lat: 49.28, lon: -123.12, city: "Vancouver" },
  "America/Montreal": { lat: 45.5, lon: -73.57, city: "Montreal" },
  "America/Mexico_City": { lat: 19.43, lon: -99.13, city: "Mexico City" },
  "America/Sao_Paulo": { lat: -23.55, lon: -46.63, city: "São Paulo" },
  "America/Buenos_Aires": { lat: -34.6, lon: -58.38, city: "Buenos Aires" },
  "America/Santiago": { lat: -33.45, lon: -70.67, city: "Santiago" },
  "America/Bogota": { lat: 4.71, lon: -74.07, city: "Bogotá" },
  "America/Lima": { lat: -12.05, lon: -77.04, city: "Lima" },
  "Europe/London": { lat: 51.51, lon: -0.13, city: "London" },
  "Europe/Paris": { lat: 48.86, lon: 2.35, city: "Paris" },
  "Europe/Berlin": { lat: 52.52, lon: 13.41, city: "Berlin" },
  "Europe/Madrid": { lat: 40.42, lon: -3.7, city: "Madrid" },
  "Europe/Rome": { lat: 41.9, lon: 12.5, city: "Rome" },
  "Europe/Amsterdam": { lat: 52.37, lon: 4.9, city: "Amsterdam" },
  "Europe/Brussels": { lat: 50.85, lon: 4.35, city: "Brussels" },
  "Europe/Zurich": { lat: 47.37, lon: 8.54, city: "Zurich" },
  "Europe/Vienna": { lat: 48.21, lon: 16.37, city: "Vienna" },
  "Europe/Stockholm": { lat: 59.33, lon: 18.07, city: "Stockholm" },
  "Europe/Oslo": { lat: 59.91, lon: 10.75, city: "Oslo" },
  "Europe/Copenhagen": { lat: 55.68, lon: 12.57, city: "Copenhagen" },
  "Europe/Helsinki": { lat: 60.17, lon: 24.94, city: "Helsinki" },
  "Europe/Warsaw": { lat: 52.23, lon: 21.01, city: "Warsaw" },
  "Europe/Lisbon": { lat: 38.72, lon: -9.14, city: "Lisbon" },
  "Europe/Dublin": { lat: 53.35, lon: -6.26, city: "Dublin" },
  "Europe/Prague": { lat: 50.08, lon: 14.44, city: "Prague" },
  "Europe/Budapest": { lat: 47.5, lon: 19.04, city: "Budapest" },
  "Europe/Bucharest": { lat: 44.43, lon: 26.1, city: "Bucharest" },
  "Europe/Athens": { lat: 37.98, lon: 23.73, city: "Athens" },
  "Europe/Istanbul": { lat: 41.01, lon: 28.98, city: "Istanbul" },
  "Europe/Moscow": { lat: 55.76, lon: 37.62, city: "Moscow" },
  "Europe/Kiev": { lat: 50.45, lon: 30.52, city: "Kyiv" },
  "Asia/Tokyo": { lat: 35.68, lon: 139.69, city: "Tokyo" },
  "Asia/Shanghai": { lat: 31.23, lon: 121.47, city: "Shanghai" },
  "Asia/Hong_Kong": { lat: 22.32, lon: 114.17, city: "Hong Kong" },
  "Asia/Singapore": { lat: 1.35, lon: 103.82, city: "Singapore" },
  "Asia/Seoul": { lat: 37.57, lon: 126.98, city: "Seoul" },
  "Asia/Taipei": { lat: 25.03, lon: 121.57, city: "Taipei" },
  "Asia/Bangkok": { lat: 13.76, lon: 100.5, city: "Bangkok" },
  "Asia/Jakarta": { lat: -6.21, lon: 106.85, city: "Jakarta" },
  "Asia/Manila": { lat: 14.6, lon: 120.98, city: "Manila" },
  "Asia/Ho_Chi_Minh": { lat: 10.82, lon: 106.63, city: "Ho Chi Minh City" },
  "Asia/Kuala_Lumpur": { lat: 3.14, lon: 101.69, city: "Kuala Lumpur" },
  "Asia/Kolkata": { lat: 22.57, lon: 88.36, city: "Kolkata" },
  "Asia/Dubai": { lat: 25.2, lon: 55.27, city: "Dubai" },
  "Asia/Jerusalem": { lat: 31.77, lon: 35.22, city: "Jerusalem" },
  "Australia/Sydney": { lat: -33.87, lon: 151.21, city: "Sydney" },
  "Australia/Melbourne": { lat: -37.81, lon: 144.96, city: "Melbourne" },
  "Australia/Brisbane": { lat: -27.47, lon: 153.03, city: "Brisbane" },
  "Australia/Perth": { lat: -31.95, lon: 115.86, city: "Perth" },
  "Pacific/Auckland": { lat: -36.85, lon: 174.76, city: "Auckland" },
  "Africa/Johannesburg": { lat: -26.2, lon: 28.04, city: "Johannesburg" },
  "Africa/Cairo": { lat: 30.04, lon: 31.24, city: "Cairo" },
  "Africa/Lagos": { lat: 6.52, lon: 3.38, city: "Lagos" },
  "Atlantic/Madeira": { lat: 32.67, lon: -16.92, city: "Funchal" },
  "Atlantic/Azores": { lat: 37.75, lon: -25.67, city: "Ponta Delgada" },
  "Atlantic/Canary": { lat: 28.12, lon: -15.44, city: "Las Palmas" },
};

// Fallback timezone mappings for less common zones
const TIMEZONE_FALLBACKS: Record<string, string> = {
  // US regional variations -> major city
  "America/Detroit": "America/New_York",
  "America/Indiana/Indianapolis": "America/New_York",
  "America/Indiana/Knox": "America/Chicago",
  "America/Indiana/Marengo": "America/New_York",
  "America/Indiana/Petersburg": "America/New_York",
  "America/Indiana/Tell_City": "America/Chicago",
  "America/Indiana/Vevay": "America/New_York",
  "America/Indiana/Vincennes": "America/New_York",
  "America/Indiana/Winamac": "America/New_York",
  "America/Kentucky/Louisville": "America/New_York",
  "America/Kentucky/Monticello": "America/New_York",
  "America/North_Dakota/Beulah": "America/Chicago",
  "America/North_Dakota/Center": "America/Chicago",
  "America/North_Dakota/New_Salem": "America/Chicago",
  "America/Boise": "America/Denver",
  "America/Menominee": "America/Chicago",
  // Canada variations
  "America/Edmonton": "America/Denver",
  "America/Winnipeg": "America/Chicago",
  "America/Halifax": "America/New_York",
  "America/St_Johns": "America/New_York",
  "America/Regina": "America/Denver",
  // Australia variations
  "Australia/Adelaide": "Australia/Sydney",
  "Australia/Darwin": "Australia/Brisbane",
  "Australia/Hobart": "Australia/Sydney",
  // Europe variations
  "Europe/Kyiv": "Europe/Kiev",
};

const REGION_DEFAULT_CITY: Record<
  string,
  { city: string; lat: number; lon: number }
> = {
  US: { city: "New York", lat: 40.71, lon: -74.01 },
  GB: { city: "London", lat: 51.51, lon: -0.13 },
  CA: { city: "Toronto", lat: 43.65, lon: -79.38 },
  AU: { city: "Sydney", lat: -33.87, lon: 151.21 },
  NZ: { city: "Auckland", lat: -36.85, lon: 174.76 },
  DE: { city: "Berlin", lat: 52.52, lon: 13.41 },
  FR: { city: "Paris", lat: 48.86, lon: 2.35 },
  ES: { city: "Madrid", lat: 40.42, lon: -3.7 },
  IT: { city: "Rome", lat: 41.9, lon: 12.5 },
  JP: { city: "Tokyo", lat: 35.68, lon: 139.69 },
  CN: { city: "Shanghai", lat: 31.23, lon: 121.47 },
  KR: { city: "Seoul", lat: 37.57, lon: 126.98 },
  BR: { city: "São Paulo", lat: -23.55, lon: -46.63 },
  MX: { city: "Mexico City", lat: 19.43, lon: -99.13 },
  IN: { city: "Kolkata", lat: 22.57, lon: 88.36 },
};

function getLocaleRegion(): string | null {
  if (typeof navigator !== "undefined" && navigator.language) {
    try {
      if (typeof Intl !== "undefined" && "Locale" in Intl) {
        const locale = new Intl.Locale(navigator.language);
        if (locale.region) {
          return locale.region;
        }
      }
      const parts = navigator.language.split("-");
      if (parts.length > 1) {
        return parts[1].toUpperCase();
      }
    } catch {
      // Ignore locale parsing failures
    }
  }
  return null;
}

/**
 * Get approximate location from timezone.
 * Primary heuristic for coarse location detection.
 */
function getLocationFromTimezone(): ApproxLocation | null {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) {
      return null;
    }

    // Try exact match first
    let matchedTimezone = timezone;
    if (!TIMEZONE_TO_COORDS[matchedTimezone]) {
      // Try fallback mapping
      matchedTimezone = TIMEZONE_FALLBACKS[timezone] || "";
    }

    if (matchedTimezone && TIMEZONE_TO_COORDS[matchedTimezone]) {
      const coords = TIMEZONE_TO_COORDS[matchedTimezone];
      const countryCode = TIMEZONE_TO_COUNTRY[matchedTimezone];
      const country = countryCode ? COUNTRY_NAMES[countryCode] || "" : "";
      return {
        city: coords.city,
        country,
        lat: coords.lat,
        lon: coords.lon,
      };
    }
  } catch {
    // Intl API not available
  }
  return null;
}

class LocationService {
  private cachedPermissionState: LocationPermissionState | null = null;
  private cachedApproxLocation: ApproxLocation | null = null;

  /**
   * Get approximate location from timezone/locale heuristics.
   */
  async getApproxLocation(): Promise<ApproxLocation | null> {
    if (this.cachedApproxLocation) {
      return this.cachedApproxLocation;
    }

    const tzLocation = getLocationFromTimezone();
    if (tzLocation) {
      this.cachedApproxLocation = tzLocation;
      return tzLocation;
    }

    const region = getLocaleRegion();
    if (region && REGION_DEFAULT_CITY[region]) {
      const fallback = REGION_DEFAULT_CITY[region];
      const country = COUNTRY_NAMES[region] || "";
      this.cachedApproxLocation = {
        city: fallback.city,
        country,
        lat: fallback.lat,
        lon: fallback.lon,
      };
      return this.cachedApproxLocation;
    }

    return null;
  }

  /**
   * Get precise position via browser geolocation.
   * Requires user permission, more accurate than timezone/locale heuristics.
   */
  async getCurrentPosition(): Promise<Coordinates | null> {
    if (!("geolocation" in navigator)) {
      return null;
    }

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false, // Faster, good enough for weather
            timeout: 10000,
            maximumAge: 300000, // 5 minutes - browser caches position
          });
        }
      );

      this.cachedPermissionState = "granted";

      return {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };
    } catch (error) {
      const geoError = error as GeolocationPositionError;
      if (geoError.code === GeolocationPositionError.PERMISSION_DENIED) {
        this.cachedPermissionState = "denied";
      }
      console.warn("Geolocation error:", geoError.message);
      return null;
    }
  }

  /**
   * Check if geolocation is available and what the permission state is.
   */
  async getPermissionState(): Promise<LocationPermissionState> {
    if (!("geolocation" in navigator)) {
      return "unavailable";
    }

    // Use cached state if available
    if (this.cachedPermissionState) {
      return this.cachedPermissionState;
    }

    // Check Permissions API if available
    if ("permissions" in navigator) {
      try {
        const result = await navigator.permissions.query({
          name: "geolocation",
        });
        this.cachedPermissionState = result.state as LocationPermissionState;

        // Listen for permission changes
        result.addEventListener("change", () => {
          this.cachedPermissionState = result.state as LocationPermissionState;
        });

        return this.cachedPermissionState;
      } catch {
        // Permissions API not supported for geolocation
      }
    }

    return "unknown";
  }

  /**
   * Check if we have already shown the location prompt.
   */
  hasShownPrompt(): boolean {
    return localStorage.getItem(LOCATION_PROMPT_SHOWN_KEY) === "true";
  }

  /**
   * Mark that we've shown the prompt (so we don't keep asking).
   */
  setPromptShown(): void {
    localStorage.setItem(LOCATION_PROMPT_SHOWN_KEY, "true");
  }

  /**
   * Reset prompt shown state (for testing).
   */
  resetPromptShown(): void {
    localStorage.removeItem(LOCATION_PROMPT_SHOWN_KEY);
    this.cachedPermissionState = null;
  }

  /**
   * Check if we should show the location prompt.
   * Returns true if:
   * - We haven't shown the prompt before
   * - Permission is not already granted or denied
   */
  async shouldShowPrompt(): Promise<boolean> {
    if (this.hasShownPrompt()) {
      return false;
    }

    const state = await this.getPermissionState();
    return state === "unknown" || state === "prompt";
  }
}

// Singleton instance
export const locationService = new LocationService();
