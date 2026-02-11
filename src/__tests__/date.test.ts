import {
  formatDate,
  parseDate,
  getTodayString,
  formatDateDisplay,
  getDayCellState,
  isToday,
  isFuture,
  getDaysInMonth,
  getFirstDayOfMonth,
  getMonthName,
  getWeekdays,
  getWeekdayOptions,
  setWeekStartPreference,
} from "../utils/date";
import { DayCellState } from "../types";

beforeEach(() => {
  localStorage.clear();
});

describe("formatDate", () => {
  it("formats a standard date as DD-MM-YYYY", () => {
    expect(formatDate(new Date(2024, 0, 15))).toBe("15-01-2024");
  });

  it("zero-pads single-digit day and month", () => {
    expect(formatDate(new Date(2024, 2, 5))).toBe("05-03-2024");
  });

  it("handles last day of year", () => {
    expect(formatDate(new Date(2024, 11, 31))).toBe("31-12-2024");
  });

  it("handles first day of year", () => {
    expect(formatDate(new Date(2024, 0, 1))).toBe("01-01-2024");
  });
});

describe("parseDate", () => {
  it("parses a valid DD-MM-YYYY string", () => {
    const result = parseDate("15-01-2024");
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(15);
    expect(result!.getMonth()).toBe(0);
    expect(result!.getFullYear()).toBe(2024);
  });

  it("returns null for invalid format (wrong separator)", () => {
    expect(parseDate("15/01/2024")).toBeNull();
  });

  it("returns null for too few parts", () => {
    expect(parseDate("15-01")).toBeNull();
  });

  it("returns null for non-numeric parts", () => {
    expect(parseDate("ab-cd-efgh")).toBeNull();
  });

  it("returns null for impossible date (Feb 30)", () => {
    expect(parseDate("30-02-2024")).toBeNull();
  });

  it("returns null for impossible date (Apr 31)", () => {
    expect(parseDate("31-04-2024")).toBeNull();
  });

  it("handles leap year Feb 29", () => {
    const result = parseDate("29-02-2024");
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(29);
    expect(result!.getMonth()).toBe(1);
  });

  it("rejects non-leap year Feb 29", () => {
    expect(parseDate("29-02-2023")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDate("")).toBeNull();
  });
});

describe("formatDate / parseDate round-trip", () => {
  it("round-trips correctly", () => {
    const original = new Date(2024, 5, 20);
    const str = formatDate(original);
    const parsed = parseDate(str);
    expect(parsed).not.toBeNull();
    expect(parsed!.getDate()).toBe(20);
    expect(parsed!.getMonth()).toBe(5);
    expect(parsed!.getFullYear()).toBe(2024);
  });
});

describe("getTodayString", () => {
  it("returns a DD-MM-YYYY formatted string for today", () => {
    const result = getTodayString();
    expect(result).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    // Should parse back to today
    const parsed = parseDate(result);
    expect(parsed).not.toBeNull();
    const now = new Date();
    expect(parsed!.getDate()).toBe(now.getDate());
    expect(parsed!.getMonth()).toBe(now.getMonth());
    expect(parsed!.getFullYear()).toBe(now.getFullYear());
  });
});

describe("formatDateDisplay", () => {
  it("formats a date string for display", () => {
    const result = formatDateDisplay("01-01-2024");
    // Should contain day of week, month name, day, year
    expect(result).toContain("January");
    expect(result).toContain("2024");
    expect(result).toContain("Monday");
  });

  it("returns the original string for invalid date", () => {
    expect(formatDateDisplay("not-a-date")).toBe("not-a-date");
  });
});

