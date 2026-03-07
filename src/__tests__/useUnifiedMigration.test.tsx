// @vitest-environment jsdom
import type { Mock } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useUnifiedMigration } from "../hooks/useUnifiedMigration";
import { AppMode } from "../utils/appMode";
import { migrateLegacyData } from "../storage/unifiedMigration";

vi.mock("../storage/unifiedMigration", () => ({
  migrateLegacyData: vi.fn(),
}));

vi.mock("../hooks/useCloudPrompt", () => ({
  useCloudPrompt: () => ({
    isOpen: false,
    isPending: false,
    request: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock("../hooks/useAuth", () => ({
  AuthState: {
    Loading: "loading",
    SignedOut: "signed_out",
    SignedIn: "signed_in",
    AwaitingConfirmation: "awaiting_confirmation",
  },
}));

describe("useUnifiedMigration", () => {
  it("runs migration once for a target key", async () => {
    const triggerSync = vi.fn();
    const targetKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    (migrateLegacyData as Mock).mockResolvedValue(true);

    const { rerender } = renderHook(
      ({ mode }) =>
        useUnifiedMigration({
          mode,
          targetKey,
          localKey: null,
          cloudKey: null,
          triggerSync,
        }),
      { initialProps: { mode: AppMode.Local } },
    );

    await act(async () => {
      rerender({ mode: AppMode.Local });
    });

    await waitFor(() => expect(migrateLegacyData).toHaveBeenCalledTimes(1));
  });

  it("triggers sync when migrating in cloud mode", async () => {
    const triggerSync = vi.fn();
    const targetKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    (migrateLegacyData as Mock).mockResolvedValue(true);

    renderHook(() =>
      useUnifiedMigration({
        mode: AppMode.Cloud,
        targetKey,
        localKey: null,
        cloudKey: null,
        triggerSync,
      }),
    );

    await waitFor(() => expect(triggerSync).toHaveBeenCalledTimes(1));
  });
});
