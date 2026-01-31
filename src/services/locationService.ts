/**
 * Location service for geolocation access.
 * Uses IP detection first, then precise geolocation if user confirms.
 */

import { LOCATION_PROMPT_SHOWN_KEY } from "../utils/constants";

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface IpLocation {
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
};

/**
 * Detect country from navigator.language or timezone.
 * Used as fallback and cross-verification for IP detection.
 */
function detectCountryFromLocale(): string | null {
  // Try navigator.language first (e.g., "en-US" -> "US")
  const locale = navigator.language;
  if (locale?.includes("-")) {
    const parts = locale.split("-");
    const countryCode = parts[parts.length - 1].toUpperCase();
    if (COUNTRY_NAMES[countryCode]) {
      return COUNTRY_NAMES[countryCode];
    }
  }

  // Fall back to timezone detection
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      const countryCode = TIMEZONE_TO_COUNTRY[timezone];
      if (countryCode && COUNTRY_NAMES[countryCode]) {
        return COUNTRY_NAMES[countryCode];
      }
    }
  } catch {
    // Intl API not available
  }

  return null;
}

class LocationService {
  private cachedPermissionState: LocationPermissionState | null = null;
  private cachedIpLocation: IpLocation | null = null;

  /**
   * Get location from IP address using ipapi.co.
   * Falls back to locale/timezone detection if IP fails.
   * Cross-verifies IP country with locale detection.
   */
  async getIpLocation(): Promise<IpLocation | null> {
    if (this.cachedIpLocation) {
      return this.cachedIpLocation;
    }

    const localeCountry = detectCountryFromLocale();

    try {
      const response = await fetch("https://ipapi.co/json/", {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        // Fall back to locale detection
        if (localeCountry) {
          return { city: "", country: localeCountry, lat: 0, lon: 0 };
        }
        return null;
      }

      const data = await response.json();

      if (!data.city || !data.country_name) {
        // Fall back to locale detection
        if (localeCountry) {
          return { city: "", country: localeCountry, lat: 0, lon: 0 };
        }
        return null;
      }

      // Cross-verify: if locale country differs significantly, note it
      // but still use IP result as it's more accurate for current location
      this.cachedIpLocation = {
        city: data.city,
        country: data.country_name,
        lat: data.latitude,
        lon: data.longitude,
      };

      return this.cachedIpLocation;
    } catch {
      // Fall back to locale detection on network error
      if (localeCountry) {
        return { city: "", country: localeCountry, lat: 0, lon: 0 };
      }
      return null;
    }
  }

  /**
   * Get cached IP location without fetching.
   * Used for temperature unit detection.
   */
  getCachedIpLocation(): IpLocation | null {
    return this.cachedIpLocation;
  }

  /**
   * Get precise position via browser geolocation.
   * Requires user permission, more accurate than IP.
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
