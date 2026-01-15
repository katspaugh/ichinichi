import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import type {
  RemoteNote,
  RemoteNotePayload,
  RemoteNotesGateway,
} from "../domain/sync/remoteNotesGateway";

interface RemoteNoteRow {
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

function mapRemoteRow(row: RemoteNoteRow): RemoteNote {
  return {
    id: row.id,
    date: row.date,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    keyId: row.key_id ?? "legacy",
    revision: row.revision,
    updatedAt: row.updated_at,
    serverUpdatedAt: row.server_updated_at,
    deleted: row.deleted,
  };
}

function toSyncError(
  error: unknown,
  fallback: SyncError["type"] = "Unknown",
): SyncError {
  if (error instanceof Error) {
    return { type: fallback, message: error.message };
  }
  return { type: fallback, message: "Remote request failed." };
}

function isConflictError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const record = error as { code?: string; status?: number };
    if (record.code === "23505" || record.code === "PGRST116") {
      return true;
    }
    if (record.status === 404 || record.status === 406 || record.status === 409) {
      return true;
    }
  }
  return false;
}

async function fetchRemoteNoteByDate(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<Result<RemoteNote | null, SyncError>> {
  try {
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();

    if (error) {
      return err(toSyncError(error, "RemoteRejected"));
    }
    if (!data) return ok(null);
    return ok(mapRemoteRow(data as RemoteNoteRow));
  } catch (error) {
    return err(toSyncError(error));
  }
}

async function fetchRemoteNoteDates(
  supabase: SupabaseClient,
  userId: string,
  year?: number,
): Promise<Result<string[], SyncError>> {
  try {
    let query = supabase
      .from("notes")
      .select("date")
      .eq("user_id", userId)
      .eq("deleted", false);

    if (typeof year === "number") {
      query = query.eq("note_year", year);
    }

    const { data, error } = await query;
    if (error) {
      return err(toSyncError(error, "RemoteRejected"));
    }
    return ok((data ?? []).map((row) => String((row as { date: string }).date)));
  } catch (error) {
    return err(toSyncError(error));
  }
}

async function fetchRemoteNotesSince(
  supabase: SupabaseClient,
  userId: string,
  cursor: string | null,
): Promise<Result<RemoteNote[], SyncError>> {
  try {
    let query = supabase
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .order("server_updated_at", { ascending: true });

    if (cursor) {
      query = query.gt("server_updated_at", cursor);
    }

    const { data, error } = await query;
    if (error) {
      return err(toSyncError(error, "RemoteRejected"));
    }
    return ok((data ?? []).map((row) => mapRemoteRow(row as RemoteNoteRow)));
  } catch (error) {
    return err(toSyncError(error));
  }
}

async function pushRemoteNote(
  supabase: SupabaseClient,
  userId: string,
  note: RemoteNotePayload,
): Promise<Result<RemoteNote, SyncError>> {
  const payload = {
    user_id: userId,
    date: note.date,
    ciphertext: note.ciphertext,
    nonce: note.nonce,
    key_id: note.keyId,
    revision: note.revision,
    updated_at: note.updatedAt,
    deleted: note.deleted,
  };

  if (note.id) {
    try {
      let query = supabase
        .from("notes")
        .update(payload)
        .eq("id", note.id)
        .eq("user_id", userId);

      if (note.serverUpdatedAt) {
        query = query.eq("server_updated_at", note.serverUpdatedAt);
      } else {
        query = query.is("server_updated_at", null);
      }

      const { data, error } = await query.select().maybeSingle();
      if (error) {
        if (isConflictError(error)) {
          return err({ type: "Conflict", message: "Revision conflict." });
        }
        return err(toSyncError(error, "RemoteRejected"));
      }
      if (!data) {
        return err({ type: "Conflict", message: "Revision conflict." });
      }
      return ok(mapRemoteRow(data as RemoteNoteRow));
    } catch (error) {
      return err(toSyncError(error));
    }
  }

  try {
    const { data, error } = await supabase
      .from("notes")
      .insert(payload)
      .select()
      .single();

    if (error) {
      if (isConflictError(error)) {
        return err({ type: "Conflict", message: "Revision conflict." });
      }
      return err(toSyncError(error, "RemoteRejected"));
    }
    return ok(mapRemoteRow(data as RemoteNoteRow));
  } catch (error) {
    return err(toSyncError(error));
  }
}

async function deleteRemoteNote(
  supabase: SupabaseClient,
  userId: string,
  options: { id?: string | null; date: string },
): Promise<Result<void, SyncError>> {
  try {
    let query = supabase
      .from("notes")
      .update({ deleted: true })
      .eq("user_id", userId)
      .eq("date", options.date);

    if (options.id) {
      query = query.eq("id", options.id);
    }

    const { error } = await query;
    if (error) {
      return err(toSyncError(error, "RemoteRejected"));
    }
    return ok(undefined);
  } catch (error) {
    return err(toSyncError(error));
  }
}

export function createRemoteNotesGateway(
  supabase: SupabaseClient,
  userId: string,
): RemoteNotesGateway {
  return {
    fetchNoteByDate: (date) => fetchRemoteNoteByDate(supabase, userId, date),
    fetchNoteDates: (year) => fetchRemoteNoteDates(supabase, userId, year),
    fetchNotesSince: (cursor) =>
      fetchRemoteNotesSince(supabase, userId, cursor),
    pushNote: (note) => pushRemoteNote(supabase, userId, note),
    deleteNote: (options) => deleteRemoteNote(supabase, userId, options),
  };
}
