import { renderHook, act, waitFor } from "@testing-library/react";
import { useNoteContent } from "../hooks/useNoteContent";
import { createHydratingSyncedNoteRepository } from "../domain/notes/hydratingSyncedNoteRepository";
import { createHydratingNoteRepository } from "../domain/notes/hydratingNoteRepository";
import { createUnifiedSyncedNoteEnvelopeRepository } from "../storage/unifiedSyncedNoteRepository";
import { createE2eeService } from "../services/e2eeService";
import { closeUnifiedDb } from "../storage/unifiedDb";
import { getAllAccountDbNames } from "../storage/accountStore";
import { setRemoteDatesForYear } from "../storage/remoteNoteIndexStore";
import type {
  RemoteNotesGateway,
  RemoteNote,
} from "../domain/sync/remoteNotesGateway";
import type { Clock } from "../domain/runtime/clock";
import type { SyncStateStore } from "../domain/sync/syncStateStore";
import type { E2eeServiceFactory } from "../domain/crypto/e2eeService";
import type { KeyringProvider } from "../domain/crypto/keyring";
import type { NoteRepository } from "../storage/noteRepository";

// Mock connectivity module
let mockOnline = true;
const getMockOnline = () => mockOnline;
jest.mock("../hooks/useConnectivity", () => ({
  useConnectivity: () => getMockOnline(),
}));

async function deleteUnifiedDb(): Promise<void> {
  closeUnifiedDb();
  const dbNames = getAllAccountDbNames();
  await Promise.all(
    dbNames.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => resolve();
        }),
    ),
  );
}

async function createVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

function createKeyring(keyId: string, vaultKey: CryptoKey): KeyringProvider {
  return {
    activeKeyId: keyId,
    getKey: (id: string) => (id === keyId ? vaultKey : null),
  };
}

function createMockGateway(
  remoteNotes: Map<string, RemoteNote> = new Map(),
): RemoteNotesGateway {
  const gateway: RemoteNotesGateway = {
    fetchNoteByDate: jest.fn().mockImplementation(async (date: string) => {
      const note = remoteNotes.get(date);
      return { ok: true, value: note ?? null };
    }),
    fetchNoteDates: jest.fn().mockImplementation(async () => {
      return { ok: true, value: Array.from(remoteNotes.keys()) };
    }),
    fetchNotesSince: jest.fn().mockResolvedValue({ ok: true, value: [] }),
    pushNote: jest.fn().mockImplementation(async (note) => {
      // Store the pushed note so subsequent fetches find it
      const remoteNote: RemoteNote = {
        ...note,
        id: note.id ?? `remote-id-${Date.now()}`,
        serverUpdatedAt: new Date().toISOString(),
        deleted: false,
      };
      remoteNotes.set(note.date, remoteNote);
      return { ok: true, value: remoteNote };
    }),
    deleteNote: jest.fn().mockImplementation(async ({ date }) => {
      remoteNotes.delete(date);
      return { ok: true, value: undefined };
    }),
  };
  return gateway;
}

function createMockClock(date = "2025-01-05T10:00:00.000Z"): Clock {
  return { now: () => new Date(date) };
}

function createMockSyncStateStore(): SyncStateStore {
  return {
    getState: jest
      .fn()
      .mockResolvedValue({ ok: true, value: { id: "state", cursor: null } }),
    setState: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
  };
}

interface CloudRepositorySetup {
  repository: ReturnType<typeof createHydratingSyncedNoteRepository>;
  gateway: RemoteNotesGateway;
  keyring: KeyringProvider;
  vaultKey: CryptoKey;
  keyId: string;
}

async function setupCloudRepository(
  remoteNotes: Map<string, RemoteNote> = new Map(),
): Promise<CloudRepositorySetup> {
  const vaultKey = await createVaultKey();
  const keyId = "cloud-key-1";
  const keyring = createKeyring(keyId, vaultKey);
  const gateway = createMockGateway(remoteNotes);
  const connectivity = { isOnline: () => mockOnline };
  const clock = createMockClock();
  const syncStateStore = createMockSyncStateStore();
  const e2eeFactory: E2eeServiceFactory = { create: createE2eeService };

  const envelopeRepo = createUnifiedSyncedNoteEnvelopeRepository(
    gateway,
    keyId,
    async () => undefined,
    connectivity,
    clock,
    syncStateStore,
  );

  const repository = createHydratingSyncedNoteRepository(
    envelopeRepo,
    keyring,
    e2eeFactory,
  );

  return { repository, gateway, keyring, vaultKey, keyId };
}

interface LocalRepositorySetup {
  repository: NoteRepository;
  keyring: KeyringProvider;
  vaultKey: CryptoKey;
  keyId: string;
}

