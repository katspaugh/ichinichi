import { renderHook, act, waitFor } from "@testing-library/react";
import { useNoteDates } from "../hooks/useNoteDates";
import { ok } from "../domain/result";

describe("useNoteDates", () => {
  it("adds a note date immediately when a note is saved", async () => {
    const repository = {
      get: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      getAllDates: jest.fn(),
      getAllDatesForYear: jest.fn().mockResolvedValue(ok([])),
      getAllLocalDatesForYear: jest.fn().mockResolvedValue(ok([])),
      refreshDates: jest.fn().mockResolvedValue(undefined),
    };

    const { result } = renderHook(() => useNoteDates(repository, 2026));

    act(() => {
      result.current.applyNoteChange("05-01-2026", false);
    });

    await waitFor(() =>
      expect(result.current.hasNote("05-01-2026")).toBe(true)
    );
  });

  it("removes a note date immediately when a note is deleted", async () => {
    const repository = {
      get: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      getAllDates: jest.fn(),
      getAllDatesForYear: jest.fn().mockResolvedValue(ok(["05-01-2026"])),
      getAllLocalDatesForYear: jest.fn().mockResolvedValue(ok(["05-01-2026"])),
      refreshDates: jest.fn().mockResolvedValue(undefined),
    };

    const { result } = renderHook(() => useNoteDates(repository, 2026));

    await waitFor(() =>
      expect(result.current.hasNote("05-01-2026")).toBe(true)
    );

    act(() => {
      result.current.applyNoteChange("05-01-2026", true);
    });

    await waitFor(() =>
      expect(result.current.hasNote("05-01-2026")).toBe(false)
    );
  });
});
