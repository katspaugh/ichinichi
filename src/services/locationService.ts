/**
 * Location service for geolocation access.
 * Uses live geolocation (not stored coordinates) to support traveling.
 * Only stores whether we've shown the permission prompt.
 */

import { LOCATION_PROMPT_SHOWN_KEY } from "../utils/constants";

export interface Coordinates {
  lat: number;
  lon: number;
}

export type LocationPermissionState =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "unavailable";

class LocationService {
  private cachedPermissionState: LocationPermissionState | null = null;

  /**
   * Get current position (live, not cached) - works when traveling.
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
   * Detect country from navigator.language for friendly prompt.
   * Returns country name or null if detection fails.
   */
  detectCountry(): string | null {
    const locale = navigator.language;
    if (!locale || !locale.includes("-")) {
      return null;
    }

    // Extract country code from locale (e.g., "en-US" -> "US")
    const parts = locale.split("-");
    const countryCode = parts[parts.length - 1].toUpperCase();

    // Map common country codes to names
    const COUNTRY_NAMES: Record<string, string> = {
      US: "the United States",
      GB: "the United Kingdom",
      UK: "the United Kingdom",
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
      NL: "the Netherlands",
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
      PH: "the Philippines",
      ID: "Indonesia",
      TH: "Thailand",
      VN: "Vietnam",
      MY: "Malaysia",
      ZA: "South Africa",
      AE: "the UAE",
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
    };

    return COUNTRY_NAMES[countryCode] ?? null;
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
