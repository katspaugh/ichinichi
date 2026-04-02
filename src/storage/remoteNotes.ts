import type { SupabaseClient } from "../lib/supabase";
import { parseRemoteNoteRow, type RemoteNoteRow } from "./parsers";

export interface PushNotePayload {
  id: string;
  date: string;
  ciphertext: string;
  nonce: string;
  keyId: string;
  revision: number;
  updatedAt: string;
  deleted?: boolean;
}

export interface RemoteNotes {
  fetchNotesSince(cursor: string | null): Promise<RemoteNoteRow[]>;
  fetchAllNotes(): Promise<RemoteNoteRow[]>;
  pushNote(payload: PushNotePayload): Promise<RemoteNoteRow>;
  deleteNote(id: string, revision: number): Promise<void>;
  fetchNoteDates(year?: number): Promise<string[]>;
}

export function createRemoteNotes(
  supabase: SupabaseClient,
  userId: string,
): RemoteNotes {
  return {
    async fetchNotesSince(cursor) {
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

      return (data as unknown[]).map(parseRemoteNoteRow).filter(
        (row): row is RemoteNoteRow => row !== null,
      );
    },

    fetchAllNotes() {
      return this.fetchNotesSince(null);
    },

    async pushNote(payload) {
      const { data, error } = await supabase.rpc("push_note", {
        p_id: payload.id,
        p_user_id: userId,
        p_date: payload.date,
        p_key_id: payload.keyId,
        p_ciphertext: payload.ciphertext,
        p_nonce: payload.nonce,
        p_revision: payload.revision,
        p_updated_at: payload.updatedAt,
        p_deleted: payload.deleted ?? false,
      });

      if (error) {
        if (error.code === "P0002" || error.code === "23505") {
          throw new Error("Conflict: note was modified on another device");
        }
        throw error;
      }

      const row = parseRemoteNoteRow(data);
      if (!row) throw new Error("Invalid response from push_note");
      return row;
    },

    async deleteNote(id, revision) {
      const { error } = await supabase.rpc("delete_note", {
        p_id: id,
        p_user_id: userId,
        p_revision: revision,
      });

      if (error) {
        if (error.code === "P0002") {
          throw new Error("Conflict: note was modified on another device");
        }
        throw error;
      }
    },

    async fetchNoteDates(year?) {
      let query = supabase
        .from("notes")
        .select("date")
        .eq("user_id", userId)
        .eq("deleted", false);

      if (year !== undefined) {
        query = query.eq("note_year", year);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data as Array<{ date: string }>).map((row) => row.date);
    },
  };
}
