import type { SupabaseClient } from "@supabase/supabase-js";

export class RevisionConflictError extends Error {
  code = "REVISION_CONFLICT";
  constructor() {
    super("Revision conflict");
  }
}

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

export interface RemoteNote {
  id: string;
  date: string;
  ciphertext: string;
  nonce: string;
  keyId: string;
  revision: number;
  updatedAt: string;
  serverUpdatedAt: string;
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

export async function fetchRemoteNoteByDate(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<RemoteNote | null> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapRemoteRow(data as RemoteNoteRow);
}

export async function fetchRemoteNoteDates(
  supabase: SupabaseClient,
  userId: string,
  year?: number,
): Promise<string[]> {
  let query = supabase
    .from("notes")
    .select("date")
    .eq("user_id", userId)
    .eq("deleted", false);

  if (typeof year === "number") {
    query = query.eq("note_year", year);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => String((row as { date: string }).date));
}

export async function fetchRemoteNotesSince(
  supabase: SupabaseClient,
  userId: string,
  cursor: string | null,
): Promise<RemoteNote[]> {
  let query = supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .order("server_updated_at", { ascending: true });

  if (cursor) {
    query = query.gt("server_updated_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRemoteRow(row as RemoteNoteRow));
}

export interface RemoteNotePayload {
  id?: string | null;
  date: string;
  ciphertext: string;
  nonce: string;
  keyId: string;
  revision: number;
  updatedAt: string;
  serverUpdatedAt?: string | null;
  deleted: boolean;
}

export async function pushRemoteNote(
  supabase: SupabaseClient,
  userId: string,
  note: RemoteNotePayload,
): Promise<RemoteNote> {
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
      if ("status" in error && error.status === 404) {
        throw new RevisionConflictError();
      }
      if ("code" in error && error.code === "PGRST116") {
        throw new RevisionConflictError();
      }
      throw error;
    }
    if (!data) throw new RevisionConflictError();
    return mapRemoteRow(data as RemoteNoteRow);
  }

  const { data, error } = await supabase
    .from("notes")
    .insert(payload)
    .select()
    .single();

  if (error) {
    if ("code" in error && error.code === "23505") {
      throw new RevisionConflictError();
    }
    if ("status" in error && error.status === 404) {
      throw new RevisionConflictError();
    }
    if ("code" in error && error.code === "PGRST116") {
      throw new RevisionConflictError();
    }
    throw error;
  }
  return mapRemoteRow(data as RemoteNoteRow);
}

export async function deleteRemoteNote(
  supabase: SupabaseClient,
  userId: string,
  options: { id?: string | null; date: string },
): Promise<void> {
  let query = supabase
    .from("notes")
    .update({ deleted: true })
    .eq("user_id", userId)
    .eq("date", options.date);

  if (options.id) {
    query = query.eq("id", options.id);
  }

  const { error } = await query;
  if (error) throw error;
}
