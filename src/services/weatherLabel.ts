/**
 * Weather label service for HR timestamps.
 * Coordinates between weather and location services to provide weather-enhanced labels.
 */

import { locationService } from "./locationService";
import {
  weatherService,
  formatWeatherLabel,
  type WeatherData,
} from "./weatherService";

const WEATHER_PENDING_ATTR = "data-weather-pending";

export interface TimestampLabelResult {
  label: string;
  needsWeatherUpdate: boolean;
}

/**
 * Format a timestamp label, optionally with weather data.
 */
export function formatTimestampLabelWithWeather(
  timestamp: string,
  weather: WeatherData | null
): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "";

  const time = parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (!weather) {
    return time;
  }

  return `${time} · ${formatWeatherLabel(weather)}`;
}

/**
 * Get a timestamp label, using cached weather if available.
 * Returns whether weather needs to be fetched asynchronously.
 */
export function getTimestampLabel(timestamp: string): TimestampLabelResult {
  const cachedWeather = weatherService.getCachedWeather();

  if (cachedWeather) {
    return {
      label: formatTimestampLabelWithWeather(timestamp, cachedWeather),
      needsWeatherUpdate: false,
    };
  }

  // Return time-only label, mark as needing weather update
  return {
    label: formatTimestampLabelWithWeather(timestamp, null),
    needsWeatherUpdate: true,
  };
}

/**
 * Apply weather to an HR element.
 */
export function applyWeatherToHr(
  hr: HTMLHRElement,
  weather: WeatherData
): void {
  const timestamp = hr.getAttribute("data-timestamp");
  if (!timestamp) return;

  const label = formatTimestampLabelWithWeather(timestamp, weather);
  hr.setAttribute("data-label", label);
  hr.removeAttribute(WEATHER_PENDING_ATTR);
}

/**
 * Mark an HR as needing weather update.
 */
export function markHrWeatherPending(hr: HTMLHRElement): void {
  hr.setAttribute(WEATHER_PENDING_ATTR, "true");
}

/**
 * Check if an HR needs weather update.
 */
export function isHrWeatherPending(hr: HTMLHRElement): boolean {
  return hr.hasAttribute(WEATHER_PENDING_ATTR);
}

/**
 * Fetch weather and update all pending HRs in the editor.
 * Returns true if weather was fetched and applied.
 */
export async function updatePendingHrWeather(
  editor: HTMLElement
): Promise<boolean> {
  const pendingHrs = editor.querySelectorAll<HTMLHRElement>(
    `hr[${WEATHER_PENDING_ATTR}]`
  );

  if (pendingHrs.length === 0) {
    return false;
  }

  // Try to get location
  const position = await locationService.getCurrentPosition();
  if (!position) {
    // Clear pending state - we can't get weather without location
    pendingHrs.forEach((hr) => hr.removeAttribute(WEATHER_PENDING_ATTR));
    return false;
  }

  // Fetch weather
  const weather = await weatherService.getCurrentWeather(
    position.lat,
    position.lon
  );
  if (!weather) {
    // Clear pending state - weather fetch failed
    pendingHrs.forEach((hr) => hr.removeAttribute(WEATHER_PENDING_ATTR));
    return false;
  }

  // Apply weather to all pending HRs
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
