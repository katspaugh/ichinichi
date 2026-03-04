import { getMoonPhaseEmoji } from "../utils/moonPhase";

describe("getMoonPhaseEmoji", () => {
  it("returns new moon emoji for a known new moon date", () => {
    // January 6, 2000 was the reference new moon
    expect(getMoonPhaseEmoji(new Date(2000, 0, 6))).toBe("🌑");
  });

  it("returns full moon emoji for ~14.76 days after new moon", () => {
    // January 21, 2000 was a full moon
    expect(getMoonPhaseEmoji(new Date(2000, 0, 21))).toBe("🌕");
  });

  it("returns first quarter for ~7.38 days after new moon", () => {
    // January 14, 2000 — first quarter
    expect(getMoonPhaseEmoji(new Date(2000, 0, 14))).toBe("🌓");
  });

  it("returns last quarter for ~22.15 days after new moon", () => {
    // January 28, 2000 — last quarter
    expect(getMoonPhaseEmoji(new Date(2000, 0, 28))).toBe("🌗");
  });

  it("returns a valid moon emoji for any date", () => {
    const validEmojis = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
    const dates = [
      new Date(2024, 5, 15),
      new Date(1999, 11, 31),
      new Date(2030, 6, 4),
    ];
    for (const date of dates) {
      expect(validEmojis).toContain(getMoonPhaseEmoji(date));
    }
  });

  it("handles dates before the reference new moon", () => {
    const validEmojis = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
    expect(validEmojis).toContain(getMoonPhaseEmoji(new Date(1990, 0, 1)));
  });
});
