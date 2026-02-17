import { findLatestHabitDefinitions } from "../features/habits/findLatestHabitDefinitions";
import { ok, err } from "../domain/result";
import type { NoteRepository } from "../storage/noteRepository";
import type { Note, HabitValues } from "../types";

function createMockRepository(
  notes: Record<string, Note | null>,
  dates?: string[],
): NoteRepository {
  return {
    get: jest.fn((date: string) =>
      Promise.resolve(ok(notes[date] ?? null)),
    ),
    save: jest.fn().mockResolvedValue(ok(undefined)),
    delete: jest.fn().mockResolvedValue(ok(undefined)),
    getAllDates: jest.fn().mockResolvedValue(ok(dates ?? Object.keys(notes))),
  };
}

const habits: HabitValues = {
  "h1": { name: "Exercise", type: "text", order: 0, value: "done" },
  "h2": { name: "Reading", type: "text", order: 1, value: "30 min" },
};

describe("findLatestHabitDefinitions", () => {
  it("returns undefined when no previous notes exist", async () => {
    const repo = createMockRepository({});
    const result = await findLatestHabitDefinitions(repo, "17-02-2026");
    expect(result).toBeUndefined();
  });

  it("returns undefined when getAllDates fails", async () => {
    const repo = createMockRepository({});
    (repo.getAllDates as jest.Mock).mockResolvedValue(
      err({ type: "IO", message: "db error" }),
    );
    const result = await findLatestHabitDefinitions(repo, "17-02-2026");
    expect(result).toBeUndefined();
  });

  it("returns habit definitions from most recent previous note", async () => {
    const repo = createMockRepository({
      "15-02-2026": {
        date: "15-02-2026",
        content: "older",
        habits,
        updatedAt: "2026-02-15T10:00:00Z",
      },
      "16-02-2026": {
        date: "16-02-2026",
        content: "yesterday",
        habits: {
          "h3": { name: "Meditation", type: "text", order: 0, value: "yes" },
        },
        updatedAt: "2026-02-16T10:00:00Z",
      },
    });

    const result = await findLatestHabitDefinitions(repo, "17-02-2026");

    expect(result).toEqual({
      "h3": { name: "Meditation", type: "text", order: 0, value: "" },
    });
    // Should only decrypt the most recent note
    expect(repo.get).toHaveBeenCalledTimes(1);
    expect(repo.get).toHaveBeenCalledWith("16-02-2026");
  });

  it("resets all values to empty strings", async () => {
    const repo = createMockRepository({
      "16-02-2026": {
        date: "16-02-2026",
        content: "note",
        habits,
        updatedAt: "2026-02-16T10:00:00Z",
      },
    });

    const result = await findLatestHabitDefinitions(repo, "17-02-2026");

    expect(result).toEqual({
      "h1": { name: "Exercise", type: "text", order: 0, value: "" },
      "h2": { name: "Reading", type: "text", order: 1, value: "" },
    });
  });

  it("skips notes without habits", async () => {
    const repo = createMockRepository({
      "14-02-2026": {
        date: "14-02-2026",
        content: "has habits",
        habits,
        updatedAt: "2026-02-14T10:00:00Z",
      },
      "15-02-2026": {
        date: "15-02-2026",
        content: "no habits",
        updatedAt: "2026-02-15T10:00:00Z",
      },
      "16-02-2026": {
        date: "16-02-2026",
        content: "also no habits",
        updatedAt: "2026-02-16T10:00:00Z",
      },
    });

    const result = await findLatestHabitDefinitions(repo, "17-02-2026");

    expect(result).toEqual({
      "h1": { name: "Exercise", type: "text", order: 0, value: "" },
      "h2": { name: "Reading", type: "text", order: 1, value: "" },
    });
    // Should have tried 16th, 15th, then found habits on 14th
    expect(repo.get).toHaveBeenCalledTimes(3);
  });

  it("does not include notes on or after the target date", async () => {
    const repo = createMockRepository({
      "17-02-2026": {
        date: "17-02-2026",
        content: "same day",
        habits,
        updatedAt: "2026-02-17T10:00:00Z",
      },
      "18-02-2026": {
        date: "18-02-2026",
        content: "future",
        habits: {
          "h3": { name: "Future", type: "text", order: 0, value: "x" },
        },
        updatedAt: "2026-02-18T10:00:00Z",
      },
    });

    const result = await findLatestHabitDefinitions(repo, "17-02-2026");
    expect(result).toBeUndefined();
  });

  it("returns undefined for invalid beforeDate", async () => {
    const repo = createMockRepository({});
    const result = await findLatestHabitDefinitions(repo, "invalid");
    expect(result).toBeUndefined();
  });

  it("handles dates across month boundaries", async () => {
    const repo = createMockRepository({
      "31-01-2026": {
        date: "31-01-2026",
        content: "jan note",
        habits: {
          "h1": { name: "Exercise", type: "text", order: 0, value: "done" },
        },
        updatedAt: "2026-01-31T10:00:00Z",
      },
    });

    const result = await findLatestHabitDefinitions(repo, "01-02-2026");

    expect(result).toEqual({
      "h1": { name: "Exercise", type: "text", order: 0, value: "" },
    });
  });
});
