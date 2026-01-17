export interface CancellableOperationOptions {
  timeoutMs?: number;
  onTimeout?: () => void;
}

const DEFAULT_TIMEOUT_MS = 30000;

export function createCancellableOperation<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: CancellableOperationOptions = {},
): { promise: Promise<T>; cancel: () => void; signal: AbortSignal } {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId =
    timeoutMs > 0
      ? window.setTimeout(() => {
          controller.abort();
          options.onTimeout?.();
        }, timeoutMs)
      : null;

  const promise = (async () => {
    try {
      return await operation(controller.signal);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  })();

  const cancel = () => controller.abort();

  return { promise, cancel, signal: controller.signal };
}
