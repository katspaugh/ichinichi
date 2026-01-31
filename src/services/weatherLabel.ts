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
 * Fetch weather and update all pending HRs in the editor.
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

  // Try to get location
  const position = await locationService.getCurrentPosition();
  if (!position) {
    return false;
  }

  // Fetch weather
  const weather = await weatherService.getCurrentWeather(
    position.lat,
    position.lon,
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
 * Check if we should show the location prompt.
 * This is called when the first HR is being inserted.
 */
export async function shouldShowLocationPrompt(): Promise<boolean> {
  return locationService.shouldShowPrompt();
}

/**
 * Try to prefetch weather data.
 * Called after location permission is granted.
 */
export async function prefetchWeather(): Promise<void> {
  const position = await locationService.getCurrentPosition();
  if (position) {
    await weatherService.getCurrentWeather(position.lat, position.lon);
  }
}
