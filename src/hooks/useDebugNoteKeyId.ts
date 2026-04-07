import { useDebugMode } from "./useDebugMode";

/**
 * Returns the key ID used to encrypt a note.
 * With RxDB, notes are stored in plaintext locally and encrypted only
 * during replication, so there is no per-note keyId to display.
 */
export function useDebugNoteKeyId(
  _date: string,
  _isContentReady: boolean,
): string | null {
  const [isDebug] = useDebugMode();
  return isDebug ? "(rxdb-local)" : null;
}
