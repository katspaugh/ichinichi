import { replicateRxCollection, RxReplicationState } from "rxdb/plugins/replication";
import type { RxReplicationWriteToMasterRow, WithDeleted } from "rxdb";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Subject } from "rxjs";
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

    const ciphertextBlob = new Blob([JSON.stringify(record)], {
      type: "application/octet-stream",
    });

    const uploadPath = `${userId}/${doc.noteDate}/${doc.id}.enc`;
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
      id: parsed.id,
      noteDate: parsed.note_date,
      type: parsed.type,
      filename: parsed.filename,
      mimeType: parsed.mime_type,
      width: parsed.width,
      height: parsed.height,
      size: parsed.size,
      createdAt: parsed.created_at,
      isDeleted: parsed._deleted,
    };

    if (parsed._deleted) {
      return { doc, blob: null };
    }

    const downloadPath = `${userId}/${parsed.note_date}/${parsed.id}.enc`;
    const downloadResult = await bucket.download(downloadPath);
    if (!downloadResult.ok) {
      reportError("imageReplication.pull: bucket download failed", {
        type: "Unknown",
        message: downloadResult.error,
      });
      return { doc, blob: null };
    }

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
      { keyId: parsed.key_id, ciphertext: encRecord.ciphertext, nonce: encRecord.nonce },
      parsed.mime_type,
    );

    if (!decryptResult.ok) {
      reportError("imageReplication.pull: decryption failed", decryptResult.error);
      return { doc, blob: null };
    }

    return { doc, blob: decryptResult.value };
  };
}

/**
 * Adapts an E2eeService into the ImageReplicationCrypto interface.
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

/**
 * Creates a RemoteBlobFetcher that downloads encrypted blobs from Supabase
 * storage and decrypts them for local display.
 */
export function createRemoteBlobFetcher(
  supabase: SupabaseClient,
  crypto: ImageReplicationCrypto,
  userId: string,
): import("./imageRepository").RemoteBlobFetcher {
  const bucket = createSupabaseBucket(supabase);
  return {
    async fetch(imageId: string, noteDate: string, mimeType: string): Promise<Blob | null> {
      const path = `${userId}/${noteDate}/${imageId}.enc`;
      const downloadResult = await bucket.download(path);
      if (!downloadResult.ok) {
        reportError("remoteBlobFetcher.fetch: download failed", downloadResult.error);
        return null;
      }

      let encRecord;
      try {
        const text = await downloadResult.value.text();
        encRecord = parseEncryptedBlobRecord(JSON.parse(text));
      } catch {
        reportError("remoteBlobFetcher.fetch: parse failed", "Could not parse encrypted blob JSON");
        return null;
      }
      if (!encRecord) return null;

      const decryptResult = await crypto.decryptBlob(encRecord, mimeType);
      if (!decryptResult.ok) {
        reportError("remoteBlobFetcher.fetch: decrypt failed", decryptResult.error);
        return null;
      }
      return decryptResult.value;
    },
  };
}

export interface ReplicationHandle {
  notes: RxReplicationState<NoteDocType, ReplicationCheckpoint>;
  images: RxReplicationState<ImageDocType, ReplicationCheckpoint> | null;
  cancel(): void;
}

interface ReplicationCheckpoint {
  id: string;
  modified: string;
}

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

// ---------------------------------------------------------------------------
// Custom pull/push handlers — bypasses replicateSupabase's addDocEqualityToQuery
// which assumes schema field names match Supabase column names (broken by E2EE).
// ---------------------------------------------------------------------------

function createNotesPullHandler(
  supabase: SupabaseClient,
  pullMod: (row: SupabaseNoteRow) => Promise<NoteDocType>,
) {
  return async (checkpoint: ReplicationCheckpoint | undefined, batchSize: number) => {
    let query = supabase.from("notes").select("*");
    if (checkpoint) {
      query = query.or(
        `_modified.gt.${checkpoint.modified},and(_modified.eq.${checkpoint.modified},date.gt.${checkpoint.id})`,
      );
    }
    query = query.order("_modified", { ascending: true }).order("date", { ascending: true }).limit(batchSize);

    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
    const documents: WithDeleted<NoteDocType>[] = await Promise.all(
      rows.map(async (r: Record<string, unknown>) => {
        const doc = await pullMod(r as unknown as SupabaseNoteRow);
        return { ...doc, _deleted: doc.isDeleted };
      }),
    );
    return {
      documents,
      checkpoint: last ? { id: last.date as string, modified: last._modified as string } : undefined,
    };
  };
}

