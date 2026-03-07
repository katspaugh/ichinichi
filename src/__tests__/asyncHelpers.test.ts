// @vitest-environment jsdom
import { createCancellableOperation } from "../utils/asyncHelpers";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createCancellableOperation", () => {
  it("resolves with the operation result", async () => {
    const { promise } = createCancellableOperation(async () => "hello");
    await expect(promise).resolves.toBe("hello");
  });

  it("passes signal to the operation", async () => {
    let receivedSignal: AbortSignal | null = null;
    const { promise } = createCancellableOperation(async (signal) => {
      receivedSignal = signal;
      return 42;
    });
    await promise;
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal!.aborted).toBe(false);
  });

  it("cancel() aborts the signal", () => {
    const { cancel, signal } = createCancellableOperation(
      () => new Promise(() => {}), // never resolves
    );

    expect(signal.aborted).toBe(false);
    cancel();
    expect(signal.aborted).toBe(true);
  });

  it("aborts on timeout", async () => {
    const onTimeout = vi.fn();
    const { signal } = createCancellableOperation(
      () => new Promise(() => {}),
      { timeoutMs: 5000, onTimeout },
    );

    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(5000);

    expect(signal.aborted).toBe(true);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("uses default 30s timeout when not specified", () => {
    const onTimeout = vi.fn();
    const { signal } = createCancellableOperation(
      () => new Promise(() => {}),
      { onTimeout },
    );

    // Not yet expired at 29s
    vi.advanceTimersByTime(29000);
    expect(signal.aborted).toBe(false);

    // Expires at 30s
    vi.advanceTimersByTime(1000);
    expect(signal.aborted).toBe(true);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("clears timeout when operation completes before timeout", async () => {
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { promise } = createCancellableOperation(async () => "done", {
      timeoutMs: 10000,
    });

    await promise;

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("clears timeout even when operation throws", async () => {
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { promise } = createCancellableOperation(
      async () => {
        throw new Error("fail");
      },
      { timeoutMs: 10000 },
    );

    await expect(promise).rejects.toThrow("fail");
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("no timeout is set when timeoutMs is 0", () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const callCountBefore = setTimeoutSpy.mock.calls.length;

    createCancellableOperation(() => new Promise(() => {}), {
      timeoutMs: 0,
    });

    // setTimeout should not have been called for our operation
    // (there's no additional setTimeout call beyond what was already there)
    expect(setTimeoutSpy.mock.calls.length).toBe(callCountBefore);
    setTimeoutSpy.mockRestore();
  });

  it("returns signal, promise, and cancel function", () => {
    const result = createCancellableOperation(async () => 1);
    expect(result).toHaveProperty("promise");
    expect(result).toHaveProperty("cancel");
    expect(result).toHaveProperty("signal");
    expect(typeof result.cancel).toBe("function");
    expect(result.signal).toBeInstanceOf(AbortSignal);
  });
});
