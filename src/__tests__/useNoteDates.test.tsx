// @vitest-environment jsdom
import { renderHook, act, waitFor } from "@testing-library/react";
import { useNoteDates } from "../hooks/useNoteDates";
import { ok } from "../domain/result";
import { createMockSyncCapableRepository } from "./helpers/mocks";

describe("useNoteDates", () => {
  it("adds a note date immediately when a note is saved", async () => {
    const repository = createMockSyncCapableRepository();

    const { result } = renderHook(() => useNoteDates(repository, 2026));

    act(() => {
      result.current.applyNoteChange("05-01-2026", false);
    });

    await waitFor(() =>
      expect(result.current.hasNote("05-01-2026")).toBe(true)
    );
  });

  it("removes a note date immediately when a note is deleted", async () => {
    const repository = createMockSyncCapableRepository({
      getAllDatesForYear: vi.fn().mockResolvedValue(ok(["05-01-2026"])),
      getAllLocalDatesForYear: vi.fn().mockResolvedValue(ok(["05-01-2026"])),
    });

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

  it("keeps separate state for separate hook instances", async () => {
    const januaryRepository = createMockSyncCapableRepository({
      getAllDatesForYear: vi.fn().mockResolvedValue(ok(["05-01-2026"])),
      getAllLocalDatesForYear: vi.fn().mockResolvedValue(ok(["05-01-2026"])),
    });
    const februaryRepository = createMockSyncCapableRepository({
      getAllDatesForYear: vi.fn().mockResolvedValue(ok(["07-02-2026"])),
      getAllLocalDatesForYear: vi.fn().mockResolvedValue(ok(["07-02-2026"])),
    });

    const january = renderHook(() => useNoteDates(januaryRepository, 2026));
    const february = renderHook(() => useNoteDates(februaryRepository, 2026));

    await waitFor(() =>
      expect(january.result.current.hasNote("05-01-2026")).toBe(true)
    );
    await waitFor(() =>
      expect(february.result.current.hasNote("07-02-2026")).toBe(true)
    );

    expect(january.result.current.hasNote("07-02-2026")).toBe(false);
    expect(february.result.current.hasNote("05-01-2026")).toBe(false);
  });
});