describe("getDayCellState", () => {
  const referenceDate = new Date(2024, 5, 15, 12, 0, 0); // June 15, 2024

  it("returns Today for same day", () => {
    const date = new Date(2024, 5, 15, 8, 30, 0);
    expect(getDayCellState(date, referenceDate)).toBe(DayCellState.Today);
  });

  it("returns Past for earlier day", () => {
    const date = new Date(2024, 5, 14);
    expect(getDayCellState(date, referenceDate)).toBe(DayCellState.Past);
  });

  it("returns Future for later day", () => {
    const date = new Date(2024, 5, 16);
    expect(getDayCellState(date, referenceDate)).toBe(DayCellState.Future);
  });

  it("ignores time differences within same day", () => {
    const earlyMorning = new Date(2024, 5, 15, 0, 0, 1);
    const lateNight = new Date(2024, 5, 15, 23, 59, 59);
    expect(getDayCellState(earlyMorning, referenceDate)).toBe(DayCellState.Today);
    expect(getDayCellState(lateNight, referenceDate)).toBe(DayCellState.Today);
  });
});

describe("isToday", () => {
  it("returns true for today's date string", () => {
    expect(isToday(getTodayString())).toBe(true);
  });

  it("returns false for a past date string", () => {
    expect(isToday("01-01-2020")).toBe(false);
  });
});

describe("isFuture", () => {
  it("returns true for a far future date", () => {
    expect(isFuture("01-01-2099")).toBe(true);
  });

  it("returns false for a past date", () => {
    expect(isFuture("01-01-2020")).toBe(false);
  });

  it("returns false for an invalid date", () => {
    expect(isFuture("not-a-date")).toBe(false);
  });

  it("returns false for today", () => {
    expect(isFuture(getTodayString())).toBe(false);
  });
});

describe("getDaysInMonth", () => {
  it("returns 31 for January", () => {
    expect(getDaysInMonth(2024, 0)).toBe(31);
  });

  it("returns 29 for February in a leap year", () => {
    expect(getDaysInMonth(2024, 1)).toBe(29);
  });

  it("returns 28 for February in a non-leap year", () => {
    expect(getDaysInMonth(2023, 1)).toBe(28);
  });

  it("returns 30 for April", () => {
    expect(getDaysInMonth(2024, 3)).toBe(30);
  });

  it("returns 31 for December", () => {
    expect(getDaysInMonth(2024, 11)).toBe(31);
  });
});

describe("getFirstDayOfMonth", () => {
  it("returns the offset for the first day (default week start Sunday)", () => {
    // January 1, 2024 is a Monday => offset 1 from Sunday
    const offset = getFirstDayOfMonth(2024, 0);
    expect(offset).toBe(1);
  });

  it("respects week start preference", () => {
    // Set week start to Monday (1)
    setWeekStartPreference(1);
    // January 1, 2024 is Monday => offset 0 from Monday
    const offset = getFirstDayOfMonth(2024, 0);
    expect(offset).toBe(0);
  });
});

describe("getMonthName", () => {
  it("returns January for month 0", () => {
    expect(getMonthName(0)).toBe("January");
  });

  it("returns December for month 11", () => {
    expect(getMonthName(11)).toBe("December");
  });

  it("returns June for month 5", () => {
    expect(getMonthName(5)).toBe("June");
  });
});

describe("getWeekdays and getWeekdayOptions", () => {
  it("returns 7 weekday labels", () => {
    const weekdays = getWeekdays();
    expect(weekdays).toHaveLength(7);
  });

  it("getWeekdayOptions returns objects with label and dayIndex", () => {
    const options = getWeekdayOptions();
    expect(options).toHaveLength(7);
    for (const opt of options) {
      expect(opt).toHaveProperty("label");
      expect(opt).toHaveProperty("dayIndex");
      expect(opt.dayIndex).toBeGreaterThanOrEqual(0);
      expect(opt.dayIndex).toBeLessThanOrEqual(6);
    }
  });

  it("weekday options contain all 7 unique day indices", () => {
    const options = getWeekdayOptions();
    const indices = options.map((o) => o.dayIndex).sort();
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("respects week start preference for ordering", () => {
    setWeekStartPreference(1); // Monday
    const options = getWeekdayOptions();
    // First day should be Monday (dayIndex 1)
    expect(options[0].dayIndex).toBe(1);
    // Last day should be Sunday (dayIndex 0)
    expect(options[6].dayIndex).toBe(0);
  });
});
