import { replicateRxCollection } from "rxdb/plugins/replication";
import type { RxReplicationState } from "rxdb/plugins/replication";
import type { RxReplicationWriteToMasterRow, WithDeleted } from "rxdb";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Subject } from "rxjs";
import type { RxReplicationPullStreamItem } from "rxdb";
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
    const parsed = parseSupabaseNoteRow(row);
    if (!parsed) {
      reportError("replication.pull", { type: "ParseError", message: "Invalid Supabase note row" });
      return { date: (row as unknown as Record<string, unknown>).date as string ?? "", content: "", updatedAt: "", isDeleted: true, weather: null };
    }

    // The replication plugin may strip _modified and updated_at from the row
    const updatedAt = row.updated_at || new Date().toISOString();

    if (row._deleted) {
      return {
        date: row.date,
        content: "",
        updatedAt,
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
        updatedAt,
        isDeleted: false,
        weather: null,
      };
    }

    const { content, weather } = result.value;

    return {
      date: row.date,
      content,
      updatedAt,
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
  notes: RxReplicationState<NoteDocType, SupabaseCheckpoint>;
  images: RxReplicationState<ImageDocType, SupabaseCheckpoint> | null;
  cancel(): void;
}

interface SupabaseCheckpoint {
  id: string;
  modified: string;
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

// Postgres unique-violation error code
const POSTGRES_CONFLICT_CODE = "23505";

/**
 * Starts Supabase replication for notes and optionally images.
 * Uses the generic replicateRxCollection with custom push/pull handlers
 * because the RxDB schema (plaintext) differs from the Supabase table schema
 * (encrypted columns like ciphertext/nonce/key_id instead of content/weather).
 * The Supabase-specific replication plugin assumes schema fields = column names,
 * which breaks with E2EE.
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

  // --- Notes replication ---
  const notesPullStream$ = new Subject<RxReplicationPullStreamItem<NoteDocType, SupabaseCheckpoint>>();

  const notesReplication = replicateRxCollection<NoteDocType, SupabaseCheckpoint>({
    replicationIdentifier: `notes-supabase-${userId}`,
    collection: db.notes,
    deletedField: "isDeleted",
    pull: {
      async handler(lastCheckpoint, batchSize) {
        let query = supabase.from("notes").select("*");

        if (lastCheckpoint) {
          const { modified, id } = lastCheckpoint;
          query = query.or(
            `_modified.gt.${modified},and(_modified.eq.${modified},date.gt.${id})`,
          );
        }

        query = query
          .order("_modified", { ascending: true })
          .order("date", { ascending: true })
          .limit(batchSize);

        const { data, error } = await query;
        if (error) throw error;

        const rows = (data ?? []) as SupabaseNoteRow[];
        const lastRow = rows[rows.length - 1];
        const checkpoint = lastRow
          ? { id: lastRow.date, modified: lastRow._modified }
          : undefined;

        const docs = await Promise.all(
          rows.map(async (row) => {
            const doc = await pullModifier(row);
            return { ...doc, _deleted: doc.isDeleted } as WithDeleted<NoteDocType>;
          }),
        );

        return { documents: docs, checkpoint };
      },
      batchSize: 100,
      stream$: notesPullStream$.asObservable(),
    },
    push: {
      async handler(rows: RxReplicationWriteToMasterRow<NoteDocType>[]) {
        const conflicts: WithDeleted<NoteDocType>[] = [];

        await Promise.all(
          rows.map(async (row) => {
            const supabaseRow = await pushModifier({
              ...row.newDocumentState,
              isDeleted: (row.newDocumentState as WithDeleted<NoteDocType>)._deleted,
            });
            // Include user_id for RLS and NOT NULL constraint
            const rowWithUser = { ...supabaseRow, user_id: userId };

            if (!row.assumedMasterState) {
              // New document: INSERT
              const { error } = await supabase
                .from("notes")
                .insert(rowWithUser);

              if (error && error.code === POSTGRES_CONFLICT_CODE) {
                // Conflict: fetch current server state
                const conflict = await fetchNoteById(supabase, supabaseRow.date, pullModifier);
                if (conflict) conflicts.push(conflict);
              } else if (error) {
                throw error;
              }
            } else {
              // Existing document: UPDATE with optimistic concurrency
              const assumedRow = await pushModifier({
                ...row.assumedMasterState,
                isDeleted: (row.assumedMasterState as WithDeleted<NoteDocType>)._deleted,
              });

              const { data, error } = await supabase
                .from("notes")
                .update(rowWithUser)
                .eq("date", supabaseRow.date)
                .eq("_modified", assumedRow._modified)
                .select();

              if (error) throw error;

              if (!data || data.length === 0) {
                // No match = conflict
                const conflict = await fetchNoteById(supabase, supabaseRow.date, pullModifier);
                if (conflict) conflicts.push(conflict);
              }
            }
          }),
        );

        return conflicts;
      },
    },
  });

  // Realtime subscription for live pull
  const notesSub = supabase
    .channel("realtime:notes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notes" },
      async (payload) => {
        if (payload.eventType === "DELETE") return;
        const row = payload.new as SupabaseNoteRow;
        const doc = await pullModifier(row);
        notesPullStream$.next({
          checkpoint: { id: row.date, modified: row._modified },
          documents: [{ ...doc, _deleted: doc.isDeleted } as WithDeleted<NoteDocType>],
        });
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        notesPullStream$.next("RESYNC");
      }
    });

  // --- Image replication (metadata + blob side-effects) ---
  let imagesReplication: RxReplicationState<ImageDocType, SupabaseCheckpoint> | null = null;
  let imagesSub: ReturnType<typeof supabase.channel> | null = null;

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

    const imagesPullStream$ = new Subject<RxReplicationPullStreamItem<ImageDocType, SupabaseCheckpoint>>();

    imagesReplication = replicateRxCollection<ImageDocType, SupabaseCheckpoint>({
      replicationIdentifier: `images-supabase-${userId}`,
      collection: db.images,
      deletedField: "isDeleted",
      pull: {
        async handler(lastCheckpoint, batchSize) {
          let query = supabase.from("note_images").select("*");

          if (lastCheckpoint) {
            const { modified, id } = lastCheckpoint;
            query = query.or(
              `_modified.gt.${modified},and(_modified.eq.${modified},id.gt.${id})`,
            );
          }

          query = query
            .order("_modified", { ascending: true })
            .order("id", { ascending: true })
            .limit(batchSize);

          const { data, error } = await query;
          if (error) throw error;

          const rows = (data ?? []) as SupabaseImageRow[];
          const lastRow = rows[rows.length - 1];
          const checkpoint = lastRow
            ? { id: lastRow.id, modified: lastRow._modified }
            : undefined;

          const docs = await Promise.all(
            rows.map(async (row) => {
              const { doc, blob } = await imgPull(row);
              if (blob) {
                pendingBlobs.set(doc.id, { blob, mimeType: doc.mimeType });
              }
              return { ...doc, _deleted: doc.isDeleted } as WithDeleted<ImageDocType>;
            }),
          );

          return { documents: docs, checkpoint };
        },
        batchSize: 50,
        stream$: imagesPullStream$.asObservable(),
      },
      push: {
        async handler(rows: RxReplicationWriteToMasterRow<ImageDocType>[]) {
          const conflicts: WithDeleted<ImageDocType>[] = [];

          await Promise.all(
            rows.map(async (row) => {
              const imageDoc = {
                ...row.newDocumentState,
                isDeleted: (row.newDocumentState as WithDeleted<ImageDocType>)._deleted,
              };
              const rxDoc = await db.images.findOne(imageDoc.id).exec();
              const attachment = rxDoc?.getAttachment("blob");
              const blob = attachment ? await attachment.getData() : new Blob();
              const supabaseRow = await imgPush(imageDoc, blob);
              // Include user_id for RLS and NOT NULL constraint
              const rowWithUser = { ...supabaseRow, user_id: userId };

              if (!row.assumedMasterState) {
                const { error } = await supabase
                  .from("note_images")
                  .insert(rowWithUser);

                if (error && error.code === POSTGRES_CONFLICT_CODE) {
                  const conflict = await fetchImageById(supabase, supabaseRow.id, imgPull);
                  if (conflict) conflicts.push(conflict);
                } else if (error) {
                  throw error;
                }
              } else {
                const { data, error } = await supabase
                  .from("note_images")
                  .update(rowWithUser)
                  .eq("id", supabaseRow.id)
                  .select();

                if (error) throw error;

                if (!data || data.length === 0) {
                  const conflict = await fetchImageById(supabase, supabaseRow.id, imgPull);
                  if (conflict) conflicts.push(conflict);
                }
              }
            }),
          );

          return conflicts;
        },
      },
    });

    // Realtime for images
    imagesSub = supabase
      .channel("realtime:note_images")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "note_images" },
        async (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as SupabaseImageRow;
          const { doc, blob } = await imgPull(row);
          if (blob) {
            pendingBlobs.set(doc.id, { blob, mimeType: doc.mimeType });
          }
          imagesPullStream$.next({
            checkpoint: { id: row.id, modified: row._modified },
            documents: [{ ...doc, _deleted: doc.isDeleted } as WithDeleted<ImageDocType>],
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          imagesPullStream$.next("RESYNC");
        }
      });
  }

  return {
    notes: notesReplication,
    images: imagesReplication,
    cancel() {
      void notesReplication.cancel();
      notesSub.unsubscribe();
      if (imagesReplication) {
        void imagesReplication.cancel();
      }
      if (imagesSub) {
        imagesSub.unsubscribe();
      }
      imageHookActive = false;
      pendingBlobs.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchNoteById(
  supabase: SupabaseClient,
  date: string,
  pullModifier: (row: SupabaseNoteRow) => Promise<NoteDocType>,
): Promise<WithDeleted<NoteDocType> | null> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("date", date)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const doc = await pullModifier(data[0] as SupabaseNoteRow);
  return { ...doc, _deleted: doc.isDeleted } as WithDeleted<NoteDocType>;
}

async function fetchImageById(
  supabase: SupabaseClient,
  id: string,
  imgPull: (row: SupabaseImageRow) => Promise<{ doc: ImageDocType; blob: Blob | null }>,
): Promise<WithDeleted<ImageDocType> | null> {
  const { data, error } = await supabase
    .from("note_images")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const { doc } = await imgPull(data[0] as SupabaseImageRow);
  return { ...doc, _deleted: doc.isDeleted } as WithDeleted<ImageDocType>;
}
