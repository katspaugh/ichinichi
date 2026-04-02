import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { syncAll } from "../hooks/useSync";
import {
  setCachedNote,
  getCachedNote,
  getSyncCursor,
  clearAll,
} from "../storage/cache";
import type { RemoteNotes } from "../storage/remoteNotes";
import type { RemoteNoteRow } from "../storage/parsers";

function makeRow(overrides: Partial<RemoteNoteRow> = {}): RemoteNoteRow {
  return {
    id: "row-1",
    user_id: "user-1",
    date: "01-04-2026",
    ciphertext: "abc123",
    nonce: "nonce1",
    key_id: "key-1",
    revision: 1,
    updated_at: "2026-04-01T10:00:00Z",
    server_updated_at: "2026-04-01T10:00:00Z",
    deleted: false,
    ...overrides,
  };
}

function makeRemote(rows: RemoteNoteRow[]): RemoteNotes {
  return {
    fetchNotesSince: vi.fn().mockResolvedValue(rows),
    fetchAllNotes: vi.fn().mockResolvedValue(rows),
    pushNote: vi.fn(),
    deleteNote: vi.fn(),
    fetchNoteDates: vi.fn(),
  } as unknown as RemoteNotes;
}

beforeEach(() => clearAll());
afterEach(() => clearAll());

describe("syncAll", () => {
  it("fetches notes since cursor and updates cache", async () => {
    const row = makeRow();
    const remote = makeRemote([row]);

    await syncAll(remote);

    expect(remote.fetchNotesSince).toHaveBeenCalledWith(null);
    const cached = await getCachedNote(row.date);
    expect(cached).not.toBeNull();
    expect(cached?.ciphertext).toBe("abc123");
    expect(cached?.keyId).toBe("key-1");
    expect(cached?.remoteId).toBe("row-1");

    const cursor = await getSyncCursor();
    expect(cursor).toBe("2026-04-01T10:00:00Z");
  });

  it("removes deleted notes from cache", async () => {
    await setCachedNote({
      date: "02-04-2026",
      ciphertext: "old",
      nonce: "n",
      keyId: "k",
      updatedAt: "2026-04-01T09:00:00Z",
      revision: 1,
      remoteId: "row-del",
    });

    const row = makeRow({ date: "02-04-2026", deleted: true, id: "row-del" });
    const remote = makeRemote([row]);

    await syncAll(remote);

    const cached = await getCachedNote("02-04-2026");
    expect(cached).toBeNull();
  });

  it("handles empty response without errors", async () => {
    const remote = makeRemote([]);
    await expect(syncAll(remote)).resolves.toBeUndefined();
    const cursor = await getSyncCursor();
    expect(cursor).toBeNull();
  });

  it("advances cursor to latest server_updated_at", async () => {
    const rows = [
      makeRow({
        id: "r1",
        date: "01-04-2026",
        server_updated_at: "2026-04-01T08:00:00Z",
      }),
      makeRow({
        id: "r2",
        date: "02-04-2026",
        server_updated_at: "2026-04-01T12:00:00Z",
      }),
    ];
    const remote = makeRemote(rows);

    await syncAll(remote);

    const cursor = await getSyncCursor();
    expect(cursor).toBe("2026-04-01T12:00:00Z");
  });
});
