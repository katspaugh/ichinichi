import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRemoteNotes } from "../storage/remoteNotes";

const USER_ID = "user-123";

const makeRow = (overrides = {}) => ({
  id: "note-1",
  user_id: USER_ID,
  date: "2024-01-15",
  ciphertext: "abc",
  nonce: "nonce1",
  key_id: "key-1",
  revision: 1,
  updated_at: "2024-01-15T10:00:00Z",
  server_updated_at: "2024-01-15T10:00:01Z",
  deleted: false,
  ...overrides,
});

function mockSupabase(overrides: { rpcResult?: any; queryResult?: any } = {}) {
  const chain: any = {};
  for (const method of ["select", "eq", "gt", "order", "gte", "lte", "single"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any) =>
    resolve(overrides.queryResult ?? { data: [], error: null });

  return {
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue(overrides.rpcResult ?? { data: null, error: null }),
    _chain: chain,
  };
}

describe("remoteNotes", () => {
  describe("fetchNotesSince", () => {
    it("returns parsed notes", async () => {
      const row = makeRow();
      const sb = mockSupabase({ queryResult: { data: [row], error: null } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      const result = await remote.fetchNotesSince(null);

      expect(sb.from).toHaveBeenCalledWith("notes");
      expect(sb._chain.select).toHaveBeenCalledWith("*");
      expect(sb._chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
      expect(sb._chain.order).toHaveBeenCalledWith("server_updated_at", { ascending: true });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("note-1");
    });

    it("adds gt filter when cursor provided", async () => {
      const cursor = "2024-01-14T00:00:00Z";
      const sb = mockSupabase({ queryResult: { data: [], error: null } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await remote.fetchNotesSince(cursor);

      expect(sb._chain.gt).toHaveBeenCalledWith("server_updated_at", cursor);
    });

    it("does not add gt filter when cursor is null", async () => {
      const sb = mockSupabase({ queryResult: { data: [], error: null } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await remote.fetchNotesSince(null);

      expect(sb._chain.gt).not.toHaveBeenCalled();
    });

    it("filters out invalid rows", async () => {
      const validRow = makeRow();
      const invalidRow = { id: 123 }; // invalid
      const sb = mockSupabase({ queryResult: { data: [validRow, invalidRow], error: null } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      const result = await remote.fetchNotesSince(null);
      expect(result).toHaveLength(1);
    });

    it("throws on error", async () => {
      const sb = mockSupabase({ queryResult: { data: null, error: { message: "DB error" } } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await expect(remote.fetchNotesSince(null)).rejects.toBeTruthy();
    });
  });

  describe("fetchAllNotes", () => {
    it("delegates to fetchNotesSince(null)", async () => {
      const row = makeRow();
      const sb = mockSupabase({ queryResult: { data: [row], error: null } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      const result = await remote.fetchAllNotes();

      expect(result).toHaveLength(1);
      expect(sb._chain.gt).not.toHaveBeenCalled();
    });
  });

  describe("pushNote", () => {
    const payload = {
      id: "note-1",
      date: "2024-01-15",
      ciphertext: "abc",
      nonce: "nonce1",
      keyId: "key-1",
      revision: 1,
      updatedAt: "2024-01-15T10:00:00Z",
    };

    it("calls rpc with correct params and returns parsed row", async () => {
      const row = makeRow();
      const sb = mockSupabase({ rpcResult: { data: row, error: null } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      const result = await remote.pushNote(payload);

      expect(sb.rpc).toHaveBeenCalledWith("push_note", {
        p_id: payload.id,
        p_user_id: USER_ID,
        p_date: payload.date,
        p_key_id: payload.keyId,
        p_ciphertext: payload.ciphertext,
        p_nonce: payload.nonce,
        p_revision: payload.revision,
        p_updated_at: payload.updatedAt,
        p_deleted: false,
      });
      expect(result.id).toBe("note-1");
    });

    it("passes deleted flag when provided", async () => {
      const row = makeRow({ deleted: true });
      const sb = mockSupabase({ rpcResult: { data: row, error: null } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await remote.pushNote({ ...payload, deleted: true });

      expect(sb.rpc).toHaveBeenCalledWith("push_note", expect.objectContaining({ p_deleted: true }));
    });

    it("throws conflict error on P0002", async () => {
      const sb = mockSupabase({ rpcResult: { data: null, error: { code: "P0002", message: "not found" } } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await expect(remote.pushNote(payload)).rejects.toThrow("Conflict");
    });

    it("throws conflict error on 23505", async () => {
      const sb = mockSupabase({ rpcResult: { data: null, error: { code: "23505", message: "duplicate" } } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await expect(remote.pushNote(payload)).rejects.toThrow("Conflict");
    });

    it("throws generic error on other error codes", async () => {
      const err = { code: "99999", message: "unknown" };
      const sb = mockSupabase({ rpcResult: { data: null, error: err } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await expect(remote.pushNote(payload)).rejects.toBe(err);
    });
  });

  describe("deleteNote", () => {
    it("calls rpc with correct params", async () => {
      const sb = mockSupabase({ rpcResult: { data: null, error: null } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await remote.deleteNote("note-1", 2);

      expect(sb.rpc).toHaveBeenCalledWith("delete_note", {
        p_id: "note-1",
        p_user_id: USER_ID,
        p_revision: 2,
      });
    });

    it("throws conflict error on P0002", async () => {
      const sb = mockSupabase({ rpcResult: { data: null, error: { code: "P0002", message: "not found" } } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await expect(remote.deleteNote("note-1", 1)).rejects.toThrow("Conflict");
    });

    it("throws on other errors", async () => {
      const err = { code: "50000", message: "server error" };
      const sb = mockSupabase({ rpcResult: { data: null, error: err } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await expect(remote.deleteNote("note-1", 1)).rejects.toBe(err);
    });
  });

  describe("fetchNoteDates", () => {
    it("returns date strings", async () => {
      const dates = [{ date: "2024-01-15" }, { date: "2024-01-16" }];
      const sb = mockSupabase({ queryResult: { data: dates, error: null } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      const result = await remote.fetchNoteDates();

      expect(sb.from).toHaveBeenCalledWith("notes");
      expect(sb._chain.select).toHaveBeenCalledWith("date");
      expect(sb._chain.eq).toHaveBeenCalledWith("deleted", false);
      expect(result).toEqual(["2024-01-15", "2024-01-16"]);
    });

    it("adds year filter when provided", async () => {
      const sb = mockSupabase({ queryResult: { data: [], error: null } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await remote.fetchNoteDates(2024);

      expect(sb._chain.eq).toHaveBeenCalledWith("note_year", 2024);
    });

    it("does not add year filter when omitted", async () => {
      const sb = mockSupabase({ queryResult: { data: [], error: null } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await remote.fetchNoteDates();

      const eqCalls = sb._chain.eq.mock.calls.map((c: any[]) => c[0]);
      expect(eqCalls).not.toContain("note_year");
    });

    it("throws on error", async () => {
      const sb = mockSupabase({ queryResult: { data: null, error: { message: "DB error" } } });
      const remote = createRemoteNotes(sb as any, USER_ID);

      await expect(remote.fetchNoteDates()).rejects.toBeTruthy();
    });
  });
});
