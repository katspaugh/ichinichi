/**
 * Weather service using Open-Meteo API.
 * Provides weather data with 10-minute caching.
 */

import { locationService } from "./locationService";

export interface WeatherData {
  temperature: number;
  icon: string;
  city: string;
  timestamp: number;
}

// WMO Weather interpretation codes to emoji icons
// https://open-meteo.com/en/docs
const WEATHER_ICONS: Record<number, string> = {
  0: "☀️", // Clear sky
  1: "🌤️", // Mainly clear
  2: "⛅", // Partly cloudy
  3: "☁️", // Overcast
  45: "🌫️", // Fog
  48: "🌫️", // Depositing rime fog
  51: "🌧️", // Light drizzle
  53: "🌧️", // Moderate drizzle
  55: "🌧️", // Dense drizzle
  56: "🌧️", // Light freezing drizzle
  57: "🌧️", // Dense freezing drizzle
  61: "🌧️", // Slight rain
  63: "🌧️", // Moderate rain
  65: "🌧️", // Heavy rain
  66: "🌧️", // Light freezing rain
  67: "🌧️", // Heavy freezing rain
  71: "🌨️", // Slight snow
  73: "🌨️", // Moderate snow
  75: "❄️", // Heavy snow
  77: "🌨️", // Snow grains
  80: "🌦️", // Slight rain showers
  81: "🌦️", // Moderate rain showers
  82: "🌧️", // Violent rain showers
  85: "🌨️", // Slight snow showers
  86: "🌨️", // Heavy snow showers
  95: "⛈️", // Thunderstorm
  96: "⛈️", // Thunderstorm with slight hail
  99: "⛈️", // Thunderstorm with heavy hail
};

function getWeatherIcon(code: number): string {
  return WEATHER_ICONS[code] ?? "🌡️";
}

// US timezones
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
];

/**
 * Check if user is in the US based on IP location or timezone.
 */
function isInAmerica(): boolean {
  // Check cached IP location first (most accurate)
  const ipLocation = locationService.getCachedIpLocation();
  if (ipLocation?.country === "United States") {
    return true;
  }

  // Fall back to timezone (location-based)
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone && US_TIMEZONES.includes(timezone)) {
      return true;
    }
  } catch {
    // Intl API not available
  }

  return false;
}

/**
 * Fetch city name from coordinates using OpenStreetMap Nominatim.
 */
async function fetchCityName(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent": "DailyNote/1.0", // Required by Nominatim
      },
    });

    if (!response.ok) {
      return "";
    }

    const data = await response.json();
    // Try to get city, town, village, or municipality
    const address = data.address || {};
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.county ||
      "";

    return city;
  } catch {
    return "";
  }
}

class WeatherService {
  private cache: WeatherData | null = null;
  private cacheExpiry = 10 * 60 * 1000; // 10 minutes (matches HR insertion window)

  /**
   * Get current weather for a given location.
   * Uses Fahrenheit for US locations, Celsius otherwise.
   */
  async getCurrentWeather(
    lat: number,
    lon: number
  ): Promise<WeatherData | null> {
    // Check cache first
    const cached = this.getCachedWeather();
    if (cached) {
      return cached;
    }

    try {
      // Use Fahrenheit for US users, Celsius otherwise
      const tempUnit = isInAmerica() ? "&temperature_unit=fahrenheit" : "";

      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code${tempUnit}`;

      // Fetch weather and city name in parallel
      const [weatherResponse, city] = await Promise.all([
        fetch(weatherUrl, { signal: AbortSignal.timeout(5000) }),
        fetchCityName(lat, lon),
      ]);

      if (!weatherResponse.ok) {
        console.warn("Weather API returned error:", weatherResponse.status);
        return null;
      }

      const data = await weatherResponse.json();

      if (!data.current) {
        console.warn("Weather API response missing current data");
        return null;
      }

      const weatherData: WeatherData = {
        temperature: Math.round(data.current.temperature_2m),
        icon: getWeatherIcon(data.current.weather_code),
        city,
        timestamp: Date.now(),
      };

      this.cache = weatherData;
      return weatherData;
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        console.warn("Weather API request timed out");
      } else {
        console.warn("Failed to fetch weather:", error);
      }
      return null;
    }
  }

  /**
   * Get cached weather data if still valid.
   */
  getCachedWeather(): WeatherData | null {
    if (!this.cache) {
      return null;
    }

    const age = Date.now() - this.cache.timestamp;
    if (age > this.cacheExpiry) {
      this.cache = null;
      return null;
    }

    return this.cache;
  }

  /**
   * Clear the weather cache.
   */
  clearCache(): void {
    this.cache = null;
  }
}

// Singleton instance
export const weatherService = new WeatherService();

/**
 * Format temperature with unit based on location.
 */
export function formatTemperature(temperature: number): string {
  const unit = isInAmerica() ? "F" : "C";
  return `${temperature}°${unit}`;
}

/**
 * Format weather data for display in HR labels.
 * Returns format like "Berlin, 72°F ☀️" or "22°C ☀️" (if no city)
 */
export function formatWeatherLabel(weather: WeatherData): string {
  const temp = formatTemperature(weather.temperature);
  if (weather.city) {
    return `${weather.city}, ${temp} ${weather.icon}`;
  }
  return `${temp} ${weather.icon}`;
}
