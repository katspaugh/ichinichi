import { canEditNote } from "../utils/noteRules";
import {
  formatDate,
  parseDate,
  getTodayString,
  isToday,
  isFuture,
  getDayCellState,
  formatDateDisplay,
  getDaysInMonth,
} from "../utils/date";
import { DayCellState } from "../types";

describe("canEditNote", () => {
  it("returns true for today's date", () => {
    const today = getTodayString();
    expect(canEditNote(today)).toBe(true);
  });

  it("returns false for yesterday", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(canEditNote(formatDate(yesterday))).toBe(false);
  });

  it("returns false for tomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(canEditNote(formatDate(tomorrow))).toBe(false);
  });

  it("returns false for past dates", () => {
    expect(canEditNote("01-01-2020")).toBe(false);
    expect(canEditNote("15-06-2023")).toBe(false);
  });

  it("returns false for invalid date strings", () => {
    expect(canEditNote("invalid")).toBe(false);
    expect(canEditNote("")).toBe(false);
  });
});

describe("formatDate", () => {
  it("formats date as DD-MM-YYYY", () => {
    expect(formatDate(new Date(2024, 0, 1))).toBe("01-01-2024");
    expect(formatDate(new Date(2024, 11, 31))).toBe("31-12-2024");
  });

  it("pads single digit day and month", () => {
    expect(formatDate(new Date(2024, 0, 5))).toBe("05-01-2024");
    expect(formatDate(new Date(2024, 8, 9))).toBe("09-09-2024");
  });
});

describe("parseDate", () => {
  it("parses DD-MM-YYYY string to Date", () => {
    const date = parseDate("15-06-2024");
    expect(date).not.toBeNull();
    expect(date!.getDate()).toBe(15);
    expect(date!.getMonth()).toBe(5); // June = 5
    expect(date!.getFullYear()).toBe(2024);
  });

  it("returns null for invalid format", () => {
    expect(parseDate("2024-06-15")).toBeNull(); // Wrong format
    expect(parseDate("15/06/2024")).toBeNull();
    expect(parseDate("15-06")).toBeNull();
    expect(parseDate("invalid")).toBeNull();
    expect(parseDate("")).toBeNull();
  });

  it("returns null for invalid dates", () => {
    expect(parseDate("31-02-2024")).toBeNull(); // Feb 31 doesn't exist
    expect(parseDate("00-01-2024")).toBeNull(); // Day 0
    expect(parseDate("32-01-2024")).toBeNull(); // Day 32
  });

  it("returns null for non-numeric parts", () => {
    expect(parseDate("ab-01-2024")).toBeNull();
    expect(parseDate("01-ab-2024")).toBeNull();
    expect(parseDate("01-01-abcd")).toBeNull();
  });
});

describe("getTodayString", () => {
  it("returns today's date in DD-MM-YYYY format", () => {
    const today = new Date();
    const expected = formatDate(today);
    expect(getTodayString()).toBe(expected);
  });
});

describe("isToday", () => {
  it("returns true for today's date string", () => {
    expect(isToday(getTodayString())).toBe(true);
  });

  it("returns false for yesterday", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isToday(formatDate(yesterday))).toBe(false);
  });

  it("returns false for tomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isToday(formatDate(tomorrow))).toBe(false);
  });
});

describe("isFuture", () => {
  it("returns true for tomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isFuture(formatDate(tomorrow))).toBe(true);
  });

  it("returns true for dates far in the future", () => {
    expect(isFuture("01-01-2099")).toBe(true);
  });

  it("returns false for today", () => {
    expect(isFuture(getTodayString())).toBe(false);
  });

  it("returns false for yesterday", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isFuture(formatDate(yesterday))).toBe(false);
  });

  it("returns false for invalid date", () => {
    expect(isFuture("invalid")).toBe(false);
  });
});

describe("getDayCellState", () => {
  it("returns Today for current date", () => {
    const now = new Date(2024, 5, 15, 12, 0, 0);
    const date = new Date(2024, 5, 15, 8, 0, 0);
    expect(getDayCellState(date, now)).toBe(DayCellState.Today);
  });

  it("returns Past for dates before today", () => {
    const now = new Date(2024, 5, 15, 12, 0, 0);
    const yesterday = new Date(2024, 5, 14, 12, 0, 0);
    expect(getDayCellState(yesterday, now)).toBe(DayCellState.Past);
  });

  it("returns Future for dates after today", () => {
    const now = new Date(2024, 5, 15, 12, 0, 0);
    const tomorrow = new Date(2024, 5, 16, 12, 0, 0);
    expect(getDayCellState(tomorrow, now)).toBe(DayCellState.Future);
  });

  it("ignores time component when comparing", () => {
    const now = new Date(2024, 5, 15, 23, 59, 59);
    const sameDay = new Date(2024, 5, 15, 0, 0, 0);
    expect(getDayCellState(sameDay, now)).toBe(DayCellState.Today);
  });
});

describe("formatDateDisplay", () => {
  it("formats date for display", () => {
    const result = formatDateDisplay("15-06-2024");
    expect(result).toContain("2024");
    expect(result).toContain("June");
    expect(result).toContain("15");
  });

  it("returns original string for invalid date", () => {
    expect(formatDateDisplay("invalid")).toBe("invalid");
  });
});

describe("getDaysInMonth", () => {
  it("returns correct days for each month", () => {
    expect(getDaysInMonth(2024, 0)).toBe(31); // January
    expect(getDaysInMonth(2024, 1)).toBe(29); // February (leap year)
    expect(getDaysInMonth(2023, 1)).toBe(28); // February (non-leap)
    expect(getDaysInMonth(2024, 3)).toBe(30); // April
    expect(getDaysInMonth(2024, 11)).toBe(31); // December
  });
});

describe("round-trip formatting", () => {
  it("parseDate(formatDate(date)) returns equivalent date", () => {
    const original = new Date(2024, 5, 15);
    const formatted = formatDate(original);
    const parsed = parseDate(formatted);

    expect(parsed).not.toBeNull();
    expect(parsed!.getDate()).toBe(original.getDate());
    expect(parsed!.getMonth()).toBe(original.getMonth());
    expect(parsed!.getFullYear()).toBe(original.getFullYear());
  });
});
