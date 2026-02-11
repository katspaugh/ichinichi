import {
  resolveUrlState,
  serializeUrlState,
  getViewPreference,
  setViewPreference,
} from "../utils/urlState";
import { ViewType } from "../types";
import { URL_PARAMS, VIEW_PREFERENCE_KEY } from "../utils/constants";
import { formatDate } from "../utils/date";

beforeEach(() => {
  localStorage.clear();
});

describe("getViewPreference / setViewPreference", () => {
  it("defaults to 'year' when nothing stored", () => {
    expect(getViewPreference()).toBe("year");
  });

  it("returns 'month' when stored", () => {
    localStorage.setItem(VIEW_PREFERENCE_KEY, "month");
    expect(getViewPreference()).toBe("month");
  });

  it("returns 'year' for unknown stored value", () => {
    localStorage.setItem(VIEW_PREFERENCE_KEY, "garbage");
    expect(getViewPreference()).toBe("year");
  });

  it("persists month preference", () => {
    setViewPreference("month");
    expect(localStorage.getItem(VIEW_PREFERENCE_KEY)).toBe("month");
  });

  it("persists year preference", () => {
    setViewPreference("year");
    expect(localStorage.getItem(VIEW_PREFERENCE_KEY)).toBe("year");
  });
});

describe("resolveUrlState", () => {
  describe("date param only (note view)", () => {
    it("resolves valid past date to Note view", () => {
      const result = resolveUrlState("?date=01-01-2020");
      expect(result.state.view).toBe(ViewType.Note);
      expect(result.state.date).toBe("01-01-2020");
      expect(result.needsRedirect).toBe(false);
    });

    it("redirects future date to today", () => {
      const result = resolveUrlState("?date=01-01-2099");
      expect(result.state.view).toBe(ViewType.Note);
      expect(result.state.date).not.toBe("01-01-2099");
      expect(result.needsRedirect).toBe(true);
    });

    it("redirects invalid date to today", () => {
      const result = resolveUrlState("?date=not-a-date");
      expect(result.needsRedirect).toBe(true);
      expect(result.state.view).toBe(ViewType.Note);
    });

    it("includes year from parsed date", () => {
      const result = resolveUrlState("?date=15-06-2023");
      expect(result.state.year).toBe(2023);
    });

    it("sets month and monthDate to null for date-only", () => {
      const result = resolveUrlState("?date=15-06-2023");
      expect(result.state.month).toBeNull();
      expect(result.state.monthDate).toBeNull();
    });
  });

  describe("month param (calendar view)", () => {
    it("resolves valid month to Calendar view", () => {
      const result = resolveUrlState("?month=2024-06");
      expect(result.state.view).toBe(ViewType.Calendar);
      expect(result.state.year).toBe(2024);
      expect(result.state.month).toBe(5); // 0-indexed
      expect(result.state.date).toBeNull();
      expect(result.needsRedirect).toBe(false);
    });

    it("resolves month with date param for split view", () => {
      const result = resolveUrlState("?month=2024-06&date=15-06-2024");
      expect(result.state.view).toBe(ViewType.Calendar);
      expect(result.state.month).toBe(5);
      expect(result.state.monthDate).toBe("15-06-2024");
    });

    it("ignores date param when date is in wrong month", () => {
      const result = resolveUrlState("?month=2024-06&date=15-07-2024");
      expect(result.state.monthDate).toBeNull();
    });

    it("ignores date param when date is future", () => {
      const result = resolveUrlState("?month=2099-06&date=15-06-2099");
      expect(result.state.monthDate).toBeNull();
    });

    it("handles January (month=01) correctly", () => {
      const result = resolveUrlState("?month=2024-01");
      expect(result.state.month).toBe(0);
    });

    it("handles December (month=12) correctly", () => {
      const result = resolveUrlState("?month=2024-12");
      expect(result.state.month).toBe(11);
    });

    it("falls through to year view for invalid month format", () => {
      const result = resolveUrlState("?month=invalid");
      // Falls through since no year param either — goes to default
      expect(result.state.view).toBe(ViewType.Calendar);
      expect(result.state.month).toBeNull();
    });

    it("falls through for month out of range (13)", () => {
      const result = resolveUrlState("?month=2024-13");
      expect(result.state.month).toBeNull();
    });

    it("falls through for month 00", () => {
      const result = resolveUrlState("?month=2024-00");
      expect(result.state.month).toBeNull();
    });
  });

  describe("year param", () => {
    it("resolves valid year to Calendar view", () => {
      const result = resolveUrlState("?year=2023");
      expect(result.state.view).toBe(ViewType.Calendar);
      expect(result.state.year).toBe(2023);
      expect(result.state.month).toBeNull();
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
      expect(result.state.month).toBeNull();
      expect(result.needsRedirect).toBe(false);
      expect(result.canonicalSearch).toBe("/");
    });

    it("redirects to month view when preference is month", () => {
      setViewPreference("month");
      const result = resolveUrlState("");
      expect(result.state.view).toBe(ViewType.Calendar);
      expect(result.state.month).toBe(new Date().getMonth());
      expect(result.needsRedirect).toBe(true);
    });
  });

  describe("param priority: month takes precedence over date-only", () => {
    it("month+date treated as split view, not note view", () => {
      const result = resolveUrlState("?month=2020-06&date=15-06-2020");
      expect(result.state.view).toBe(ViewType.Calendar);
      expect(result.state.monthDate).toBe("15-06-2020");
    });
  });
});

describe("serializeUrlState", () => {
  it("serializes Note view with date", () => {
    const url = serializeUrlState({
      view: ViewType.Note,
      date: "15-06-2024",
      year: 2024,
      month: null,
      monthDate: null,
    });
    expect(url).toBe(`?${URL_PARAMS.DATE}=15-06-2024`);
  });

  it("serializes Calendar year view", () => {
    const url = serializeUrlState({
      view: ViewType.Calendar,
      date: null,
      year: 2024,
      month: null,
      monthDate: null,
    });
    expect(url).toBe(`?${URL_PARAMS.YEAR}=2024`);
  });

  it("serializes Calendar month view", () => {
    const url = serializeUrlState({
      view: ViewType.Calendar,
      date: null,
      year: 2024,
      month: 5, // June
      monthDate: null,
    });
    expect(url).toBe(`?${URL_PARAMS.MONTH}=2024-06`);
  });

  it("serializes Calendar month+date split view", () => {
    const url = serializeUrlState({
      view: ViewType.Calendar,
      date: null,
      year: 2024,
      month: 5,
      monthDate: "15-06-2024",
    });
    expect(url).toBe(
      `?${URL_PARAMS.MONTH}=2024-06&${URL_PARAMS.DATE}=15-06-2024`,
    );
  });

  it("zero-pads single-digit months", () => {
    const url = serializeUrlState({
      view: ViewType.Calendar,
      date: null,
      year: 2024,
      month: 0, // January
      monthDate: null,
    });
    expect(url).toBe(`?${URL_PARAMS.MONTH}=2024-01`);
  });

  it("returns / for Note view with no date", () => {
    const url = serializeUrlState({
      view: ViewType.Note,
      date: null,
      year: 2024,
      month: null,
      monthDate: null,
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

  it("round-trips a month URL", () => {
    const original = "?month=2024-06";
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
