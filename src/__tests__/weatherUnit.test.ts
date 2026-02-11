import { isLikelyUS, resolveUnitPreference } from "../features/weather/unit";

// Save originals for restoration
const originalDateTimeFormat = Intl.DateTimeFormat;
const originalNavigator = Object.getOwnPropertyDescriptor(global, "navigator");

afterEach(() => {
  // Restore Intl.DateTimeFormat
  Object.defineProperty(Intl, "DateTimeFormat", {
    value: originalDateTimeFormat,
    writable: true,
    configurable: true,
  });
  // Restore navigator
  if (originalNavigator) {
    Object.defineProperty(global, "navigator", originalNavigator);
  }
});

function mockTimezone(timezone: string) {
  // Create a proper mock that doesn't assign to readonly .prototype
  const origProto = originalDateTimeFormat.prototype;
  const MockDateTimeFormat = Object.assign(
    function (this: Intl.DateTimeFormat, ...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
      const instance = new originalDateTimeFormat(...args);
      // Patch resolvedOptions on the instance
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

function mockLanguage(language: string) {
  Object.defineProperty(global, "navigator", {
    value: { language },
    writable: true,
    configurable: true,
  });
}

describe("isLikelyUS", () => {
  describe("with country code from geocoding", () => {
    it("returns true when countryCode is US", () => {
      expect(isLikelyUS({ countryCode: "US" })).toBe(true);
    });

    it("returns false for non-US country codes", () => {
      expect(isLikelyUS({ countryCode: "GB" })).toBe(false);
      expect(isLikelyUS({ countryCode: "DE" })).toBe(false);
      expect(isLikelyUS({ countryCode: "JP" })).toBe(false);
    });

    it("returns false for null country code and falls through to timezone", () => {
      mockTimezone("Europe/London");
      expect(isLikelyUS({ countryCode: null })).toBe(false);
    });
  });

  describe("timezone fallback", () => {
    it("detects US timezone America/New_York", () => {
      mockTimezone("America/New_York");
      expect(isLikelyUS()).toBe(true);
    });

    it("detects US timezone America/Los_Angeles", () => {
      mockTimezone("America/Los_Angeles");
      expect(isLikelyUS()).toBe(true);
    });

    it("detects US timezone America/Chicago", () => {
      mockTimezone("America/Chicago");
      expect(isLikelyUS()).toBe(true);
    });

    it("detects US timezone Pacific/Honolulu", () => {
      mockTimezone("Pacific/Honolulu");
      expect(isLikelyUS()).toBe(true);
    });

    it("returns false for European timezone", () => {
      mockTimezone("Europe/London");
      expect(isLikelyUS()).toBe(false);
    });

    it("returns false for Asian timezone", () => {
      mockTimezone("Asia/Tokyo");
      expect(isLikelyUS()).toBe(false);
    });

    it("returns false for Australian timezone", () => {
      mockTimezone("Australia/Sydney");
      expect(isLikelyUS()).toBe(false);
    });

    it("returns false for African timezone", () => {
      mockTimezone("Africa/Lagos");
      expect(isLikelyUS()).toBe(false);
    });
  });

  describe("locale fallback", () => {
    it("detects US locale en-US", () => {
      mockTimezone("America/Toronto"); // ambiguous — not in US_TIMEZONES but starts with America/
      mockLanguage("en-US");
      expect(isLikelyUS()).toBe(true);
    });

    it("returns false for non-US locale", () => {
      mockTimezone("America/Toronto");
      mockLanguage("en-GB");
      expect(isLikelyUS()).toBe(false);
    });
  });

  describe("no location info", () => {
    it("returns false when no arguments and no timezone match", () => {
      mockTimezone("Etc/UTC");
      mockLanguage("en");
      expect(isLikelyUS()).toBe(false);
    });
  });
});

describe("resolveUnitPreference", () => {
  it("returns C when preference is C", () => {
    expect(resolveUnitPreference("C")).toBe("C");
  });

  it("returns F when preference is F", () => {
    expect(resolveUnitPreference("F")).toBe("F");
  });

  it('returns F for auto preference with US location', () => {
    expect(resolveUnitPreference("auto", { countryCode: "US" })).toBe("F");
  });

  it('returns C for auto preference with non-US location', () => {
    expect(resolveUnitPreference("auto", { countryCode: "GB" })).toBe("C");
  });

  it("explicit C/F overrides US location", () => {
    expect(resolveUnitPreference("C", { countryCode: "US" })).toBe("C");
    expect(resolveUnitPreference("F", { countryCode: "GB" })).toBe("F");
  });
});
