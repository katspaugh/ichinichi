import { replicateSupabase } from "rxdb/plugins/replication-supabase";
import type { RxSupabaseReplicationState } from "rxdb/plugins/replication-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppDatabase } from "./database";
import type { NoteDocType, ImageDocType } from "./schemas";
import type { EncryptedNote } from "../../domain/crypto/noteCrypto";
import type { NotePayload } from "../../domain/crypto/e2eeService";
import type { CryptoError } from "../../domain/errors";
import type { Result } from "../../domain/result";
import { reportError } from "../../utils/errorReporter";
import { parseEncryptedBlobRecord, parseSupabaseNoteRow, parseSupabaseImageRow } from "../parsers";

export interface ReplicationCrypto {
  encrypt(payload: NotePayload): Promise<Result<EncryptedNote, CryptoError>>;
  decrypt(record: {
    keyId?: string | null;
    ciphertext: string;
    nonce: string;
  }): Promise<Result<NotePayload, CryptoError>>;
}

export interface SupabaseNoteRow {
  date: string;
  key_id: string;
  ciphertext: string;
  nonce: string;
  updated_at: string;
  _modified: string;
  _deleted: boolean;
}

/**
 * Creates a push modifier that encrypts note content before pushing to Supabase.
 * Returns a function from NoteDocType to a Supabase row shape.
 */
export function createPushModifier(
  crypto: ReplicationCrypto,
): (doc: NoteDocType) => Promise<SupabaseNoteRow> {
  return async (doc: NoteDocType): Promise<SupabaseNoteRow> => {
    const payload: NotePayload = {
      content: doc.content,
      weather: doc.weather ?? null,
    };

    const result = await crypto.encrypt(payload);
    if (!result.ok) {
      throw new Error(
        `replication.push: encryption failed: ${result.error.message}`,
      );
    }

    const { ciphertext, nonce, keyId } = result.value;

    return {
      date: doc.date,
      key_id: keyId,
      ciphertext,
      nonce,
      updated_at: doc.updatedAt,
      _modified: new Date().toISOString(),
      _deleted: doc.isDeleted,
    };
  };
}

/**
 * Creates a pull modifier that decrypts Supabase rows after pulling.
 * Returns a function from Supabase row to NoteDocType.
 */
export function createPullModifier(
  crypto: ReplicationCrypto,
): (row: SupabaseNoteRow) => Promise<NoteDocType> {
  return async (row: SupabaseNoteRow): Promise<NoteDocType> => {
    console.log("[rxdb-pull] raw row:", JSON.stringify(row));
    const parsed = parseSupabaseNoteRow(row);
    if (!parsed) {
      console.warn("[rxdb-pull] parseSupabaseNoteRow FAILED for:", JSON.stringify(row));
      reportError("replication.pull", { type: "ParseError", message: "Invalid Supabase note row" });
      return { date: (row as unknown as Record<string, unknown>).date as string ?? "", content: "", updatedAt: "", isDeleted: true, weather: null };
    }

    if (row._deleted) {
      return {
        date: row.date,
        content: "",
        updatedAt: row.updated_at,
        isDeleted: true,
        weather: null,
      };
    }

    const result = await crypto.decrypt({
      keyId: row.key_id,
      ciphertext: row.ciphertext,
      nonce: row.nonce,
    });

    if (!result.ok) {
      reportError("replication.pull", result.error);
      return {
        date: row.date,
        content: "",
        updatedAt: row.updated_at,
        isDeleted: false,
        weather: null,
      };
    }

    const { content, weather } = result.value;

    return {
      date: row.date,
      content,
      updatedAt: row.updated_at,
      isDeleted: false,
      weather: weather ?? null,
    };
  };
}

// ---------------------------------------------------------------------------
// Image replication interfaces
// ---------------------------------------------------------------------------

export interface ImageReplicationCrypto {
  encryptBlob(blob: Blob): Promise<Result<{
    record: { version: 1; id: string; keyId: string; ciphertext: string; nonce: string };
    sha256: string;
    size: number;
    keyId: string;
  }, CryptoError>>;
  decryptBlob(
    record: { keyId?: string | null; ciphertext: string; nonce: string },
    mimeType: string,
  ): Promise<Result<Blob, CryptoError>>;
}

export interface StorageBucket {
  upload(path: string, blob: Blob): Promise<Result<string, string>>;
  download(path: string): Promise<Result<Blob, string>>;
}

export interface SupabaseImageRow {
  id: string;
  note_date: string;
  type: "background" | "inline";
  filename: string;
  mime_type: string;
  width: number;
  height: number;
  size: number;
  created_at: string;
  key_id: string;
  nonce: string;
  sha256: string;
  _modified: string;
  _deleted: boolean;
}

/**
 * Creates a push modifier that encrypts an image blob and uploads the ciphertext
 * to a storage bucket, returning a Supabase image row.
 */
