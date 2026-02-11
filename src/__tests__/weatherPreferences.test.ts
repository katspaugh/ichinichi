import {
  getShowWeatherPreference,
  setShowWeatherPreference,
  getUnitPreference,
  setUnitPreference,
  getLocationLabel,
  setLocationLabel,
  getLocationKind,
  setLocationKind,
} from "../features/weather/WeatherPreferences";
import {
  SHOW_WEATHER_KEY,
  TEMP_UNIT_KEY,
  LOCATION_LABEL_KEY,
  LOCATION_KIND_KEY,
} from "../utils/constants";

beforeEach(() => {
  localStorage.clear();
});

describe("WeatherPreferences", () => {
  describe("showWeather", () => {
    it("defaults to true when nothing stored", () => {
      expect(getShowWeatherPreference()).toBe(true);
    });

    it("returns true when stored value is 'true'", () => {
      localStorage.setItem(SHOW_WEATHER_KEY, "true");
      expect(getShowWeatherPreference()).toBe(true);
    });

    it("returns false when stored value is 'false'", () => {
      localStorage.setItem(SHOW_WEATHER_KEY, "false");
      expect(getShowWeatherPreference()).toBe(false);
    });

    it("treats unexpected values as true (not 'false')", () => {
      localStorage.setItem(SHOW_WEATHER_KEY, "garbage");
      expect(getShowWeatherPreference()).toBe(true);
    });

    it("persists enabled value", () => {
      setShowWeatherPreference(true);
      expect(localStorage.getItem(SHOW_WEATHER_KEY)).toBe("true");
    });

    it("persists disabled value", () => {
      setShowWeatherPreference(false);
      expect(localStorage.getItem(SHOW_WEATHER_KEY)).toBe("false");
    });
  });

  describe("unitPreference", () => {
    it('defaults to "auto" when nothing stored', () => {
      expect(getUnitPreference()).toBe("auto");
    });

    it("returns stored C preference", () => {
      localStorage.setItem(TEMP_UNIT_KEY, "C");
      expect(getUnitPreference()).toBe("C");
    });

    it("returns stored F preference", () => {
      localStorage.setItem(TEMP_UNIT_KEY, "F");
      expect(getUnitPreference()).toBe("F");
    });

    it("returns stored auto preference", () => {
      localStorage.setItem(TEMP_UNIT_KEY, "auto");
      expect(getUnitPreference()).toBe("auto");
    });

    it('returns "auto" for invalid stored values', () => {
      localStorage.setItem(TEMP_UNIT_KEY, "kelvin");
      expect(getUnitPreference()).toBe("auto");
    });

    it("persists unit preference", () => {
      setUnitPreference("F");
      expect(localStorage.getItem(TEMP_UNIT_KEY)).toBe("F");
    });
  });

  describe("locationLabel", () => {
    it("returns null when nothing stored", () => {
      expect(getLocationLabel()).toBeNull();
    });

    it("returns stored label", () => {
      localStorage.setItem(LOCATION_LABEL_KEY, "San Francisco");
      expect(getLocationLabel()).toBe("San Francisco");
    });

    it("persists label", () => {
      setLocationLabel("Tokyo");
      expect(localStorage.getItem(LOCATION_LABEL_KEY)).toBe("Tokyo");
    });

    it("removes label when set to null", () => {
      setLocationLabel("London");
      setLocationLabel(null);
      expect(localStorage.getItem(LOCATION_LABEL_KEY)).toBeNull();
    });

    it("removes label when set to empty string", () => {
      setLocationLabel("Paris");
      setLocationLabel("");
      expect(localStorage.getItem(LOCATION_LABEL_KEY)).toBeNull();
    });
  });

  describe("locationKind", () => {
    it("returns null when nothing stored", () => {
      expect(getLocationKind()).toBeNull();
    });

    it("returns 'approx' when stored", () => {
      localStorage.setItem(LOCATION_KIND_KEY, "approx");
      expect(getLocationKind()).toBe("approx");
    });

    it("returns 'precise' when stored", () => {
      localStorage.setItem(LOCATION_KIND_KEY, "precise");
      expect(getLocationKind()).toBe("precise");
    });

    it("returns null for invalid values", () => {
      localStorage.setItem(LOCATION_KIND_KEY, "gps");
      expect(getLocationKind()).toBeNull();
    });

    it("persists kind", () => {
      setLocationKind("precise");
      expect(localStorage.getItem(LOCATION_KIND_KEY)).toBe("precise");
    });

    it("removes kind when set to null", () => {
      setLocationKind("approx");
      setLocationKind(null);
      expect(localStorage.getItem(LOCATION_KIND_KEY)).toBeNull();
    });
  });
});
