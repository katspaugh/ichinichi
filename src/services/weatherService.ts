/**
 * Weather service using Open-Meteo API.
 * Provides weather data with 10-minute caching.
 */

export interface WeatherData {
  temperature: number;
  condition: string;
  timestamp: number;
}

// WMO Weather interpretation codes to human-readable conditions
// https://open-meteo.com/en/docs
const WEATHER_CODES: Record<number, string> = {
  0: "Clear",
  1: "Mostly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light Drizzle",
  53: "Drizzle",
  55: "Heavy Drizzle",
  56: "Freezing Drizzle",
  57: "Freezing Drizzle",
  61: "Light Rain",
  63: "Rain",
  65: "Heavy Rain",
  66: "Freezing Rain",
  67: "Freezing Rain",
  71: "Light Snow",
  73: "Snow",
  75: "Heavy Snow",
  77: "Snow Grains",
  80: "Light Showers",
  81: "Showers",
  82: "Heavy Showers",
  85: "Snow Showers",
  86: "Snow Showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

function getWeatherCondition(code: number): string {
  return WEATHER_CODES[code] ?? "Unknown";
}

class WeatherService {
  private cache: WeatherData | null = null;
  private cacheExpiry = 10 * 60 * 1000; // 10 minutes (matches HR insertion window)

  /**
   * Get current weather for a given location.
   * Uses Fahrenheit for en-US locale, Celsius otherwise.
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
      // Use Fahrenheit for en-US locale, Celsius otherwise
      const useFahrenheit = navigator.language === "en-US";
      const tempUnit = useFahrenheit ? "&temperature_unit=fahrenheit" : "";

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code${tempUnit}`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        console.warn("Weather API returned error:", response.status);
        return null;
      }

      const data = await response.json();

      if (!data.current) {
        console.warn("Weather API response missing current data");
        return null;
      }

      const weatherData: WeatherData = {
        temperature: Math.round(data.current.temperature_2m),
        condition: getWeatherCondition(data.current.weather_code),
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
 * Format temperature with unit based on locale.
 */
export function formatTemperature(temperature: number): string {
  const useFahrenheit = navigator.language === "en-US";
  const unit = useFahrenheit ? "F" : "C";
  return `${temperature}°${unit}`;
}

/**
 * Format weather data for display in HR labels.
 * Returns format like "72°F Sunny" or "22°C Clear"
 */
export function formatWeatherLabel(weather: WeatherData): string {
  return `${formatTemperature(weather.temperature)} ${weather.condition}`;
}
