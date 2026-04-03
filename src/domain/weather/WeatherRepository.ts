import { type UnitPreference } from "./WeatherPreferences";
import { resolveUnitPreference } from "./unit";

export interface WeatherData {
  temperature: number;
  icon: string;
  city: string;
  timestamp: number;
  unit: "C" | "F";
}

export interface DailyWeatherData {
  temperatureHigh: number;
  temperatureLow: number;
  icon: string;
  city: string;
  timestamp: number;
  unit: "C" | "F";
}

export type WeatherCacheKey = string;

// WMO Weather interpretation codes to emoji icons
// https://open-meteo.com/en/docs
const WEATHER_ICONS: Record<number, string> = {
  0: "☀️",
  1: "🌤️",
  2: "⛅",
  3: "☁️",
  45: "🌫️",
  48: "🌫️",
  51: "🌧️",
  53: "🌧️",
  55: "🌧️",
  56: "🌧️",
  57: "🌧️",
  61: "🌧️",
  63: "🌧️",
  65: "🌧️",
  66: "🌧️",
  67: "🌧️",
  71: "🌨️",
  73: "🌨️",
  75: "❄️",
  77: "🌨️",
  80: "🌦️",
  81: "🌦️",
  82: "🌧️",
  85: "🌨️",
  86: "🌨️",
  95: "⛈️",
  96: "⛈️",
  99: "⛈️",
};

function getWeatherIcon(code: number): string {
  return WEATHER_ICONS[code] ?? "🌡️";
}

interface GeocodingResult {
  city: string;
  countryCode: string | null;
}

async function fetchGeocodingData(
  lat: number,
  lon: number,
): Promise<GeocodingResult> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent": "Ichinichi/1.0",
      },
    });

    if (!response.ok) {
      return { city: "", countryCode: null };
    }

    const data = await response.json();
    const address = data.address || {};
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.county ||
      "";
    const countryCode = address.country_code?.toUpperCase() || null;

    return { city, countryCode };
  } catch {
    return { city: "", countryCode: null };
  }
}

export class WeatherRepository {
  private cache = new Map<WeatherCacheKey, WeatherData>();
  private dailyCache = new Map<WeatherCacheKey, DailyWeatherData>();
  private cacheExpiry = 10 * 60 * 1000; // 10 minutes

  private getCacheKey(
    lat: number,
    lon: number,
    unit: "C" | "F",
  ): WeatherCacheKey {
    return `${lat.toFixed(3)}:${lon.toFixed(3)}:${unit}`;
  }

  getCachedWeather(
    lat: number,
    lon: number,
    unit: "C" | "F",
  ): WeatherData | null {
    const key = this.getCacheKey(lat, lon, unit);
    const entry = this.cache.get(key);
    if (!entry) return null;
    const age = Date.now() - entry.timestamp;
    if (age > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }
    return entry;
  }

  clearCache(): void {
    this.cache.clear();
    this.dailyCache.clear();
  }

  async getCurrentWeather(
    lat: number,
    lon: number,
    unitPreference: UnitPreference,
  ): Promise<WeatherData | null> {
    try {
      // Fetch geocoding first to get country code for unit resolution
      const geocoding = await fetchGeocodingData(lat, lon);
      const unit = resolveUnitPreference(unitPreference, {
        countryCode: geocoding.countryCode,
      });

      const cached = this.getCachedWeather(lat, lon, unit);
      if (cached) return cached;

      const tempUnitQuery = unit === "F" ? "&temperature_unit=fahrenheit" : "";
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code${tempUnitQuery}`;

      const weatherResponse = await fetch(weatherUrl, {
        signal: AbortSignal.timeout(5000),
      });

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
        city: geocoding.city,
        timestamp: Date.now(),
        unit,
      };

      const key = this.getCacheKey(lat, lon, unit);
      this.cache.set(key, weatherData);
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

  async getDailyWeather(
    lat: number,
    lon: number,
    unitPreference: UnitPreference,
  ): Promise<DailyWeatherData | null> {
    try {
      const geocoding = await fetchGeocodingData(lat, lon);
      const unit = resolveUnitPreference(unitPreference, {
        countryCode: geocoding.countryCode,
      });

      const dailyKey = `daily:${this.getCacheKey(lat, lon, unit)}`;
      const cached = this.dailyCache.get(dailyKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached;
      }

      const tempUnitQuery = unit === "F" ? "&temperature_unit=fahrenheit" : "";
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=1${tempUnitQuery}`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.warn("Weather API returned error:", response.status);
        return null;
      }

      const data = await response.json();
      if (data.daily?.temperature_2m_max?.[0] == null) {
        console.warn("Weather API response missing daily data");
        return null;
      }

      const dailyData: DailyWeatherData = {
        temperatureHigh: Math.round(data.daily.temperature_2m_max[0]),
        temperatureLow: Math.round(data.daily.temperature_2m_min[0]),
        icon: getWeatherIcon(data.daily.weather_code[0]),
        city: geocoding.city,
        timestamp: Date.now(),
        unit,
      };

      this.dailyCache.set(dailyKey, dailyData);
      return dailyData;
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        console.warn("Daily weather API request timed out");
      } else {
        console.warn("Failed to fetch daily weather:", error);
      }
      return null;
    }
  }
}
