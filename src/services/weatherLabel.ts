/**
 * Weather label service for HR timestamps.
 * Coordinates between weather and location services to provide weather-enhanced labels.
 */

import { locationService } from "./locationService";
import {
  formatWeatherLabel,
  weatherService,
  type WeatherData,
} from "./weatherService";

const WEATHER_ATTR = "data-weather";

/**
 * Format a timestamp label (time only).
 */
export function formatTimestampLabel(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "";

  const time = parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return time;
}

/**
 * Get a timestamp label, using cached weather if available.
 * Returns whether weather needs to be fetched asynchronously.
 */
export function getTimestampLabel(timestamp: string): string {
  return formatTimestampLabel(timestamp);
}

export function hasWeatherlessHrs(editor: HTMLElement): boolean {
  return (
    editor.querySelector(`hr[data-timestamp]:not([${WEATHER_ATTR}])`) !== null
  );
}

export function applyWeatherToHr(
  hr: HTMLHRElement,
  weather: WeatherData,
): void {
  hr.setAttribute(WEATHER_ATTR, formatWeatherLabel(weather));
}

/**
 * Fetch weather using IP location and update all pending HRs in the editor.
 * Returns true if weather was fetched and applied.
 */
export async function updatePendingHrWeather(
  editor: HTMLElement,
): Promise<boolean> {
  if (!editor.isConnected) {
    return false;
  }

  const pendingHrs = editor.querySelectorAll<HTMLHRElement>(
    `hr[data-timestamp]:not([${WEATHER_ATTR}])`,
  );
  if (pendingHrs.length === 0) {
    return false;
  }

  // Use IP location (no user prompt needed)
  const ipLocation = await locationService.getIpLocation();
  if (!ipLocation || (ipLocation.lat === 0 && ipLocation.lon === 0)) {
    return false;
  }

  // Fetch weather
  const weather = await weatherService.getCurrentWeather(
    ipLocation.lat,
    ipLocation.lon,
  );
  if (!weather) {
    return false;
  }

  if (!editor.isConnected) {
    return false;
  }

  pendingHrs.forEach((hr) => applyWeatherToHr(hr, weather));
  return true;
}

/**
 * Update weather for a specific HR using precise GPS location.
 * Called when user clicks on weather label and confirms.
 */
export async function updateHrWithPreciseLocation(
  hr: HTMLHRElement,
): Promise<boolean> {
  // Get precise GPS location
  const position = await locationService.getCurrentPosition();
  if (!position) {
    return false;
  }

  // Clear cache to get fresh weather with precise coordinates
  weatherService.clearCache();

  // Fetch weather with precise coordinates
  const weather = await weatherService.getCurrentWeather(
    position.lat,
    position.lon,
  );
  if (!weather) {
    return false;
  }

  if (!hr.isConnected) {
    return false;
  }

  applyWeatherToHr(hr, weather);
  return true;
}

/**
 * Check if an HR element has weather data.
 */
export function hasWeather(hr: HTMLHRElement): boolean {
  return hr.hasAttribute(WEATHER_ATTR);
}
