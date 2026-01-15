import type { SyncError } from "../errors";
import type { Result } from "../result";

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

export interface RemoteNotesGateway {
  fetchNoteByDate(
    date: string,
  ): Promise<Result<RemoteNote | null, SyncError>>;
  fetchNoteDates(year?: number): Promise<Result<string[], SyncError>>;
  fetchNotesSince(
    cursor: string | null,
  ): Promise<Result<RemoteNote[], SyncError>>;
  pushNote(note: RemoteNotePayload): Promise<Result<RemoteNote, SyncError>>;
  deleteNote(
    options: { id?: string | null; date: string },
  ): Promise<Result<void, SyncError>>;
}
