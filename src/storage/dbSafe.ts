import type { StorageError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";

function toStorageError(error: unknown): StorageError {
  if (error instanceof Error) {
    return { type: "IO", message: error.message };
  }
  return { type: "Unknown", message: "Storage operation failed." };
}

export async function safeDb<T>(
  fn: () => Promise<T>,
): Promise<Result<T, StorageError>> {
  try {
    return ok(await fn());
  } catch (error) {
    return err(toStorageError(error));
  }
}
