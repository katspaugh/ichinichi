import type { CryptoError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";

function toCryptoError(error: unknown, fallback: CryptoError["type"]): CryptoError {
  if (error instanceof Error) {
    return { type: fallback, message: error.message };
  }
  return { type: fallback, message: "Crypto operation failed." };
}

export async function safeEncrypt<T>(
  fn: () => Promise<T>,
): Promise<Result<T, CryptoError>> {
  try {
    return ok(await fn());
  } catch (error) {
    return err(toCryptoError(error, "EncryptFailed"));
  }
}

export async function safeDecrypt<T>(
  fn: () => Promise<T>,
): Promise<Result<T, CryptoError>> {
  try {
    return ok(await fn());
  } catch (error) {
    return err(toCryptoError(error, "DecryptFailed"));
  }
}
