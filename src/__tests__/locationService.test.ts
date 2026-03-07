// @vitest-environment jsdom
/**
 * Tests for the locationService module.
 *
 * The locationService is a singleton, so we reset modules before each test
 * to get a fresh instance.
 */

import { LOCATION_PROMPT_SHOWN_KEY } from "../utils/constants";

// Polyfill GeolocationPositionError for jsdom
if (typeof globalThis.GeolocationPositionError === "undefined") {
  (globalThis as Record<string, unknown>).GeolocationPositionError = {
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

// Save originals for restoration
const originalDateTimeFormat = Intl.DateTimeFormat;

function mockTimezone(timezone: string) {
  const origProto = originalDateTimeFormat.prototype;
  const MockDateTimeFormat = Object.assign(
    function (this: Intl.DateTimeFormat, ...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
      const instance = new originalDateTimeFormat(...args);
      instance.resolvedOptions = () => ({
        ...origProto.resolvedOptions.call(instance),
        timeZone: timezone,
      });
      return instance;
    },
    { supportedLocalesOf: originalDateTimeFormat.supportedLocalesOf },
  ) as unknown as typeof Intl.DateTimeFormat;
  Object.defineProperty(Intl, "DateTimeFormat", {
    value: MockDateTimeFormat,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  Object.defineProperty(Intl, "DateTimeFormat", {
    value: originalDateTimeFormat,
    writable: true,
    configurable: true,
  });
  localStorage.clear();
});

async function freshService() {
  const mod = await import("../services/locationService");
  return mod.locationService;
}

describe("locationService", () => {
  describe("getApproxLocation", () => {
    it("returns location for known timezone (Europe/Paris)", async () => {
      mockTimezone("Europe/Paris");
      const service = await freshService();

      const loc = await service.getApproxLocation();

      expect(loc).not.toBeNull();
      expect(loc!.city).toBe("Paris");
      expect(loc!.country).toBe("France");
      expect(loc!.lat).toBeCloseTo(48.86, 1);
      expect(loc!.lon).toBeCloseTo(2.35, 1);
    });

    it("returns location for known timezone (America/New_York)", async () => {
      mockTimezone("America/New_York");
      const service = await freshService();

      const loc = await service.getApproxLocation();

      expect(loc).not.toBeNull();
      expect(loc!.city).toBe("New York");
      expect(loc!.country).toBe("United States");
    });

    it("resolves fallback timezone (America/Detroit → America/New_York)", async () => {
      mockTimezone("America/Detroit");
      const service = await freshService();

      const loc = await service.getApproxLocation();

      expect(loc).not.toBeNull();
      expect(loc!.city).toBe("New York");
    });

    it("resolves Australian fallback (Australia/Adelaide → Sydney)", async () => {
      mockTimezone("Australia/Adelaide");
      const service = await freshService();

      const loc = await service.getApproxLocation();

      expect(loc).not.toBeNull();
      expect(loc!.city).toBe("Sydney");
      expect(loc!.country).toBe("Australia");
    });

    it("caches result on subsequent calls", async () => {
      mockTimezone("Asia/Tokyo");
      const service = await freshService();

      const first = await service.getApproxLocation();
      const second = await service.getApproxLocation();

      expect(first).toBe(second); // same reference (cached)
      expect(first!.city).toBe("Tokyo");
    });

    it("returns null for unknown timezone with no locale fallback", async () => {
      mockTimezone("Etc/UTC");
      Object.defineProperty(global, "navigator", {
        value: { language: "en", geolocation: {} },
        writable: true,
        configurable: true,
      });
      const service = await freshService();

      const loc = await service.getApproxLocation();
      expect(loc).toBeNull();
    });
  });

  describe("prompt management", () => {
    it("hasShownPrompt returns false initially", async () => {
      const service = await freshService();
      expect(service.hasShownPrompt()).toBe(false);
    });

    it("setPromptShown persists to localStorage", async () => {
      const service = await freshService();

      service.setPromptShown();
      expect(localStorage.getItem(LOCATION_PROMPT_SHOWN_KEY)).toBe("true");
      expect(service.hasShownPrompt()).toBe(true);
    });

    it("resetPromptShown clears localStorage and cached permission", async () => {
      const service = await freshService();

      service.setPromptShown();
      service.resetPromptShown();

      expect(localStorage.getItem(LOCATION_PROMPT_SHOWN_KEY)).toBeNull();
      expect(service.hasShownPrompt()).toBe(false);
    });
  });

  describe("getPermissionState", () => {
    it("returns 'unavailable' when geolocation not in navigator", async () => {
      Object.defineProperty(global, "navigator", {
        value: { language: "en" }, // no geolocation property
        writable: true,
        configurable: true,
      });
      const service = await freshService();

      const state = await service.getPermissionState();
      expect(state).toBe("unavailable");
    });
  });

  describe("shouldShowPrompt", () => {
    it("returns false if prompt already shown", async () => {
      localStorage.setItem(LOCATION_PROMPT_SHOWN_KEY, "true");
      const service = await freshService();

      const should = await service.shouldShowPrompt();
      expect(should).toBe(false);
    });
  });

  describe("getCurrentPosition", () => {
    it("returns null when geolocation not available", async () => {
      Object.defineProperty(global, "navigator", {
        value: { language: "en" },
        writable: true,
        configurable: true,
      });
      const service = await freshService();

      const pos = await service.getCurrentPosition();
      expect(pos).toBeNull();
    });

    it("returns coordinates when geolocation succeeds", async () => {
      Object.defineProperty(global, "navigator", {
        value: {
          language: "en",
          geolocation: {
            getCurrentPosition: (success: PositionCallback) => {
              success({
                coords: { latitude: 51.51, longitude: -0.13 },
              } as GeolocationPosition);
            },
          },
        },
        writable: true,
        configurable: true,
      });
      const service = await freshService();

      const pos = await service.getCurrentPosition();
      expect(pos).not.toBeNull();
      expect(pos!.lat).toBeCloseTo(51.51, 2);
      expect(pos!.lon).toBeCloseTo(-0.13, 2);
    });

    it("returns null when geolocation fails", async () => {
      Object.defineProperty(global, "navigator", {
        value: {
          language: "en",
          geolocation: {
            getCurrentPosition: (
              _success: PositionCallback,
              error: PositionErrorCallback,
            ) => {
              error({
                code: 1,
                message: "User denied",
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              } as GeolocationPositionError);
            },
          },
        },
        writable: true,
        configurable: true,
      });
      const service = await freshService();

      const pos = await service.getCurrentPosition();
      expect(pos).toBeNull();
    });

    it("caches permission as granted after successful getCurrentPosition", async () => {
      Object.defineProperty(global, "navigator", {
        value: {
          language: "en",
          geolocation: {
            getCurrentPosition: (success: PositionCallback) => {
              success({
                coords: { latitude: 32.67, longitude: -16.92 },
              } as GeolocationPosition);
            },
          },
        },
        writable: true,
        configurable: true,
      });
      const service = await freshService();

      await service.getCurrentPosition();
      const state = await service.getPermissionState();
      expect(state).toBe("granted");
    });
  });

  describe("Atlantic timezone support", () => {
    it("returns Funchal for Atlantic/Madeira timezone", async () => {
      mockTimezone("Atlantic/Madeira");
      const service = await freshService();

      const loc = await service.getApproxLocation();
      expect(loc).not.toBeNull();
      expect(loc!.city).toBe("Funchal");
      expect(loc!.country).toBe("Portugal");
    });
  });
});
