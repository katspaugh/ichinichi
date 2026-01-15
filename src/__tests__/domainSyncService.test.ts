import {
  getPendingOpsSummary,
  hasPendingOps,
  createSyncService,
} from "../domain/sync/syncService";
import type { SyncError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import type {
  PendingOpsSource,
  PendingOpsSummary,
} from "../domain/sync/pendingOpsSource";
import { SyncStatus } from "../types";

function createMockPendingOpsSource(
  summary: PendingOpsSummary,
): PendingOpsSource {
  return {
    getSummary: jest.fn().mockResolvedValue(summary),
    hasPending: jest.fn().mockResolvedValue(summary.total > 0),
  };
}

describe("getPendingOpsSummary", () => {
  it("returns summary from pendingOpsSource", async () => {
    const expectedSummary = { notes: 2, images: 3, total: 5 };
    const source = createMockPendingOpsSource(expectedSummary);

    const summary = await getPendingOpsSummary(source);

    expect(summary).toEqual(expectedSummary);
    expect(source.getSummary).toHaveBeenCalledTimes(1);
  });

  it("returns zero counts when no pending ops", async () => {
    const source = createMockPendingOpsSource({ notes: 0, images: 0, total: 0 });

    const summary = await getPendingOpsSummary(source);

    expect(summary).toEqual({ notes: 0, images: 0, total: 0 });
  });
});

describe("hasPendingOps", () => {
  it("returns false when no pending ops", async () => {
    const source = createMockPendingOpsSource({ notes: 0, images: 0, total: 0 });

    expect(await hasPendingOps(source)).toBe(false);
  });

  it("returns true when pending ops exist", async () => {
    const source = createMockPendingOpsSource({ notes: 1, images: 0, total: 1 });

    expect(await hasPendingOps(source)).toBe(true);
  });
});

describe("createSyncService", () => {
  function createMockRepository() {
    return {
      sync: jest.fn<Promise<Result<SyncStatus, SyncError>>, []>(),
    };
  }

  it("calls repository.sync when syncNow is invoked", async () => {
    const repository = createMockRepository();
    const pendingOpsSource = createMockPendingOpsSource({
      notes: 0,
      images: 0,
      total: 0,
    });
    repository.sync.mockResolvedValue(ok(SyncStatus.Synced));

    const service = createSyncService(repository as never, pendingOpsSource);
    await service.syncNow();

    expect(repository.sync).toHaveBeenCalledTimes(1);
  });

  it("calls onSyncStart callback before sync", async () => {
    const repository = createMockRepository();
    const pendingOpsSource = createMockPendingOpsSource({
      notes: 0,
      images: 0,
      total: 0,
    });
    const onSyncStart = jest.fn();
    let syncStartedBeforeResolve = false;

    repository.sync.mockImplementation(async () => {
      syncStartedBeforeResolve = onSyncStart.mock.calls.length > 0;
      return ok(SyncStatus.Synced);
    });

    const service = createSyncService(repository as never, pendingOpsSource, {
      onSyncStart,
    });
    await service.syncNow();

    expect(onSyncStart).toHaveBeenCalledTimes(1);
    expect(syncStartedBeforeResolve).toBe(true);
  });

  it("calls onSyncComplete callback with status after sync", async () => {
    const repository = createMockRepository();
    const pendingOpsSource = createMockPendingOpsSource({
      notes: 0,
      images: 0,
      total: 0,
    });
    const onSyncComplete = jest.fn();
    repository.sync.mockResolvedValue(ok(SyncStatus.Synced));

    const service = createSyncService(repository as never, pendingOpsSource, {
      onSyncComplete,
    });
    await service.syncNow();

    expect(onSyncComplete).toHaveBeenCalledTimes(1);
    expect(onSyncComplete).toHaveBeenCalledWith(SyncStatus.Synced);
  });

  it("calls onSyncError callback when sync returns error", async () => {
    const repository = createMockRepository();
    const pendingOpsSource = createMockPendingOpsSource({
      notes: 0,
      images: 0,
      total: 0,
    });
    const onSyncError = jest.fn();
    const error = { type: "RemoteRejected", message: "Sync failed" } as const;
    repository.sync.mockResolvedValue(err(error));

    const service = createSyncService(repository as never, pendingOpsSource, {
      onSyncError,
    });
    await service.syncNow();

    expect(onSyncError).toHaveBeenCalledTimes(1);
    expect(onSyncError).toHaveBeenCalledWith(error);
  });

  it("queues sync requests while sync is in progress", async () => {
    const repository = createMockRepository();
    const pendingOpsSource = createMockPendingOpsSource({
      notes: 0,
      images: 0,
      total: 0,
    });
    let resolveFirst: () => void;
    const firstSyncPromise = new Promise<void>((r) => {
      resolveFirst = r;
    });

    let syncCount = 0;
    repository.sync.mockImplementation(async () => {
      syncCount++;
      if (syncCount === 1) {
        await firstSyncPromise;
      }
      return ok(SyncStatus.Synced);
    });

    const service = createSyncService(repository as never, pendingOpsSource);

    const firstCall = service.syncNow();
    service.syncNow(); // Queue second call

    // Only one sync should be running initially
    expect(repository.sync).toHaveBeenCalledTimes(1);

    // Resolve first sync - should trigger queued sync
    resolveFirst!();
    await firstCall;

    // Queued sync should have run
    expect(repository.sync).toHaveBeenCalledTimes(2);
  });

  it("runs queued sync after current sync completes", async () => {
    const repository = createMockRepository();
    const pendingOpsSource = createMockPendingOpsSource({
      notes: 0,
      images: 0,
      total: 0,
    });
    const onSyncComplete = jest.fn();
    let resolveFirst: () => void;

    repository.sync.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        resolveFirst = r;
      });
      return ok(SyncStatus.Synced);
    });
    repository.sync.mockResolvedValue(ok(SyncStatus.Synced));

    const service = createSyncService(repository as never, pendingOpsSource, {
      onSyncComplete,
    });

    const firstCall = service.syncNow();
    service.syncNow(); // Queue another

    resolveFirst!();
    await firstCall;

    expect(onSyncComplete).toHaveBeenCalledTimes(2);
  });

  it("stops sync loop when error occurs", async () => {
    const repository = createMockRepository();
    const pendingOpsSource = createMockPendingOpsSource({
      notes: 0,
      images: 0,
      total: 0,
    });
    const onSyncError = jest.fn();
    let resolveFirst: () => void;

    repository.sync.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        resolveFirst = r;
      });
      return err({ type: "RemoteRejected", message: "First sync failed" });
    });
    repository.sync.mockResolvedValue(ok(SyncStatus.Synced));

    const service = createSyncService(repository as never, pendingOpsSource, {
      onSyncError,
    });

    const firstCall = service.syncNow();
    service.syncNow(); // Queue another

    resolveFirst!();
    await firstCall;

    // Error should stop the loop, queued sync should not run
    expect(onSyncError).toHaveBeenCalledTimes(1);
    expect(repository.sync).toHaveBeenCalledTimes(1);
  });

  it("allows new sync after previous completes", async () => {
    const repository = createMockRepository();
    const pendingOpsSource = createMockPendingOpsSource({
      notes: 0,
      images: 0,
      total: 0,
    });
    repository.sync.mockResolvedValue(ok(SyncStatus.Synced));

    const service = createSyncService(repository as never, pendingOpsSource);

    await service.syncNow();
    await service.syncNow();

    expect(repository.sync).toHaveBeenCalledTimes(2);
  });

  it("dispose clears queued flag", async () => {
    const repository = createMockRepository();
    const pendingOpsSource = createMockPendingOpsSource({
      notes: 0,
      images: 0,
      total: 0,
    });
    let resolveFirst: () => void;

    repository.sync.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        resolveFirst = r;
      });
      return ok(SyncStatus.Synced);
    });
    repository.sync.mockResolvedValue(ok(SyncStatus.Synced));

    const service = createSyncService(repository as never, pendingOpsSource);

    const firstCall = service.syncNow();
    service.syncNow(); // Queue another
    service.dispose(); // Clear queue

    resolveFirst!();
    await firstCall;

    // Queued sync should not run because dispose cleared it
    expect(repository.sync).toHaveBeenCalledTimes(1);
  });
});