export function createImagePushModifier(
  crypto: ImageReplicationCrypto,
  bucket: StorageBucket,
  userId: string,
): (doc: ImageDocType, blob: Blob) => Promise<SupabaseImageRow> {
  return async (doc: ImageDocType, blob: Blob): Promise<SupabaseImageRow> => {
    const encResult = await crypto.encryptBlob(blob);
    if (!encResult.ok) {
      throw new Error(
        `imageReplication.push: encryption failed: ${encResult.error.message}`,
      );
    }

    const { record, sha256, keyId } = encResult.value;

    // Serialise the encrypted record as a blob to upload
    const ciphertextBlob = new Blob([JSON.stringify(record)], {
      type: "application/octet-stream",
    });

    const uploadPath = `${userId}/${doc.id}`;
    const uploadResult = await bucket.upload(uploadPath, ciphertextBlob);
    if (!uploadResult.ok) {
      throw new Error(
        `imageReplication.push: bucket upload failed: ${uploadResult.error}`,
      );
    }

    return {
      id: doc.id,
      note_date: doc.noteDate,
      type: doc.type,
      filename: doc.filename,
      mime_type: doc.mimeType,
      width: doc.width,
      height: doc.height,
      size: doc.size,
      created_at: doc.createdAt,
      key_id: keyId,
      nonce: record.nonce,
      sha256,
      _modified: new Date().toISOString(),
      _deleted: doc.isDeleted,
    };
  };
}

/**
 * Creates a pull modifier that downloads an encrypted image blob from the bucket
 * and decrypts it, returning both the ImageDocType and the decrypted Blob.
 */
export function createImagePullModifier(
  crypto: ImageReplicationCrypto,
  bucket: StorageBucket,
  userId: string,
): (row: SupabaseImageRow) => Promise<{ doc: ImageDocType; blob: Blob | null }> {
  return async (
    row: SupabaseImageRow,
  ): Promise<{ doc: ImageDocType; blob: Blob | null }> => {
    const parsed = parseSupabaseImageRow(row);
    if (!parsed) {
      reportError("imageReplication.pull", { type: "ParseError", message: "Invalid Supabase image row" });
      return {
        doc: {
          id: (row as unknown as Record<string, unknown>).id as string ?? "",
          noteDate: "",
          type: "inline",
          filename: "",
          mimeType: "application/octet-stream",
          width: 0,
          height: 0,
          size: 0,
          createdAt: "",
          isDeleted: true,
        },
        blob: null,
      };
    }

    const doc: ImageDocType = {
      id: row.id,
      noteDate: row.note_date,
      type: row.type,
      filename: row.filename,
      mimeType: row.mime_type,
      width: row.width,
      height: row.height,
      size: row.size,
      createdAt: row.created_at,
      isDeleted: row._deleted,
    };

    if (row._deleted) {
      return { doc, blob: null };
    }

    const downloadPath = `${userId}/${row.id}`;
    const downloadResult = await bucket.download(downloadPath);
    if (!downloadResult.ok) {
      reportError("imageReplication.pull: bucket download failed", {
        type: "Unknown",
        message: downloadResult.error,
      });
      return { doc, blob: null };
    }

    // The stored blob is a JSON-serialised encrypted record
    let encRecord;
    try {
      const text = await downloadResult.value.text();
      encRecord = parseEncryptedBlobRecord(JSON.parse(text));
    } catch {
      reportError("imageReplication.pull: failed to parse encrypted record", {
        type: "Corrupt",
        message: "Could not parse encrypted blob JSON",
      });
      return { doc, blob: null };
    }

    if (!encRecord) {
      reportError("imageReplication.pull: invalid encrypted record shape", {
        type: "Corrupt",
        message: "Encrypted blob record failed validation",
      });
      return { doc, blob: null };
    }

    const decryptResult = await crypto.decryptBlob(
      { keyId: row.key_id, ciphertext: encRecord.ciphertext, nonce: encRecord.nonce },
      row.mime_type,
    );

    if (!decryptResult.ok) {
      reportError("imageReplication.pull: decryption failed", decryptResult.error);
      return { doc, blob: null };
    }

    return { doc, blob: decryptResult.value };
  };
}

/**
 * Adapts an E2eeService (which has encryptImageBlob/decryptImageRecord) into
 * the ImageReplicationCrypto interface expected by image push/pull modifiers.
 */
export function createImageCryptoAdapter(e2ee: {
  encryptImageBlob(blob: Blob): Promise<{
    record: { version: 1; id: string; keyId: string; ciphertext: string; nonce: string };
    sha256: string;
    size: number;
    keyId: string;
  } | null>;
  decryptImageRecord(
    record: { keyId?: string | null; ciphertext: string; nonce: string },
    mimeType: string,
  ): Promise<Blob | null>;
}): ImageReplicationCrypto {
  return {
    async encryptBlob(blob) {
      try {
        const result = await e2ee.encryptImageBlob(blob);
        if (!result) return { ok: false, error: { type: "EncryptFailed" as const, message: "Image encryption returned null" } };
        return { ok: true, value: result };
      } catch (error) {
        return { ok: false, error: { type: "Unknown" as const, message: error instanceof Error ? error.message : "Encryption failed" } };
      }
    },
    async decryptBlob(record, mimeType) {
      try {
        const result = await e2ee.decryptImageRecord(record, mimeType);
        if (!result) return { ok: false, error: { type: "DecryptFailed" as const, message: "Image decryption returned null" } };
        return { ok: true, value: result };
      } catch (error) {
        return { ok: false, error: { type: "Unknown" as const, message: error instanceof Error ? error.message : "Decryption failed" } };
      }
    },
  };
}

