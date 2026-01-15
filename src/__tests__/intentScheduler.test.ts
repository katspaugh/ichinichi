import { createSyncIntentScheduler } from "../domain/sync/intentScheduler";
import type { PendingOpsSource } from "../domain/sync/pendingOpsSource";
import type { SyncMachineEvent } from "../domain/sync/stateMachine";

// Helper to flush all pending promises (needed for async timer callbacks)
async function flushPromises(): Promise<void> {
  // Multiple awaits to ensure all microtasks are processed
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("createSyncIntentScheduler", () => {
  const pendingOpsSource: PendingOpsSource = {
    getSummary: jest.fn(),
    hasPending: jest.fn(),
  };

  const mockHasPendingOps = pendingOpsSource.hasPending as jest.MockedFunction<
    PendingOpsSource["hasPending"]
  >;

  beforeEach(() => {
    jest.useFakeTimers();
    mockHasPendingOps.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("requestSync", () => {
    it("dispatches immediately when intent.immediate is true", () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);

      scheduler.requestSync({ immediate: true });

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: "SYNC_REQUESTED",
        intent: { immediate: true },
      });

      scheduler.dispose();
    });

    it("debounces dispatch when intent.immediate is false", () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);

      scheduler.requestSync({ immediate: false });

      expect(dispatch).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1999);
      expect(dispatch).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: "SYNC_REQUESTED",
        intent: { immediate: false },
      });

      scheduler.dispose();
    });

    it("resets debounce timer on subsequent calls", () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);

      scheduler.requestSync({ immediate: false });
      jest.advanceTimersByTime(1500);

      scheduler.requestSync({ immediate: false });
      jest.advanceTimersByTime(1500);

      expect(dispatch).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500);
      expect(dispatch).toHaveBeenCalledTimes(1);

      scheduler.dispose();
    });

    it("immediate request cancels pending debounced request", () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);

      scheduler.requestSync({ immediate: false });
      jest.advanceTimersByTime(1000);

      scheduler.requestSync({ immediate: true });

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: "SYNC_REQUESTED",
        intent: { immediate: true },
      });

      jest.advanceTimersByTime(2000);
      expect(dispatch).toHaveBeenCalledTimes(1);

      scheduler.dispose();
    });
  });

  describe("requestIdleSync", () => {
    it("dispatches sync after idle delay when pending ops exist", async () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);
      mockHasPendingOps.mockResolvedValue(true);

      scheduler.requestIdleSync();

      expect(dispatch).not.toHaveBeenCalled();

      jest.advanceTimersByTime(3999);
      await flushPromises();
      expect(dispatch).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      await flushPromises();

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: "SYNC_REQUESTED",
        intent: { immediate: true },
      });

      scheduler.dispose();
    });

    it("does not dispatch when no pending ops", async () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);
      mockHasPendingOps.mockResolvedValue(false);

      scheduler.requestIdleSync();

      jest.advanceTimersByTime(4000);
      await flushPromises();

      expect(dispatch).not.toHaveBeenCalled();

      scheduler.dispose();
    });

    it("ignores subsequent calls while idle timer is active", async () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);
      mockHasPendingOps.mockResolvedValue(true);

      scheduler.requestIdleSync();
      scheduler.requestIdleSync();
      scheduler.requestIdleSync();

      jest.advanceTimersByTime(4000);
      await flushPromises();

      expect(mockHasPendingOps).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledTimes(1);

      scheduler.dispose();
    });

    it("uses custom delay when provided", async () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);
      mockHasPendingOps.mockResolvedValue(true);

      scheduler.requestIdleSync({ delayMs: 1000 });

      jest.advanceTimersByTime(999);
      await flushPromises();
      expect(dispatch).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      await flushPromises();
      expect(dispatch).toHaveBeenCalledTimes(1);

      scheduler.dispose();
    });

    it("allows new idle sync after previous one completes", async () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);
      mockHasPendingOps.mockResolvedValue(true);

      scheduler.requestIdleSync({ delayMs: 1000 });
      jest.advanceTimersByTime(1000);
      await flushPromises();

      expect(dispatch).toHaveBeenCalledTimes(1);

      scheduler.requestIdleSync({ delayMs: 1000 });
      jest.advanceTimersByTime(1000);
      await flushPromises();

      expect(dispatch).toHaveBeenCalledTimes(2);

      scheduler.dispose();
    });
  });

  describe("dispose", () => {
    it("cancels pending debounced sync", () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);

      scheduler.requestSync({ immediate: false });
      jest.advanceTimersByTime(1000);

      scheduler.dispose();

      jest.advanceTimersByTime(2000);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("cancels pending idle sync", async () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);
      mockHasPendingOps.mockResolvedValue(true);

      scheduler.requestIdleSync();
      jest.advanceTimersByTime(2000);

      scheduler.dispose();

      jest.advanceTimersByTime(3000);
      await flushPromises();

      expect(dispatch).not.toHaveBeenCalled();
    });

    it("cancels both timers simultaneously", async () => {
      const dispatch = jest.fn<void, [SyncMachineEvent]>();
      const scheduler = createSyncIntentScheduler(dispatch, pendingOpsSource);
      mockHasPendingOps.mockResolvedValue(true);

      scheduler.requestSync({ immediate: false });
      scheduler.requestIdleSync();

      scheduler.dispose();

      jest.advanceTimersByTime(5000);
      await flushPromises();

      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
