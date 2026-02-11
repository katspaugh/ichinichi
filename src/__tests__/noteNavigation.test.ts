import {
  getNavigableDates,
  getPreviousDate,
  getNextDate,
  getNavigationBoundaries,
} from "../utils/noteNavigation";

describe("getNavigableDates", () => {
  it("returns sorted dates from note dates", () => {
    const notes = new Set(["15-06-2024", "01-01-2024", "20-03-2024"]);
    const result = getNavigableDates(notes, "11-02-2026");

    // Should be chronologically sorted (oldest first)
    expect(result[0]).toBe("01-01-2024");
    expect(result[1]).toBe("20-03-2024");
    expect(result[2]).toBe("15-06-2024");
  });

  it("includes today even if not in note dates", () => {
    const notes = new Set(["01-01-2024"]);
    const today = "15-06-2024";
    const result = getNavigableDates(notes, today);

    expect(result).toContain(today);
  });

  it("does not duplicate today if already in note dates", () => {
    const today = "15-06-2024";
    const notes = new Set([today, "01-01-2024"]);
    const result = getNavigableDates(notes, today);

    const todayCount = result.filter((d) => d === today).length;
    expect(todayCount).toBe(1);
  });

  it("returns just today for empty note set", () => {
    const today = "15-06-2024";
    const result = getNavigableDates(new Set(), today);
    expect(result).toEqual([today]);
  });

  it("sorts chronologically (DD-MM-YYYY format)", () => {
    const notes = new Set(["25-12-2023", "01-06-2024", "15-01-2024"]);
    const result = getNavigableDates(notes, "01-07-2024");

    expect(result).toEqual([
      "25-12-2023",
      "15-01-2024",
      "01-06-2024",
      "01-07-2024",
    ]);
  });
});

describe("getPreviousDate", () => {
  const dates = ["01-01-2024", "15-03-2024", "20-06-2024"];

  it("returns previous date in array", () => {
    expect(getPreviousDate("15-03-2024", dates)).toBe("01-01-2024");
  });

  it("returns null when at the start", () => {
    expect(getPreviousDate("01-01-2024", dates)).toBeNull();
  });

  it("returns null when date not found", () => {
    expect(getPreviousDate("99-99-9999", dates)).toBeNull();
  });

  it("returns second-to-last for last element", () => {
    expect(getPreviousDate("20-06-2024", dates)).toBe("15-03-2024");
  });
});

describe("getNextDate", () => {
  const dates = ["01-01-2024", "15-03-2024", "20-06-2024"];

  it("returns next date in array", () => {
    expect(getNextDate("01-01-2024", dates)).toBe("15-03-2024");
  });

  it("returns null when at the end", () => {
    expect(getNextDate("20-06-2024", dates)).toBeNull();
  });

  it("returns null when date not found", () => {
    expect(getNextDate("99-99-9999", dates)).toBeNull();
  });

  it("returns second element for first element", () => {
    expect(getNextDate("01-01-2024", dates)).toBe("15-03-2024");
  });
});

describe("getNavigationBoundaries", () => {
  const dates = ["01-01-2024", "15-03-2024", "20-06-2024"];

  it("detects start boundary", () => {
    const { isAtStart, isAtEnd } = getNavigationBoundaries(
      "01-01-2024",
      dates,
    );
    expect(isAtStart).toBe(true);
    expect(isAtEnd).toBe(false);
  });

  it("detects end boundary", () => {
    const { isAtStart, isAtEnd } = getNavigationBoundaries(
      "20-06-2024",
      dates,
    );
    expect(isAtStart).toBe(false);
    expect(isAtEnd).toBe(true);
  });

  it("detects middle (neither boundary)", () => {
    const { isAtStart, isAtEnd } = getNavigationBoundaries(
      "15-03-2024",
      dates,
    );
    expect(isAtStart).toBe(false);
    expect(isAtEnd).toBe(false);
  });

  it("single-element array is both start and end", () => {
    const { isAtStart, isAtEnd } = getNavigationBoundaries("01-01-2024", [
      "01-01-2024",
    ]);
    expect(isAtStart).toBe(true);
    expect(isAtEnd).toBe(true);
  });

  it("unknown date reports as not at boundaries (index -1)", () => {
    const { isAtStart, isAtEnd } = getNavigationBoundaries(
      "99-99-9999",
      dates,
    );
    // indexOf returns -1, so isAtStart is false (-1 !== 0)
    // isAtEnd is false (-1 !== 2)
    expect(isAtStart).toBe(false);
    expect(isAtEnd).toBe(false);
  });
});
