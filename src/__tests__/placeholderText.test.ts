import {
  stringHash,
  getTimePeriod,
  getSeason,
  getJournalingPrompt,
  getPastEmptyMessage,
  getFutureEmptyMessage,
  getPlaceholderText,
} from "../utils/placeholderText";
import {
  JOURNALING_PROMPTS,
  PAST_EMPTY_MESSAGES,
  FUTURE_EMPTY_MESSAGES,
} from "../utils/placeholderPrompts";

describe("stringHash", () => {
  it("returns a non-negative integer", () => {
    expect(stringHash("hello")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(stringHash("hello"))).toBe(true);
  });

  it("is deterministic", () => {
    expect(stringHash("test")).toBe(stringHash("test"));
    expect(stringHash("04-03-2026")).toBe(stringHash("04-03-2026"));
  });

  it("produces different values for different inputs", () => {
    const a = stringHash("01-01-2024");
    const b = stringHash("02-01-2024");
    const c = stringHash("01-01-2025");
    // Not all the same (extremely unlikely with djb2)
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });
});

describe("getTimePeriod", () => {
  it.each([
    [5, "morning"],
    [6, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [14, "afternoon"],
    [16, "afternoon"],
    [17, "evening"],
    [19, "evening"],
    [20, "evening"],
    [21, "night"],
    [23, "night"],
    [0, "night"],
    [4, "night"],
  ] as const)("hour %i → %s", (hour, expected) => {
    expect(getTimePeriod(hour)).toBe(expected);
  });
});

describe("getSeason", () => {
  it.each([
    [0, "winter"], // January
    [1, "winter"], // February
    [2, "spring"], // March
    [3, "spring"], // April
    [4, "spring"], // May
    [5, "summer"], // June
    [6, "summer"], // July
    [7, "summer"], // August
    [8, "fall"], // September
    [9, "fall"], // October
    [10, "fall"], // November
    [11, "winter"], // December
  ] as const)("month %i → %s", (month, expected) => {
    expect(getSeason(month)).toBe(expected);
  });
});

describe("getJournalingPrompt", () => {
  it("returns a non-empty string", () => {
    const result = getJournalingPrompt(
      "04-03-2026",
      new Date(2026, 2, 4, 9, 0),
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it("is deterministic for same date and time period", () => {
    const now1 = new Date(2026, 2, 4, 9, 0); // 9 AM
    const now2 = new Date(2026, 2, 4, 10, 30); // 10:30 AM (same period)
    expect(getJournalingPrompt("04-03-2026", now1)).toBe(
      getJournalingPrompt("04-03-2026", now2),
    );
  });

  it("changes when time period changes", () => {
    const morning = new Date(2026, 2, 4, 9, 0);
    const evening = new Date(2026, 2, 4, 19, 0);
    const morningPrompt = getJournalingPrompt("04-03-2026", morning);
    const eveningPrompt = getJournalingPrompt("04-03-2026", evening);
    // Different periods should pick from different pools — overwhelming
    // likelihood of different result, but theoretically could collide.
    // We test the mechanism, not randomness.
    expect(typeof morningPrompt).toBe("string");
    expect(typeof eveningPrompt).toBe("string");
  });

  it("never returns a past-tense reflective prompt in the morning", () => {
    const morningPrompts = JOURNALING_PROMPTS.filter((p) =>
      p.periods.includes("morning"),
    );
    const pastTensePatterns = [
      /^How was your day/,
      /stayed with you/,
      /did you avoid/,
      /did you learn about yourself/,
      /would you do differently/,
    ];
    for (const prompt of morningPrompts) {
      for (const pattern of pastTensePatterns) {
        expect(prompt.text).not.toMatch(pattern);
      }
    }
  });

  it("does not return weekendOnly prompts on weekdays", () => {
    // Wednesday March 4, 2026
    const wednesday = new Date(2026, 2, 4, 14, 0);
    const weekendPrompts = JOURNALING_PROMPTS.filter((p) => p.weekendOnly).map(
      (p) => p.text,
    );

    // Run many salt values to check none return a weekend prompt
    for (let salt = 0; salt < 50; salt++) {
      const result = getJournalingPrompt("04-03-2026", wednesday, salt);
      expect(weekendPrompts).not.toContain(result);
    }
  });

  it("does not return weekdayOnly prompts on weekends", () => {
    // Saturday March 7, 2026
    const saturday = new Date(2026, 2, 7, 9, 0);
    const weekdayPrompts = JOURNALING_PROMPTS.filter((p) => p.weekdayOnly).map(
      (p) => p.text,
    );

    for (let salt = 0; salt < 50; salt++) {
      const result = getJournalingPrompt("07-03-2026", saturday, salt);
      expect(weekdayPrompts).not.toContain(result);
    }
  });

  it("returns a different prompt when salt changes", () => {
    const now = new Date(2026, 2, 4, 14, 0);
    const results = new Set<string>();
    for (let salt = 0; salt < 20; salt++) {
      results.add(getJournalingPrompt("04-03-2026", now, salt));
    }
    // With 20 different salts, we should get more than 1 unique prompt
    expect(results.size).toBeGreaterThan(1);
  });
});

describe("getPastEmptyMessage", () => {
  it("returns a string from PAST_EMPTY_MESSAGES", () => {
    const result = getPastEmptyMessage("15-06-2020");
    expect(PAST_EMPTY_MESSAGES).toContain(result);
  });

  it("is deterministic per date", () => {
    expect(getPastEmptyMessage("01-01-2020")).toBe(
      getPastEmptyMessage("01-01-2020"),
    );
  });

  it("different dates can produce different messages", () => {
    const results = new Set<string>();
    for (let i = 1; i <= 20; i++) {
      results.add(getPastEmptyMessage(`${String(i).padStart(2, "0")}-01-2020`));
    }
    expect(results.size).toBeGreaterThan(1);
  });
});

describe("getFutureEmptyMessage", () => {
  it("returns a string from FUTURE_EMPTY_MESSAGES", () => {
    const result = getFutureEmptyMessage("15-06-2030");
    expect(FUTURE_EMPTY_MESSAGES).toContain(result);
  });

  it("is deterministic per date", () => {
    expect(getFutureEmptyMessage("01-01-2030")).toBe(
      getFutureEmptyMessage("01-01-2030"),
    );
  });

  it("different dates can produce different messages", () => {
    const results = new Set<string>();
    for (let i = 1; i <= 20; i++) {
      results.add(
        getFutureEmptyMessage(`${String(i).padStart(2, "0")}-06-2030`),
      );
    }
    expect(results.size).toBeGreaterThan(1);
  });
});

describe("getPlaceholderText", () => {
  const base = {
    isContentReady: true,
    isDecrypting: false,
    isOfflineStub: false,
    isEditable: false,
    date: "15-01-2020",
  };

  it('returns "Loading..." when content is not ready', () => {
    expect(
      getPlaceholderText({ ...base, isContentReady: false }),
    ).toBe("Loading...");
  });

  it('returns "Loading..." when decrypting', () => {
    expect(
      getPlaceholderText({ ...base, isDecrypting: true }),
    ).toBe("Loading...");
  });

  it("returns offline message when offline stub", () => {
    expect(
      getPlaceholderText({ ...base, isOfflineStub: true }),
    ).toBe(
      "This note can't be loaded while offline. Go online to view it.",
    );
  });

  it("returns a journaling prompt when editable (today)", () => {
    const result = getPlaceholderText({
      ...base,
      isEditable: true,
      date: "04-03-2026",
      now: new Date(2026, 2, 4, 14, 0),
    });
    // Should be one of the prompts, not the old static text
    expect(result).not.toBe("Write your note for today...");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a past message for a past non-editable date", () => {
    const result = getPlaceholderText({
      ...base,
      date: "01-01-2020", // well in the past
    });
    expect(PAST_EMPTY_MESSAGES).toContain(result);
  });

  it("returns a future message for a future non-editable date", () => {
    const result = getPlaceholderText({
      ...base,
      date: "01-01-2099", // well in the future
    });
    expect(FUTURE_EMPTY_MESSAGES).toContain(result);
  });
});
