import type { SupabaseClient } from "@supabase/supabase-js";
import { base64ToBytes } from "./cryptoUtils";
import { deleteImageRecords, storeImageAndMeta } from "./unifiedImageStore";
import type { ImageMetaRecord } from "./unifiedDb";
import { getAllImageEnvelopeStates } from "./unifiedImageEnvelopeRepository";

const IMAGE_BUCKET = "note-images";

function buildStoragePath(
  userId: string,
  noteDate: string,
  imageId: string,
  suffix: string,
): string {
  return `${userId}/${noteDate}/${imageId}${suffix}`;
}

function ciphertextToBlob(ciphertext: string): Blob {
  const bytes = base64ToBytes(ciphertext);
  return new Blob([bytes], { type: "application/octet-stream" });
}

async function upsertImageMetadata(
  supabase: SupabaseClient,
  userId: string,
  meta: ImageMetaRecord,
  nonce: string,
  keyId: string,
  ciphertextPath: string,
): Promise<{ serverUpdatedAt: string }> {
  const payload = {
    id: meta.id,
    user_id: userId,
    note_date: meta.noteDate,
    type: meta.type,
    filename: meta.filename,
    mime_type: meta.mimeType,
    width: meta.width,
    height: meta.height,
    size: meta.size,
    ciphertext_path: ciphertextPath,
    storage_path: ciphertextPath,
    sha256: meta.sha256,
    nonce,
    key_id: keyId,
    deleted: false,
  };

  const { data, error } = await supabase
    .from("note_images")
    .upsert(payload)
    .select("server_updated_at")
    .single();

  if (error) throw error;
  return {
    serverUpdatedAt: String(
      (data as { server_updated_at: string }).server_updated_at,
    ),
  };
}

async function markImageDeleted(
  supabase: SupabaseClient,
  imageId: string,
): Promise<void> {
  const { error } = await supabase
    .from("note_images")
    .update({ deleted: true })
    .eq("id", imageId);

  if (error) throw error;
}

export async function syncEncryptedImages(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const states = await getAllImageEnvelopeStates();

  for (const state of states) {
    const meta = state.meta;
    if (!meta?.pendingOp) continue;

    if (meta.pendingOp === "delete") {
      if (meta.remotePath) {
        await supabase.storage.from(IMAGE_BUCKET).remove([meta.remotePath]);
      }
      await markImageDeleted(supabase, meta.id);
      await deleteImageRecords(meta.id);
      continue;
    }

    const envelope = state.envelope;
    if (!envelope) continue;

    const ciphertextPath = buildStoragePath(
      userId,
      meta.noteDate,
      meta.id,
      ".enc",
    );
    const blob = ciphertextToBlob(envelope.ciphertext);

    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(ciphertextPath, blob, {
        upsert: true,
        contentType: "application/octet-stream",
      });

    if (uploadError) throw uploadError;

    const { serverUpdatedAt } = await upsertImageMetadata(
      supabase,
      userId,
      meta,
      envelope.nonce,
      envelope.keyId,
      ciphertextPath,
    );

    const record = state.record;
    if (!record) continue;

    await storeImageAndMeta(record, {
      ...meta,
      remotePath: ciphertextPath,
      serverUpdatedAt,
      pendingOp: null,
    });
  }
}
