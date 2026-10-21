// @vitest-environment jsdom
import { render, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutoTagsSection } from "../components/SettingsSidebar/SettingsSidebar";
vi.mock("../hooks/useHabits", () => ({
  useHabits: () => ({
    sectionTypes: [{ type: "trumpet", days: 8, slot: 3, pinned: true }],
  }),
}));
vi.mock("../hooks/useAutoTagsEnabled", () => ({
  useAutoTagsEnabled: () => ({ enabled: true, setEnabled: vi.fn() }),
}));
vi.mock("../contexts/noteRepositoryContext", () => ({
  useNoteRepositoryContext: () => ({
    autoTagStatus: { phase: "ready", message: "Up to date" },
    retryAutoTags: vi.fn(),
  }),
}));
describe("auto tag rows", () => {
  it("opens tag results when clicked and has no per-tag switch", () => {
    const select = vi.fn();
    render(<AutoTagsSection onSelectTag={select} />);
    fireEvent.click(screen.getByRole("button", { name: "trumpet 8 days" }));
    expect(select).toHaveBeenCalledWith("trumpet");
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(
      screen.queryByRole("switch", { name: "Show trumpet on the calendar" }),
    ).toBeNull();
  });
});
