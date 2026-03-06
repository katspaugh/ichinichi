import {
  resolveUrlState,
  serializeUrlState,
  getViewPreference,
  setViewPreference,
} from "../utils/urlState";
import { ViewType } from "../types";
import { URL_PARAMS, VIEW_PREFERENCE_KEY } from "../utils/constants";


beforeEach(() => {
  localStorage.clear();
});

describe("getViewPreference / setViewPreference", () => {
  it("defaults to 'year' when nothing stored", () => {
    expect(getViewPreference()).toBe("year");
  });

  it("returns 'day' when stored", () => {
    localStorage.setItem(VIEW_PREFERENCE_KEY, "day");
    expect(getViewPreference()).toBe("day");
  });

  it("maps legacy 'month' preference to 'day'", () => {
    localStorage.setItem(VIEW_PREFERENCE_KEY, "month");
    expect(getViewPreference()).toBe("day");
  });

  it("returns 'year' for unknown stored value", () => {
    localStorage.setItem(VIEW_PREFERENCE_KEY, "garbage");
    expect(getViewPreference()).toBe("year");
  });

  it("persists day preference", () => {
    setViewPreference("day");
    expect(localStorage.getItem(VIEW_PREFERENCE_KEY)).toBe("day");
  });

  it("persists year preference", () => {
    setViewPreference("year");
    expect(localStorage.getItem(VIEW_PREFERENCE_KEY)).toBe("year");
  });
});

describe("resolveUrlState", () => {
  describe("date param only (day view)", () => {
    it("resolves valid past date to Day view", () => {
      const result = resolveUrlState("?date=01-01-2020");
      expect(result.state.view).toBe(ViewType.Day);
      expect(result.state.date).toBe("01-01-2020");
      expect(result.state.year).toBe(2020);
      expect(result.needsRedirect).toBe(false);
    });

    it("redirects future date to today", () => {
      const result = resolveUrlState("?date=01-01-2099");
      expect(result.state.view).toBe(ViewType.Day);
      expect(result.state.date).not.toBe("01-01-2099");
      expect(result.needsRedirect).toBe(true);
    });

    it("redirects invalid date to today", () => {
      const result = resolveUrlState("?date=not-a-date");
      expect(result.needsRedirect).toBe(true);
      expect(result.state.view).toBe(ViewType.Day);
    });

    it("includes year from parsed date", () => {
      const result = resolveUrlState("?date=15-06-2023");
      expect(result.state.year).toBe(2023);
    });
  });

  describe("legacy month param", () => {
    it("redirects valid month to Calendar year view", () => {
      const result = resolveUrlState("?month=2024-06");
      expect(result.state.view).toBe(ViewType.Calendar);
      expect(result.state.year).toBe(2024);
      expect(result.state.date).toBeNull();
      expect(result.needsRedirect).toBe(true);
      expect(result.canonicalSearch).toBe(`?${URL_PARAMS.YEAR}=2024`);
    });

    it("falls back to current year for invalid month format", () => {
      const result = resolveUrlState("?month=invalid");
      expect(result.state.view).toBe(ViewType.Calendar);
      expect(result.state.year).toBe(new Date().getFullYear());
      expect(result.needsRedirect).toBe(true);
    });
  });

  describe("year param", () => {
    it("resolves valid year to Calendar view", () => {
      const result = resolveUrlState("?year=2023");
      expect(result.state.view).toBe(ViewType.Calendar);
      expect(result.state.year).toBe(2023);
      expect(result.state.date).toBeNull();
      expect(result.needsRedirect).toBe(false);
    });

    it("falls back to current year for invalid year param", () => {
      const result = resolveUrlState("?year=abc");
      expect(result.state.year).toBe(new Date().getFullYear());
    });
  });

  describe("no params (default view)", () => {
    it("defaults to Calendar year view with no redirect", () => {
      const result = resolveUrlState("");
      expect(result.state.view).toBe(ViewType.Calendar);
      expect(result.state.year).toBe(new Date().getFullYear());
      expect(result.state.date).toBeNull();
      expect(result.needsRedirect).toBe(false);
      expect(result.canonicalSearch).toBe("/");
    });

    it("redirects to day view when preference is day", () => {
      setViewPreference("day");
      const result = resolveUrlState("");
      expect(result.state.view).toBe(ViewType.Day);
      expect(result.state.date).toBeTruthy();
      expect(result.needsRedirect).toBe(true);
    });
  });
});

describe("serializeUrlState", () => {
  it("serializes Day view with date", () => {
    const url = serializeUrlState({
      view: ViewType.Day,
      date: "15-06-2024",
      year: 2024,
    });
    expect(url).toBe(`?${URL_PARAMS.DATE}=15-06-2024`);
  });

  it("serializes Calendar year view", () => {
    const url = serializeUrlState({
      view: ViewType.Calendar,
      date: null,
      year: 2024,
    });
    expect(url).toBe(`?${URL_PARAMS.YEAR}=2024`);
  });

  it("returns / for Day view with no date", () => {
    const url = serializeUrlState({
      view: ViewType.Day,
      date: null,
      year: 2024,
    });
    expect(url).toBe("/");
  });
});

describe("resolveUrlState / serializeUrlState round-trip", () => {
  it("round-trips a date-only URL", () => {
    const original = "?date=15-06-2023";
    const resolved = resolveUrlState(original);
    const serialized = serializeUrlState(resolved.state);
    expect(serialized).toBe(original);
  });

  it("round-trips a year URL", () => {
    const original = "?year=2023";
    const resolved = resolveUrlState(original);
    const serialized = serializeUrlState(resolved.state);
    expect(serialized).toBe(original);
  });
});
