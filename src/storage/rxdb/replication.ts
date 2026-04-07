import { replicateSupabase } from "rxdb/plugins/replication-supabase";
import type { RxSupabaseReplicationState } from "rxdb/plugins/replication-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppDatabase } from "./database";
import type { NoteDocType } from "./schemas";
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
