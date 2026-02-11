import { WeatherRepository } from "../features/weather/WeatherRepository";

// Polyfill AbortSignal.timeout for jsdom/Node test environment
if (typeof AbortSignal.timeout !== "function") {
  AbortSignal.timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("TimeoutError", "TimeoutError")), ms);
    return controller.signal;
  };
}

// Mock global fetch
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

function mockFetch(
  implementations: Array<(url: string) => Promise<Response>>,
) {
  let callIndex = 0;
  global.fetch = jest.fn().mockImplementation((url: string) => {
    const impl = implementations[callIndex] ?? implementations[implementations.length - 1];
    callIndex++;
    return impl(url);
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as unknown as Response;
}

// Geocoding response (first fetch), then weather response (second fetch)
function mockGeoAndWeather(
  geo: { city?: string; country_code?: string },
  weather: { temperature_2m: number; weather_code: number },
) {
  mockFetch([
    // Geocoding (nominatim)
    async () =>
      jsonResponse({
        address: {
          city: geo.city ?? "Tokyo",
          country_code: geo.country_code ?? "jp",
        },
      }),
    // Weather (open-meteo)
    async () =>
      jsonResponse({
        current: weather,
      }),
  ]);
}

describe("WeatherRepository", () => {
  describe("getCurrentWeather", () => {
    it("fetches weather and returns formatted data", async () => {
      mockGeoAndWeather(
        { city: "Berlin", country_code: "de" },
        { temperature_2m: 18.3, weather_code: 2 },
      );

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(52.52, 13.41, "C");

      expect(result).not.toBeNull();
      expect(result!.temperature).toBe(18); // rounded
      expect(result!.city).toBe("Berlin");
      expect(result!.icon).toBe("⛅"); // code 2
      expect(result!.unit).toBe("C");
    });

    it("rounds temperature to nearest integer", async () => {
      mockGeoAndWeather(
        { city: "Paris" },
        { temperature_2m: 22.7, weather_code: 0 },
      );

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(48.86, 2.35, "C");

      expect(result!.temperature).toBe(23);
    });

    it("resolves unit to F for US country code with auto preference", async () => {
      mockGeoAndWeather(
        { city: "New York", country_code: "us" },
        { temperature_2m: 72, weather_code: 1 },
      );

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(40.71, -74.01, "auto");

      expect(result!.unit).toBe("F");
      // Verify fahrenheit query parameter was sent
      const weatherCall = (global.fetch as jest.Mock).mock.calls[1][0] as string;
      expect(weatherCall).toContain("temperature_unit=fahrenheit");
    });

    it("resolves unit to C for non-US country with auto preference", async () => {
      mockGeoAndWeather(
        { city: "London", country_code: "gb" },
        { temperature_2m: 15, weather_code: 3 },
      );

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(51.51, -0.13, "auto");

      expect(result!.unit).toBe("C");
      const weatherCall = (global.fetch as jest.Mock).mock.calls[1][0] as string;
      expect(weatherCall).not.toContain("temperature_unit=fahrenheit");
    });

    it("returns null when weather API returns non-OK response", async () => {
      mockFetch([
        // Geocoding ok
        async () => jsonResponse({ address: { city: "Test" } }),
        // Weather fails
        async () => jsonResponse({}, 500),
      ]);

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(0, 0, "C");

      expect(result).toBeNull();
    });

    it("returns null when weather API response missing current data", async () => {
      mockFetch([
        async () => jsonResponse({ address: { city: "Test" } }),
        async () => jsonResponse({ hourly: {} }), // no "current" field
      ]);

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(0, 0, "C");

      expect(result).toBeNull();
    });

    it("handles geocoding failure gracefully (empty city)", async () => {
      mockFetch([
        // Geocoding fails
        async () => jsonResponse({}, 500),
        // Weather succeeds
        async () =>
          jsonResponse({ current: { temperature_2m: 20, weather_code: 0 } }),
      ]);

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(0, 0, "C");

      expect(result).not.toBeNull();
      expect(result!.city).toBe("");
    });

    it("returns null on fetch network error", async () => {
      mockFetch([
        async () => {
          throw new Error("Network error");
        },
      ]);

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(0, 0, "C");

      expect(result).toBeNull();
    });
  });

  describe("WMO weather code icons", () => {
    const testCases: Array<[number, string]> = [
      [0, "☀️"],   // Clear sky
      [1, "🌤️"],   // Mainly clear
      [2, "⛅"],    // Partly cloudy
      [3, "☁️"],    // Overcast
      [45, "🌫️"],  // Fog
      [51, "🌧️"],  // Light drizzle
      [61, "🌧️"],  // Slight rain
      [71, "🌨️"],  // Slight snow
      [75, "❄️"],   // Heavy snow
      [80, "🌦️"],  // Slight rain showers
      [95, "⛈️"],   // Thunderstorm
      [99, "⛈️"],   // Thunderstorm with hail
    ];

    for (const [code, expectedIcon] of testCases) {
      it(`maps WMO code ${code} to ${expectedIcon}`, async () => {
        mockGeoAndWeather({ city: "Test" }, { temperature_2m: 20, weather_code: code });

        const repo = new WeatherRepository();
        const result = await repo.getCurrentWeather(0, 0, "C");

        expect(result!.icon).toBe(expectedIcon);
      });
    }

    it("falls back to 🌡️ for unknown WMO code", async () => {
      mockGeoAndWeather({ city: "Test" }, { temperature_2m: 20, weather_code: 999 });

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(0, 0, "C");

      expect(result!.icon).toBe("🌡️");
    });
  });

  describe("caching", () => {
    it("returns cached data for same location and unit", async () => {
      mockGeoAndWeather(
        { city: "Tokyo" },
        { temperature_2m: 25, weather_code: 0 },
      );

      const repo = new WeatherRepository();
      const first = await repo.getCurrentWeather(35.68, 139.69, "C");
      expect(first).not.toBeNull();

      // Second call should use cache for weather (geocoding still runs to resolve unit)
      const second = await repo.getCurrentWeather(35.68, 139.69, "C");
      expect(second).toEqual(first);

      // 3 total: geocoding + weather (1st call) + geocoding (2nd call, cache hit on weather)
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("getCachedWeather returns cached data", async () => {
      mockGeoAndWeather(
        { city: "Seoul" },
        { temperature_2m: 18, weather_code: 1 },
      );

      const repo = new WeatherRepository();
      await repo.getCurrentWeather(37.57, 126.98, "C");

      const cached = repo.getCachedWeather(37.57, 126.98, "C");
      expect(cached).not.toBeNull();
      expect(cached!.city).toBe("Seoul");
    });

    it("getCachedWeather returns null for uncached location", () => {
      const repo = new WeatherRepository();
      expect(repo.getCachedWeather(0, 0, "C")).toBeNull();
    });

    it("clearCache removes all cached entries", async () => {
      mockGeoAndWeather({ city: "A" }, { temperature_2m: 10, weather_code: 0 });

      const repo = new WeatherRepository();
      await repo.getCurrentWeather(0, 0, "C");
      expect(repo.getCachedWeather(0, 0, "C")).not.toBeNull();

      repo.clearCache();
      expect(repo.getCachedWeather(0, 0, "C")).toBeNull();
    });

    it("cache key rounds lat/lon to 3 decimal places", async () => {
      mockGeoAndWeather({ city: "A" }, { temperature_2m: 20, weather_code: 0 });

      const repo = new WeatherRepository();
      await repo.getCurrentWeather(35.6812345, 139.6912345, "C");

      // Slightly different coords within rounding should hit cache
      const cached = repo.getCachedWeather(35.6815, 139.6915, "C");
      expect(cached).not.toBeNull();
    });

    it("different units produce separate cache entries", async () => {
      // First call: Celsius
      mockFetch([
        async () =>
          jsonResponse({ address: { city: "NYC", country_code: "us" } }),
        async () =>
          jsonResponse({ current: { temperature_2m: 22, weather_code: 0 } }),
      ]);

      const repo = new WeatherRepository();
      await repo.getCurrentWeather(40.71, -74.01, "C");

      expect(repo.getCachedWeather(40.71, -74.01, "C")).not.toBeNull();
      expect(repo.getCachedWeather(40.71, -74.01, "F")).toBeNull();
    });

    it("evicts expired cache entries after 10 minutes", async () => {
      mockGeoAndWeather({ city: "Test" }, { temperature_2m: 20, weather_code: 0 });

      const repo = new WeatherRepository();
      await repo.getCurrentWeather(0, 0, "C");

      // Manually expire by manipulating the cached entry's timestamp
      const cached = repo.getCachedWeather(0, 0, "C");
      expect(cached).not.toBeNull();

      // Override timestamp to simulate expiry (11 minutes ago)
      cached!.timestamp = Date.now() - 11 * 60 * 1000;

      const afterExpiry = repo.getCachedWeather(0, 0, "C");
      expect(afterExpiry).toBeNull();
    });
  });

  describe("geocoding", () => {
    it("extracts city from town field", async () => {
      mockFetch([
        async () =>
          jsonResponse({
            address: { town: "Smallville", country_code: "us" },
          }),
        async () =>
          jsonResponse({ current: { temperature_2m: 20, weather_code: 0 } }),
      ]);

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(0, 0, "C");

      expect(result!.city).toBe("Smallville");
    });

    it("extracts city from village field", async () => {
      mockFetch([
        async () =>
          jsonResponse({
            address: { village: "Hamlet", country_code: "gb" },
          }),
        async () =>
          jsonResponse({ current: { temperature_2m: 10, weather_code: 3 } }),
      ]);

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(0, 0, "C");

      expect(result!.city).toBe("Hamlet");
    });

    it("falls back to county when no city/town/village", async () => {
      mockFetch([
        async () =>
          jsonResponse({
            address: { county: "Westland", country_code: "de" },
          }),
        async () =>
          jsonResponse({ current: { temperature_2m: 15, weather_code: 2 } }),
      ]);

      const repo = new WeatherRepository();
      const result = await repo.getCurrentWeather(0, 0, "C");

      expect(result!.city).toBe("Westland");
    });
  });
});
