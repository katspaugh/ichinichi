type ErrorListener = (context: string, error: unknown) => void;

const listeners = new Set<ErrorListener>();

/**
 * Report a non-fatal error. Logs in dev; notifies listeners in all modes.
 * Use this instead of empty catch blocks so errors are observable.
 */
export function reportError(context: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, error);
  }
  for (const listener of listeners) {
    try {
      listener(context, error);
    } catch {
      // Listener threw — swallow to avoid infinite recursion.
    }
  }
}

export function onError(listener: ErrorListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