function createNotesPushHandler(
  supabase: SupabaseClient,
  pushMod: (doc: NoteDocType) => Promise<SupabaseNoteRow>,
  pullMod: (row: SupabaseNoteRow) => Promise<NoteDocType>,
  userId: string,
) {
  async function fetchConflict(date: string): Promise<WithDeleted<NoteDocType> | null> {
    const { data, error } = await supabase.from("notes").select("*").eq("date", date).limit(1);
    if (error || !data || data.length === 0) return null;
    const doc = await pullMod(data[0] as unknown as SupabaseNoteRow);
    return { ...doc, _deleted: doc.isDeleted };
  }

  return async (rows: RxReplicationWriteToMasterRow<NoteDocType>[]): Promise<WithDeleted<NoteDocType>[]> => {
    const conflicts: WithDeleted<NoteDocType>[] = [];
    await Promise.all(rows.map(async (row) => {
      const supaRow: Record<string, unknown> = { ...(await pushMod(row.newDocumentState)), user_id: userId };
      delete supaRow._modified;

      if (!row.assumedMasterState) {
        const { error } = await supabase.from("notes").insert(supaRow);
        if (error) {
          if (error.code === "23505") {
            const c = await fetchConflict(supaRow.date as string);
            if (c) conflicts.push(c);
          } else { throw error; }
        }
      } else {
        const assumed = await pushMod(row.assumedMasterState);
        const { data, error } = await supabase.from("notes")
          .update(supaRow)
          .eq("date", supaRow.date as string)
          .eq("user_id", userId)
          .eq("ciphertext", assumed.ciphertext)
          .eq("nonce", assumed.nonce)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) {
          const c = await fetchConflict(supaRow.date as string);
          if (c) conflicts.push(c);
        }
      }
    }));
    return conflicts;
  };
}

function createImagesPullHandler(
  supabase: SupabaseClient,
  imgPull: (row: SupabaseImageRow) => Promise<{ doc: ImageDocType; blob: Blob | null }>,
  pendingBlobs: Map<string, { blob: Blob; mimeType: string }>,
) {
  return async (checkpoint: ReplicationCheckpoint | undefined, batchSize: number) => {
    let query = supabase.from("note_images").select("*");
    if (checkpoint) {
      query = query.or(
        `_modified.gt.${checkpoint.modified},and(_modified.eq.${checkpoint.modified},id.gt.${checkpoint.id})`,
      );
    }
    query = query.order("_modified", { ascending: true }).order("id", { ascending: true }).limit(batchSize);

    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
    const documents: WithDeleted<ImageDocType>[] = await Promise.all(
      rows.map(async (r: Record<string, unknown>) => {
        const { doc, blob } = await imgPull(r as unknown as SupabaseImageRow);
        if (blob) pendingBlobs.set(doc.id, { blob, mimeType: doc.mimeType });
        return { ...doc, _deleted: doc.isDeleted };
      }),
    );
    return {
      documents,
      checkpoint: last ? { id: last.id as string, modified: last._modified as string } : undefined,
    };
  };
}

