import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoteImage } from "../types";
import { bytesToBase64 } from "./cryptoUtils";
import type { ImageRepository } from "./imageRepository";
import type { ImageMetaRecord, ImageRecord } from "./unifiedDb";
import type { KeyringProvider } from "../domain/crypto/keyring";
import {
  getImageMeta,
  setImageMeta,
  storeImageAndMeta,
} from "./unifiedImageStore";
import { getImageEnvelopeState } from "./unifiedImageEnvelopeRepository";
import { createUnifiedImageRepository } from "./unifiedImageRepository";

const IMAGE_BUCKET = "note-images";

type RemoteImageRow = {
  id: string;
  note_date: string;
  type: "background" | "inline";
  filename: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  size: number | null;
  created_at: string | null;
  sha256: string | null;
  nonce: string | null;
  key_id: string | null;
  ciphertext_path: string | null;
  storage_path: string | null;
  server_updated_at: string | null;
  deleted: boolean | null;
};

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await (blob.arrayBuffer
    ? blob.arrayBuffer()
    : new Response(blob).arrayBuffer());
  return bytesToBase64(new Uint8Array(buffer));
}

function toLocalMeta(
  row: RemoteImageRow,
  keyring: KeyringProvider,
): ImageMetaRecord | null {
  if (!row.note_date || !row.type || !row.filename || !row.mime_type) {
    return null;
  }

  return {
    id: row.id,
    noteDate: row.note_date,
    type: row.type,
    filename: row.filename,
    mimeType: row.mime_type,
    width: row.width ?? 0,
    height: row.height ?? 0,
    size: row.size ?? 0,
    createdAt: row.created_at ?? new Date().toISOString(),
    sha256: row.sha256 ?? "",
    keyId: row.key_id ?? keyring.activeKeyId,
    remotePath: row.ciphertext_path ?? row.storage_path ?? null,
    serverUpdatedAt: row.server_updated_at ?? null,
    pendingOp: null,
  };
}

async function fetchRemoteImageRow(
  supabase: SupabaseClient,
  userId: string,
  imageId: string,
): Promise<RemoteImageRow | null> {
  const { data, error } = await supabase
    .from("note_images")
    .select(
      "id, note_date, type, filename, mime_type, width, height, size, created_at, sha256, nonce, key_id, ciphertext_path, storage_path, server_updated_at, deleted",
    )
    .eq("id", imageId)
    .eq("user_id", userId)
    .single();

  if (error || !data || data.deleted) {
    return null;
  }

  return data as RemoteImageRow;
}

async function ensureLocalImage(
  supabase: SupabaseClient,
  userId: string,
  keyring: KeyringProvider,
  imageId: string,
): Promise<boolean> {
  const state = await getImageEnvelopeState(imageId);

  if (state.record && state.meta) {
    return true;
  }

  if (state.meta?.pendingOp === "delete") {
    return false;
  }

  const row = await fetchRemoteImageRow(supabase, userId, imageId);
  if (!row || !row.nonce) {
    return false;
  }

  const metaRecord = toLocalMeta(row, keyring);
  if (!metaRecord || !metaRecord.remotePath) {
    return false;
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(IMAGE_BUCKET)
    .download(metaRecord.remotePath);

  if (downloadError || !blob) {
    return false;
  }

  const ciphertext = await blobToBase64(blob);
  const imageRecord: ImageRecord = {
    version: 1,
    id: row.id,
    keyId: metaRecord.keyId,
    ciphertext,
    nonce: row.nonce,
  };

  await storeImageAndMeta(imageRecord, metaRecord);
  return true;
}

async function fetchRemoteMetasByDate(
  supabase: SupabaseClient,
  userId: string,
  keyring: KeyringProvider,
  noteDate: string,
): Promise<NoteImage[]> {
  const { data, error } = await supabase
    .from("note_images")
    .select(
      "id, note_date, type, filename, mime_type, width, height, size, created_at, sha256, key_id, ciphertext_path, storage_path, server_updated_at, deleted",
    )
    .eq("user_id", userId)
    .eq("note_date", noteDate);

  if (error || !data) {
    return [];
  }

  const results: NoteImage[] = [];

  for (const row of data as RemoteImageRow[]) {
    if (row.deleted) continue;
    const existing = await getImageMeta(row.id);
    if (!existing || !existing.pendingOp) {
      const metaRecord = toLocalMeta(row, keyring);
      if (metaRecord) {
        await setImageMeta(metaRecord);
      }
    }
    results.push({
      id: row.id,
      noteDate: row.note_date,
      type: row.type,
      filename: row.filename,
      mimeType: row.mime_type,
      width: row.width ?? 0,
      height: row.height ?? 0,
      size: row.size ?? 0,
      createdAt: row.created_at ?? new Date().toISOString(),
    });
  }

  return results;
}

export function createUnifiedSyncedImageRepository(
  supabase: SupabaseClient,
  userId: string,
  keyring: KeyringProvider,
): ImageRepository {
  const localRepo = createUnifiedImageRepository(keyring);

  return {
    upload: localRepo.upload,
    delete: localRepo.delete,
    deleteByNoteDate: localRepo.deleteByNoteDate,
    async get(imageId: string): Promise<Blob | null> {
      const local = await localRepo.get(imageId);
      if (local) return local;
      const hydrated = await ensureLocalImage(
        supabase,
        userId,
        keyring,
        imageId,
      );
      return hydrated ? await localRepo.get(imageId) : null;
    },
    async getUrl(imageId: string): Promise<string | null> {
      void imageId;
      return null;
    },
    async getByNoteDate(noteDate: string): Promise<NoteImage[]> {
      const local = await localRepo.getByNoteDate(noteDate);
      if (local.length) return local;
      return await fetchRemoteMetasByDate(supabase, userId, keyring, noteDate);
    },
  };
}
