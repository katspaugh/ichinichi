/**
 * Runtime validation for external data (IndexedDB, Supabase, localStorage JSON,
 * decrypted payloads). Every `as TypeName` on untrusted data should be replaced
 * with a parse function that validates shape and returns `T | null`.
 */

import type { CachedNoteRecord, CachedImageMeta } from "./cache";

// ── Helpers ─────────────────────────────────────────────────────────

export function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// ── Cache Records ────────────────────────────────────────────────────

export function parseCachedNoteRecord(data: unknown): CachedNoteRecord | null {
  if (!isObject(data)) return null;
  if (
    typeof data.date !== "string" ||
    typeof data.ciphertext !== "string" ||
    typeof data.nonce !== "string" ||
    typeof data.keyId !== "string" ||
    typeof data.updatedAt !== "string" ||
    typeof data.revision !== "number"
  )
    return null;
  return data as unknown as CachedNoteRecord;
}

export function parseCachedImageMeta(data: unknown): CachedImageMeta | null {
  if (!isObject(data)) return null;
  if (
    typeof data.id !== "string" ||
    typeof data.noteDate !== "string" ||
    typeof data.filename !== "string" ||
    typeof data.mimeType !== "string" ||
    typeof data.sha256 !== "string"
  )
    return null;
  return data as unknown as CachedImageMeta;
}

// ── Remote Notes (Supabase) ─────────────────────────────────────────

export interface RemoteNoteRow {
  id: string;
  user_id: string;
  date: string;
  ciphertext: string;
  nonce: string;
  key_id: string;
  revision: number;
  updated_at: string;
  server_updated_at: string;
  deleted: boolean;
}

export function parseRemoteNoteRow(data: unknown): RemoteNoteRow | null {
  if (!isObject(data)) return null;
  if (
    typeof data.id !== "string" ||
    typeof data.user_id !== "string" ||
    typeof data.date !== "string" ||
    typeof data.ciphertext !== "string" ||
    typeof data.nonce !== "string" ||
    typeof data.revision !== "number" ||
    typeof data.updated_at !== "string" ||
    typeof data.server_updated_at !== "string" ||
    typeof data.deleted !== "boolean"
  )
    return null;
  // key_id may be missing on legacy rows
  if (data.key_id !== undefined && typeof data.key_id !== "string") return null;
  return data as unknown as RemoteNoteRow;
}

// ── Decrypted Note Payload ──────────────────────────────────────────

export function parseDecryptedNotePayload(
  data: unknown,
): { content: string } | null {
  if (!isObject(data)) return null;
  if (typeof data.content !== "string") return null;
  return data as { content: string };
}

// ── IDB Key Arrays ──────────────────────────────────────────────────

export function parseStringArray(data: unknown): string[] | null {
  if (!Array.isArray(data)) return null;
  for (const item of data) {
    if (typeof item !== "string") return null;
  }
  return data as string[];
}
