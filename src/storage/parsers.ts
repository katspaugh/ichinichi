/**
 * Runtime validation for external data (IndexedDB, Supabase, localStorage JSON,
 * decrypted payloads). Every `as TypeName` on untrusted data should be replaced
 * with a parse function that validates shape and returns `T | null`.
 */

import type { VaultMeta } from "./vault";
// Inlined from legacy domain/notes/noteRecord (module deleted)
export interface NoteRecord {
  version: 1;
  date: string;
  keyId: string;
  ciphertext: string;
  nonce: string;
  updatedAt: string;
}

export interface NoteMetaRecord {
  date: string;
  revision: number;
  serverRevision?: number;
  remoteId?: string | null;
  serverUpdatedAt?: string | null;
  lastSyncedAt?: string | null;
  pendingOp?: "upsert" | "delete" | null;
  deletedAt?: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!isObject(v)) return false;
  for (const val of Object.values(v)) {
    if (typeof val !== "string") return false;
  }
  return true;
}

// ── Vault ───────────────────────────────────────────────────────────

function isWrappedKey(v: unknown): v is { iv: string; data: string } {
  return isObject(v) && typeof v.iv === "string" && typeof v.data === "string";
}

export function parseVaultMeta(data: unknown): VaultMeta | null {
  if (!isObject(data)) return null;
  if (data.version !== 1) return null;

  const kdf = data.kdf;
  if (
    !isObject(kdf) ||
    typeof kdf.salt !== "string" ||
    typeof kdf.iterations !== "number"
  )
    return null;

  const wrapped = data.wrapped;
  if (!isObject(wrapped) || !isWrappedKey(wrapped.password)) return null;
  if (wrapped.device !== undefined && !isWrappedKey(wrapped.device))
    return null;

  // Validated above — safe to assert.
  return data as unknown as VaultMeta;
}

// ── Keyring ─────────────────────────────────────────────────────────

export interface KeyringEntry {
  wrappedDek: string;
  dekIv: string;
}

export type KeyringStore = Record<string, KeyringEntry>;

function isKeyringEntry(v: unknown): v is KeyringEntry {
  return (
    isObject(v) &&
    typeof v.wrappedDek === "string" &&
    typeof v.dekIv === "string"
  );
}

export function parseKeyringStore(data: unknown): KeyringStore | null {
  if (!isObject(data)) return null;
  for (const val of Object.values(data)) {
    if (!isKeyringEntry(val)) return null;
  }
  return data as KeyringStore;
}

// ── Account Store ───────────────────────────────────────────────────

export function parseUserAccountMap(
  data: unknown,
): Record<string, string> | null {
  return isStringRecord(data) ? data : null;
}

// ── Cloud DEK Cache ─────────────────────────────────────────────────

export interface CloudDekCachePayload {
  iv: string;
  data: string;
}

export function parseCloudDekCachePayload(
  data: unknown,
): CloudDekCachePayload | null {
  if (!isObject(data)) return null;
  if (typeof data.iv !== "string" || typeof data.data !== "string") return null;
  return data as unknown as CloudDekCachePayload;
}

// ── Cloud Key ID Cache ──────────────────────────────────────────────

export type CloudKeyIdStore = Record<string, string[]>;

export function parseCloudKeyIdStore(data: unknown): CloudKeyIdStore | null {
  if (!isObject(data)) return null;
  for (const val of Object.values(data)) {
    if (!Array.isArray(val) || val.some((item) => typeof item !== "string"))
      return null;
  }
  return data as CloudKeyIdStore;
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

// ── IDB Note Records ────────────────────────────────────────────────

export function parseNoteRecord(data: unknown): NoteRecord | null {
  if (!isObject(data)) return null;
  if (
    data.version !== 1 ||
    typeof data.date !== "string" ||
    typeof data.keyId !== "string" ||
    typeof data.ciphertext !== "string" ||
    typeof data.nonce !== "string" ||
    typeof data.updatedAt !== "string"
  )
    return null;
  return data as unknown as NoteRecord;
}

export function parseNoteMetaRecord(data: unknown): NoteMetaRecord | null {
  if (!isObject(data)) return null;
  if (typeof data.date !== "string" || typeof data.revision !== "number")
    return null;
  return data as unknown as NoteMetaRecord;
}

// ── Decrypted Note Payload ──────────────────────────────────────────

export function parseDecryptedNotePayload(
  data: unknown,
): { content: string } | null {
  if (!isObject(data)) return null;
  if (typeof data.content !== "string") return null;
  return data as { content: string };
}

// ── Saved Weather ──────────────────────────────────────────────────

import type { SavedWeather } from "../types/index";

export function parseSavedWeather(data: unknown): SavedWeather | null {
  if (!isObject(data)) return null;
  if (
    typeof data.icon !== "string" ||
    typeof data.temperatureHigh !== "number" ||
    typeof data.temperatureLow !== "number" ||
    typeof data.unit !== "string" ||
    typeof data.city !== "string"
  ) return null;
  if (data.unit !== "C" && data.unit !== "F") return null;
  return data as unknown as SavedWeather;
}

// ── Encrypted Blob Record (from storage bucket) ────────────────────

export interface EncryptedBlobRecord {
  keyId?: string | null;
  ciphertext: string;
  nonce: string;
}

export function parseEncryptedBlobRecord(data: unknown): EncryptedBlobRecord | null {
  if (!isObject(data)) return null;
  if (typeof data.ciphertext !== "string" || typeof data.nonce !== "string") return null;
  if (data.keyId !== undefined && data.keyId !== null && typeof data.keyId !== "string") return null;
  return data as unknown as EncryptedBlobRecord;
}

// ── Supabase Replication Rows ───────────────────────────────────────

import type { SupabaseNoteRow, SupabaseImageRow } from "./rxdb/replication";

export function parseSupabaseNoteRow(data: unknown): SupabaseNoteRow | null {
  if (!isObject(data)) return null;
  if (
    typeof data.date !== "string" ||
    typeof data.ciphertext !== "string" ||
    typeof data.nonce !== "string" ||
    typeof data.key_id !== "string" ||
    typeof data.updated_at !== "string" ||
    typeof data._modified !== "string" ||
    typeof data._deleted !== "boolean"
  )
    return null;
  return data as unknown as SupabaseNoteRow;
}

export function parseSupabaseImageRow(data: unknown): SupabaseImageRow | null {
  if (!isObject(data)) return null;
  if (
    typeof data.id !== "string" ||
    typeof data.note_date !== "string" ||
    typeof data.type !== "string" ||
    typeof data.filename !== "string" ||
    typeof data.mime_type !== "string" ||
    typeof data.width !== "number" ||
    typeof data.height !== "number" ||
    typeof data.size !== "number" ||
    typeof data.created_at !== "string" ||
    typeof data.key_id !== "string" ||
    typeof data.nonce !== "string" ||
    typeof data.sha256 !== "string" ||
    typeof data._modified !== "string" ||
    typeof data._deleted !== "boolean"
  )
    return null;
  return data as unknown as SupabaseImageRow;
}

// ── IDB Key Arrays ──────────────────────────────────────────────────

export function parseStringArray(data: unknown): string[] | null {
  if (!Array.isArray(data)) return null;
  for (const item of data) {
    if (typeof item !== "string") return null;
  }
  return data as string[];
}