async function setupLocalRepository(): Promise<LocalRepositorySetup> {
  const vaultKey = await createVaultKey();
  const keyId = "local-key-1";
  const keyring = createKeyring(keyId, vaultKey);
  const e2eeFactory: E2eeServiceFactory = { create: createE2eeService };

  const repository = createHydratingNoteRepository(keyring, e2eeFactory);

  return { repository, keyring, vaultKey, keyId };
}

describe("offline note loading", () => {
  beforeEach(async () => {
    mockOnline = true;
    await deleteUnifiedDb();
    localStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("cloud mode (user logged in)", () => {
    it("loads note from IDB when going offline after initial load", async () => {
      const { repository } = await setupCloudRepository();
      const testDate = "05-01-2025";
      const testContent = "Hello, this is my note content!";

      // Save a note while online
      await repository.save(testDate, testContent);
      await setRemoteDatesForYear(2025, [testDate]);

      const hasNoteForDate = jest.fn().mockReturnValue(true);

      const { result, rerender } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => {
        expect(result.current.isContentReady).toBe(true);
      });

      expect(result.current.content).toBe(testContent);
      expect(result.current.isOfflineStub).toBe(false);

      // Go offline
      await act(async () => {
        mockOnline = false;
        rerender();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        expect(result.current.isContentReady).toBe(true);
      });

      // Note should still be available
      expect(result.current.content).toBe(testContent);
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("shows offline stub for notes only in cloud (not in local cache)", async () => {
      const { repository } = await setupCloudRepository();
      const testDate = "06-01-2025";

      // Add to remote index WITHOUT saving locally
      await setRemoteDatesForYear(2025, [testDate]);

      mockOnline = false;
      const hasNoteForDate = jest.fn().mockReturnValue(true);

      const { result } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => {
        expect(result.current.isContentReady).toBe(true);
      });

      expect(result.current.isOfflineStub).toBe(true);
      expect(result.current.content).toBe("");
    });

    it("loads past notes from IDB while offline", async () => {
      const { repository } = await setupCloudRepository();
      const pastDate = "01-01-2025"; // Past date
      const pastContent = "This is a past note from January 1st";

      // Save a past note while online
      await repository.save(pastDate, pastContent);
      await setRemoteDatesForYear(2025, [pastDate]);

      // Go offline first
      mockOnline = false;

      const hasNoteForDate = jest.fn().mockReturnValue(true);

      const { result } = renderHook(() =>
        useNoteContent(pastDate, repository, hasNoteForDate),
      );

      await waitFor(() => {
        expect(result.current.isContentReady).toBe(true);
      });

      // Past note should load from IDB
      expect(result.current.content).toBe(pastContent);
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("handles multiple notes, some cached and some not", async () => {
      const { repository } = await setupCloudRepository();

      // Save some notes locally
      const cachedDate1 = "01-01-2025";
      const cachedDate2 = "02-01-2025";
      const uncachedDate = "03-01-2025";

      await repository.save(cachedDate1, "Note 1 content");
      await repository.save(cachedDate2, "Note 2 content");

      // Add all three to remote index (simulating that uncachedDate exists on server)
      await setRemoteDatesForYear(2025, [
        cachedDate1,
        cachedDate2,
        uncachedDate,
      ]);

      mockOnline = false;
      const hasNoteForDate = jest.fn().mockReturnValue(true);

      // Test cached note 1
      const { result: result1 } = renderHook(() =>
        useNoteContent(cachedDate1, repository, hasNoteForDate),
      );
      await waitFor(() => expect(result1.current.isContentReady).toBe(true));
      expect(result1.current.content).toBe("Note 1 content");
      expect(result1.current.isOfflineStub).toBe(false);

      // Test cached note 2
      const { result: result2 } = renderHook(() =>
        useNoteContent(cachedDate2, repository, hasNoteForDate),
      );
      await waitFor(() => expect(result2.current.isContentReady).toBe(true));
      expect(result2.current.content).toBe("Note 2 content");
      expect(result2.current.isOfflineStub).toBe(false);

      // Test uncached note - should show offline stub
      const { result: result3 } = renderHook(() =>
        useNoteContent(uncachedDate, repository, hasNoteForDate),
      );
      await waitFor(() => expect(result3.current.isContentReady).toBe(true));
      expect(result3.current.content).toBe("");
      expect(result3.current.isOfflineStub).toBe(true);
    });

    it("transitions from online to offline while viewing a note", async () => {
      const { repository } = await setupCloudRepository();
      const testDate = "05-01-2025";
      const testContent = "Content that should persist offline";

      await repository.save(testDate, testContent);
      await setRemoteDatesForYear(2025, [testDate]);

      const hasNoteForDate = jest.fn().mockReturnValue(true);

      // Start online
      const { result, rerender } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));
      expect(result.current.content).toBe(testContent);

      // Go offline and verify content persists
      await act(async () => {
        mockOnline = false;
        rerender();
      });

      // Wait for load to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(() => expect(result.current.isContentReady).toBe(true));
      expect(result.current.content).toBe(testContent);
      expect(result.current.isOfflineStub).toBe(false);

      // Go back online
      await act(async () => {
        mockOnline = true;
        rerender();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(() => expect(result.current.isContentReady).toBe(true));
      expect(result.current.content).toBe(testContent);

      // Go offline again
      await act(async () => {
        mockOnline = false;
        rerender();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(() => expect(result.current.isContentReady).toBe(true));
      expect(result.current.content).toBe(testContent);
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("loads empty note (new note) while offline", async () => {
      const { repository } = await setupCloudRepository();
      const newDate = "15-01-2025";

      // Don't save anything - this is a new note
      mockOnline = false;
      const hasNoteForDate = jest.fn().mockReturnValue(false);

      const { result } = renderHook(() =>
        useNoteContent(newDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));

      // New note should load with empty content, not as offline stub
      expect(result.current.content).toBe("");
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("handles note that was deleted remotely while offline", async () => {
      const { repository } = await setupCloudRepository();
      const testDate = "05-01-2025";
      const testContent = "This note will be 'deleted' remotely";

      // Save locally
      await repository.save(testDate, testContent);

      // Don't add to remote index (simulating it was deleted on server)
      // But note is still in local IDB

      mockOnline = false;
      const hasNoteForDate = jest.fn().mockReturnValue(true);

      const { result } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));

      // Local copy should still be available offline
      expect(result.current.content).toBe(testContent);
      expect(result.current.isOfflineStub).toBe(false);
    });
  });

  describe("local mode (user logged out)", () => {
    it("loads notes from IDB while offline", async () => {
      const { repository } = await setupLocalRepository();
      const testDate = "05-01-2025";
      const testContent = "Local only note content";

      // Save a note
      await repository.save(testDate, testContent);

      mockOnline = false;
      const hasNoteForDate = jest.fn().mockReturnValue(true);

      const { result } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));

      expect(result.current.content).toBe(testContent);
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("loads notes from IDB while online (local mode ignores network)", async () => {
      const { repository } = await setupLocalRepository();
      const testDate = "05-01-2025";
      const testContent = "Local mode note";

      await repository.save(testDate, testContent);

      mockOnline = true;
      const hasNoteForDate = jest.fn().mockReturnValue(true);

      const { result } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));

      expect(result.current.content).toBe(testContent);
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("handles transition from online to offline gracefully", async () => {
      const { repository } = await setupLocalRepository();
      const testDate = "05-01-2025";
      const testContent = "Persistent local note";

      await repository.save(testDate, testContent);

      const hasNoteForDate = jest.fn().mockReturnValue(true);

      // Start online
      mockOnline = true;
      const { result, rerender } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));
      expect(result.current.content).toBe(testContent);

      // Go offline
      await act(async () => {
        mockOnline = false;
        rerender();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Content should remain
      expect(result.current.content).toBe(testContent);
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("creates new note while offline", async () => {
      const { repository } = await setupLocalRepository();
      const newDate = "20-01-2025";

      mockOnline = false;
      const hasNoteForDate = jest.fn().mockReturnValue(false);

      const { result } = renderHook(() =>
        useNoteContent(newDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));

      // Should be ready to edit, not showing offline stub
      expect(result.current.content).toBe("");
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("loads multiple past notes while offline", async () => {
      const { repository } = await setupLocalRepository();

      // Create several past notes
      const notes = [
        { date: "01-01-2025", content: "January 1st note" },
        { date: "15-01-2025", content: "January 15th note" },
        { date: "01-12-2024", content: "December note from last year" },
      ];

      for (const note of notes) {
        await repository.save(note.date, note.content);
      }

      mockOnline = false;
      const hasNoteForDate = jest.fn().mockReturnValue(true);

      // Verify each note loads correctly
      for (const note of notes) {
        const { result } = renderHook(() =>
          useNoteContent(note.date, repository, hasNoteForDate),
        );

        await waitFor(() => expect(result.current.isContentReady).toBe(true));
        expect(result.current.content).toBe(note.content);
        expect(result.current.isOfflineStub).toBe(false);
      }
    });
  });

  describe("switching between modes", () => {
    it("note created in local mode is not accessible with different cloud key", async () => {
      // Create note with local repository
      const localSetup = await setupLocalRepository();
      const testDate = "05-01-2025";
      const testContent = "Note created locally";

      await localSetup.repository.save(testDate, testContent);

      // Now create a cloud repository with a DIFFERENT key
      // (simulating what happens when user logs in with different account)
      const cloudSetup = await setupCloudRepository();

      // When switching accounts, hasNoteForDate wouldn't know about notes
      // encrypted with a different key - they're effectively invisible
      const hasNoteForDate = jest.fn().mockReturnValue(false);

      const { result } = renderHook(() =>
        useNoteContent(testDate, cloudSetup.repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));

      // Note exists in IDB but can't be decrypted with cloud key
      // Since hasNoteForDate returns false, this is treated as an empty note
      expect(result.current.content).toBe("");
      expect(result.current.isOfflineStub).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles rapid online/offline toggles", async () => {
      const { repository } = await setupCloudRepository();
      const testDate = "05-01-2025";
      const testContent = "Content for rapid toggle test";

      await repository.save(testDate, testContent);
      await setRemoteDatesForYear(2025, [testDate]);

      const hasNoteForDate = jest.fn().mockReturnValue(true);

      const { result, rerender } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));

      // Rapid toggles
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          mockOnline = i % 2 === 0;
          rerender();
        });
      }

      // Wait for everything to settle
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // Content should still be correct
      await waitFor(() => {
        expect(result.current.isContentReady).toBe(true);
      });
      expect(result.current.content).toBe(testContent);
    });

    it("handles note with empty content correctly", async () => {
      const { repository } = await setupCloudRepository();
      const testDate = "05-01-2025";

      // Don't save anything - note doesn't exist
      mockOnline = false;

      // hasNoteForDate returns false because no note exists
      const hasNoteForDate = jest.fn().mockReturnValue(false);

      const { result } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));

      // Should be empty and ready for editing, not an offline stub
      expect(result.current.content).toBe("");
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("does not show offline stub for deleted note while online", async () => {
      const { repository } = await setupLocalRepository();
      const testDate = "05-01-2025";

      await repository.save(testDate, "Temporary content");
      await repository.delete(testDate);

      mockOnline = true;
      const hasNoteForDate = jest.fn().mockReturnValue(true);

      const { result } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));

      expect(result.current.content).toBe("");
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("handles opening note that exists in hasNoteForDate but not in IDB", async () => {
      const { repository } = await setupCloudRepository();
      const testDate = "05-01-2025";

      // hasNoteForDate says note exists, but it's not in IDB or remote index
      mockOnline = false;
      const hasNoteForDate = jest.fn().mockReturnValue(true);

      const { result } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));

      // This triggers the offline stub via hasNoteForDate check
      expect(result.current.isOfflineStub).toBe(true);
      expect(result.current.content).toBe("");
    });

    it("loads note correctly when starting offline then going online", async () => {
      const { repository } = await setupCloudRepository();
      const testDate = "05-01-2025";
      const testContent = "Pre-cached content";

      // Save note while we can (we'll test with mockOnline = true initially for save)
      await repository.save(testDate, testContent);
      await setRemoteDatesForYear(2025, [testDate]);

      // Start offline
      mockOnline = false;
      const hasNoteForDate = jest.fn().mockReturnValue(true);

      const { result, rerender } = renderHook(() =>
        useNoteContent(testDate, repository, hasNoteForDate),
      );

      await waitFor(() => expect(result.current.isContentReady).toBe(true));
      expect(result.current.content).toBe(testContent);

      // Go online
      await act(async () => {
        mockOnline = true;
        rerender();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(() => expect(result.current.isContentReady).toBe(true));

      // Content should still be there
      expect(result.current.content).toBe(testContent);
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("handles null repository gracefully", async () => {
      const hasNoteForDate = jest.fn().mockReturnValue(false);

      const { result } = renderHook(() =>
        useNoteContent("05-01-2025", null, hasNoteForDate),
      );

      // Should reset to idle state
      expect(result.current.content).toBe("");
      expect(result.current.isContentReady).toBe(false);
      expect(result.current.isOfflineStub).toBe(false);
    });

    it("handles null date gracefully", async () => {
      const { repository } = await setupLocalRepository();
      const hasNoteForDate = jest.fn().mockReturnValue(false);

      const { result } = renderHook(() =>
        useNoteContent(null, repository, hasNoteForDate),
      );

      // Should reset to idle state
      expect(result.current.content).toBe("");
      expect(result.current.isContentReady).toBe(false);
      expect(result.current.isOfflineStub).toBe(false);
    });
  });
});
