import { formatSyncError } from "../utils/syncError";

describe("formatSyncError", () => {
  it("returns offline label", () => {
    expect(formatSyncError({ type: "Offline", message: "offline" })).toBe(
      "Offline",
    );
  });

  it("returns conflict label", () => {
    expect(
      formatSyncError({ type: "Conflict", message: "conflict" }),
    ).toBe("Conflict detected");
  });

  it("returns remote rejected label", () => {
    expect(
      formatSyncError({ type: "RemoteRejected", message: "rejected" }),
    ).toBe("Remote rejected changes");
  });

  it("returns default label for unknown", () => {
    expect(formatSyncError({ type: "Unknown", message: "boom" })).toBe(
      "Sync failed",
    );
  });
});
