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
    let encRecord: { keyId?: string | null; ciphertext: string; nonce: string };
    try {
      const text = await downloadResult.value.text();
      encRecord = JSON.parse(text) as typeof encRecord;
    } catch {
      reportError("imageReplication.pull: failed to parse encrypted record", {
        type: "Corrupt",
        message: "Could not parse encrypted blob JSON",
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

export interface ReplicationHandle {
  notes: RxSupabaseReplicationState<NoteDocType>;
  cancel(): void;
}

/**
 * Starts Supabase replication for the notes collection with E2EE push/pull modifiers.
 */
export function startReplication(
  db: AppDatabase,
  supabase: SupabaseClient,
  crypto: ReplicationCrypto,
  userId: string,
): ReplicationHandle {
  const pushModifier = createPushModifier(crypto);
  const pullModifier = createPullModifier(crypto);

  const notesReplication = replicateSupabase<NoteDocType>({
    replicationIdentifier: `notes-supabase-${userId}`,
    collection: db.notes,
    client: supabase,
    tableName: "notes",
    pull: {
      // modifier receives any (raw Supabase row) and returns WithDeleted<NoteDocType>
      modifier: (row: SupabaseNoteRow) =>
        pullModifier(row).then((doc) => ({ ...doc, _deleted: doc.isDeleted })),
    },
    push: {
      // modifier receives WithDeleted<NoteDocType> and returns the encrypted Supabase row
      modifier: (doc: NoteDocType & { _deleted: boolean }) =>
        pushModifier({ ...doc, isDeleted: doc._deleted }),
    },
  });

  return {
    notes: notesReplication,
    cancel() {
      void notesReplication.cancel();
    },
  };
}