function createImagesPushHandler(
  supabase: SupabaseClient,
  db: AppDatabase,
  imgPush: (doc: ImageDocType, blob: Blob) => Promise<SupabaseImageRow>,
  userId: string,
) {
  async function fetchConflict(id: string): Promise<WithDeleted<ImageDocType> | null> {
    const { data, error } = await supabase.from("note_images").select("*").eq("id", id).limit(1);
    if (error || !data || data.length === 0) return null;
    const r = data[0];
    const doc: ImageDocType = {
      id: r.id, noteDate: r.note_date, type: r.type, filename: r.filename,
      mimeType: r.mime_type, width: r.width, height: r.height, size: r.size,
      createdAt: r.created_at, isDeleted: r._deleted,
    };
    return { ...doc, _deleted: doc.isDeleted };
  }

  return async (rows: RxReplicationWriteToMasterRow<ImageDocType>[]): Promise<WithDeleted<ImageDocType>[]> => {
    const conflicts: WithDeleted<ImageDocType>[] = [];
    await Promise.all(rows.map(async (row) => {
      const imageDoc = row.newDocumentState;
      const rxDoc = await db.images.findOne(imageDoc.id).exec();
      const attachment = rxDoc?.getAttachment("blob");
      const blob = attachment ? await attachment.getData() : new Blob();
      const supaRow: Record<string, unknown> = { ...(await imgPush(imageDoc, blob)), user_id: userId };
      delete supaRow._modified;

      if (!row.assumedMasterState) {
        const { error } = await supabase.from("note_images").insert(supaRow);
        if (error) {
          if (error.code === "23505") {
            const c = await fetchConflict(supaRow.id as string);
            if (c) conflicts.push(c);
          } else { throw error; }
        }
      } else {
        const { data, error } = await supabase.from("note_images")
          .update(supaRow).eq("id", supaRow.id as string).eq("user_id", userId).select();
        if (error) throw error;
        if (!data || data.length === 0) {
          const c = await fetchConflict(supaRow.id as string);
          if (c) conflicts.push(c);
        }
      }
    }));
    return conflicts;
  };
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

function setupRealtime<DocType>(
  supabase: SupabaseClient,
  tableName: string,
  primaryKey: string,
  repl: RxReplicationState<DocType, ReplicationCheckpoint>,
  toDoc: (row: Record<string, unknown>) => Promise<WithDeleted<DocType>>,
) {
  return supabase
    .channel(`realtime:${tableName}`)
    .on("postgres_changes", { event: "*", schema: "public", table: tableName }, (payload) => {
      if (payload.eventType === "DELETE") return;
      const row = payload.new as Record<string, unknown>;
      void toDoc(row).then((doc) => {
        repl.emitEvent({
          checkpoint: { id: row[primaryKey] as string, modified: row._modified as string },
          documents: [doc],
        });
      });
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") repl.emitEvent("RESYNC");
    });
}

/**
 * Starts Supabase replication for notes and optionally images.
 *
 * Uses replicateRxCollection with custom handlers instead of replicateSupabase
 * because the Supabase plugin's addDocEqualityToQuery builds WHERE clauses from
 * RxDB schema property names (content, updatedAt, isDeleted) that don't match
 * the Supabase column names (ciphertext, updated_at, _deleted). With E2EE the
 * column/schema mismatch is unavoidable, and conflict documents from the push
 * handler bypass the pull modifier — leaking ciphertext into local storage if
 * column names match schema fields.
 */
export function startReplication(
  db: AppDatabase,
  supabase: SupabaseClient,
  crypto: ReplicationCrypto,
  userId: string,
  imageCrypto?: ImageReplicationCrypto | null,
): ReplicationHandle {
  const pushMod = createPushModifier(crypto);
  const pullMod = createPullModifier(crypto);

  const notesReplication = replicateRxCollection<NoteDocType, ReplicationCheckpoint>({
    replicationIdentifier: `notes-supabase-${userId}`,
    collection: db.notes,
    pull: {
      handler: createNotesPullHandler(supabase, pullMod),
      stream$: new Subject<
        { checkpoint: ReplicationCheckpoint; documents: WithDeleted<NoteDocType>[] } | "RESYNC"
      >().asObservable(),
    },
    push: {
      handler: createNotesPushHandler(supabase, pushMod, pullMod, userId),
    },
  });

  const notesSub = setupRealtime(supabase, "notes", "date", notesReplication, async (row) => {
    const doc = await pullMod(row as unknown as SupabaseNoteRow);
    return { ...doc, _deleted: doc.isDeleted };
  });

  // --- Image replication ---
  let imagesReplication: RxReplicationState<ImageDocType, ReplicationCheckpoint> | null = null;
  let imagesSub: { unsubscribe(): void } | null = null;
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
        await rxDoc.putAttachment({ id: "blob", data: entry.blob, type: entry.mimeType });
      } catch (attachErr) {
        reportError("imageReplication.pull: attachment store failed", attachErr);
      }
    }, false);

    imagesReplication = replicateRxCollection<ImageDocType, ReplicationCheckpoint>({
      replicationIdentifier: `images-supabase-${userId}`,
      collection: db.images,
      pull: {
        handler: createImagesPullHandler(supabase, imgPull, pendingBlobs),
        stream$: new Subject<
          { checkpoint: ReplicationCheckpoint; documents: WithDeleted<ImageDocType>[] } | "RESYNC"
        >().asObservable(),
      },
      push: {
        handler: createImagesPushHandler(supabase, db, imgPush, userId),
      },
    });

    imagesSub = setupRealtime(supabase, "note_images", "id", imagesReplication, async (row) => {
      const { doc, blob } = await imgPull(row as unknown as SupabaseImageRow);
      if (blob) pendingBlobs.set(doc.id, { blob, mimeType: doc.mimeType });
      return { ...doc, _deleted: doc.isDeleted };
    });
  }

  return {
    notes: notesReplication,
    images: imagesReplication,
    cancel() {
      void notesReplication.cancel();
      notesSub.unsubscribe();
      if (imagesReplication) void imagesReplication.cancel();
      if (imagesSub) imagesSub.unsubscribe();
      imageHookActive = false;
      pendingBlobs.clear();
    },
  };
}