export interface ReplicationHandle {
  notes: RxSupabaseReplicationState<NoteDocType>;
  images: RxSupabaseReplicationState<ImageDocType> | null;
  cancel(): void;
}

/**
 * Creates a Supabase storage bucket adapter for image blob upload/download.
 */
function createSupabaseBucket(supabase: SupabaseClient): StorageBucket {
  return {
    async upload(path, blob) {
      const { error } = await supabase.storage
        .from("note-images")
        .upload(path, blob, { upsert: true });
      if (error) return { ok: false, error: error.message };
      return { ok: true, value: path };
    },
    async download(path) {
      const { data, error } = await supabase.storage
        .from("note-images")
        .download(path);
      if (error || !data) return { ok: false, error: error?.message ?? "download failed" };
      return { ok: true, value: data };
    },
  };
}

/**
 * Starts Supabase replication for notes and optionally images.
 * Notes: E2EE push/pull modifiers encrypt/decrypt content.
 * Images: metadata replication with blob upload/download as side-effects.
 */
export function startReplication(
  db: AppDatabase,
  supabase: SupabaseClient,
  crypto: ReplicationCrypto,
  userId: string,
  imageCrypto?: ImageReplicationCrypto | null,
): ReplicationHandle {
  const pushModifier = createPushModifier(crypto);
  const pullModifier = createPullModifier(crypto);

  const notesReplication = replicateSupabase<NoteDocType>({
    replicationIdentifier: `notes-supabase-${userId}`,
    collection: db.notes,
    client: supabase,
    tableName: "notes",
    pull: {
      modifier: (row: SupabaseNoteRow) =>
        pullModifier(row).then((doc) => ({ ...doc, _deleted: doc.isDeleted })),
    },
    push: {
      modifier: (doc: NoteDocType & { _deleted: boolean }) =>
        pushModifier({ ...doc, isDeleted: doc._deleted }),
    },
  });

  // --- Image replication (metadata + blob side-effects) ---
  let imagesReplication: RxSupabaseReplicationState<ImageDocType> | null = null;

  // Pending blobs keyed by image ID. The pull modifier stores blobs here
  // because the document hasn't been written to RxDB yet when the modifier runs.
  // A post-insert hook picks them up once the document exists.
  const pendingBlobs = new Map<string, { blob: Blob; mimeType: string }>();
  let imageHookActive = false;

  if (imageCrypto) {
    const bucket = createSupabaseBucket(supabase);
    const imgPush = createImagePushModifier(imageCrypto, bucket, userId);
    const imgPull = createImagePullModifier(imageCrypto, bucket, userId);

    imageHookActive = true;

    db.images.postInsert(async (plainData, rxDoc) => {
      if (!imageHookActive) return;
      const entry = pendingBlobs.get(plainData.id);
      if (!entry) return;
      pendingBlobs.delete(plainData.id);
      try {
        await rxDoc.putAttachment({
          id: "blob",
          data: entry.blob,
          type: entry.mimeType,
        });
      } catch (attachErr) {
        reportError("imageReplication.pull: attachment store failed", attachErr);
      }
    }, false);

    imagesReplication = replicateSupabase<ImageDocType>({
      replicationIdentifier: `images-supabase-${userId}`,
      collection: db.images,
      client: supabase,
      tableName: "note_images",
      pull: {
        modifier: (row: SupabaseImageRow) =>
          imgPull(row).then(({ doc, blob }) => {
            if (blob) {
              pendingBlobs.set(doc.id, { blob, mimeType: doc.mimeType });
            }
            return { ...doc, _deleted: doc.isDeleted };
          }),
      },
      push: {
        modifier: async (doc: ImageDocType & { _deleted: boolean }) => {
          const imageDoc = { ...doc, isDeleted: doc._deleted };
          const rxDoc = await db.images.findOne(doc.id).exec();
          const attachment = rxDoc?.getAttachment("blob");
          const blob = attachment ? await attachment.getData() : new Blob();
          const row = await imgPush(imageDoc, blob);
          // The replication plugin expects the modifier to return the collection's doc type,
          // but we return a SupabaseImageRow (snake_case) which is what Supabase actually receives.
          // This cast satisfies the type checker while the plugin serializes the actual object.
          return row as unknown as ImageDocType & { _deleted: boolean };
        },
      },
    });
  }

  return {
    notes: notesReplication,
    images: imagesReplication,
    cancel() {
      void notesReplication.cancel();
      if (imagesReplication) {
        void imagesReplication.cancel();
      }
      imageHookActive = false;
      pendingBlobs.clear();
    },
  };
}
