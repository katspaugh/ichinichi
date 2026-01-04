import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncedNote } from '../types';
import { bytesToBase64, base64ToBytes, encodeUtf8, decodeUtf8, randomBytes } from './cryptoUtils';
import { sanitizeHtml } from '../utils/sanitize';

const NOTE_IV_BYTES = 12;

export class RevisionConflictError extends Error {
  code = 'REVISION_CONFLICT';
  constructor() {
    super('Revision conflict');
  }
}

interface RemoteNoteRow {
  id: string;
  user_id: string;
  date: string;
  ciphertext: string;
  nonce: string;
  revision: number;
  updated_at: string;
  server_updated_at: string;
  deleted: boolean;
}

export interface EncryptedRemoteNote {
  id?: string;
  date: string;
  ciphertext: string;
  nonce: string;
  revision: number;
  updatedAt: string;
  serverUpdatedAt?: string;
  deleted: boolean;
}

export async function encryptNote(
  vaultKey: CryptoKey,
  note: SyncedNote
): Promise<{ ciphertext: string; nonce: string }> {
  const iv = randomBytes(NOTE_IV_BYTES);
  const plaintext = encodeUtf8(
    JSON.stringify({
      date: note.date,
      content: note.content,
      updatedAt: note.updatedAt
    })
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    vaultKey,
    plaintext
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    nonce: bytesToBase64(iv)
  };
}

export async function decryptNote(
  vaultKey: CryptoKey,
  encrypted: EncryptedRemoteNote
): Promise<SyncedNote> {
  const iv = base64ToBytes(encrypted.nonce);
  const ciphertext = base64ToBytes(encrypted.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    vaultKey,
    ciphertext
  );
  const parsed = JSON.parse(decodeUtf8(new Uint8Array(decrypted))) as {
    date: string;
    content: string;
    updatedAt: string;
  };
  return {
    id: encrypted.id,
    date: parsed.date,
    content: sanitizeHtml(parsed.content),
    updatedAt: parsed.updatedAt,
    revision: encrypted.revision,
    serverUpdatedAt: encrypted.serverUpdatedAt,
    deleted: encrypted.deleted
  };
}

export async function fetchRemoteNoteByDate(
  supabase: SupabaseClient,
  userId: string,
  date: string
): Promise<EncryptedRemoteNote | null> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;
  const row = data as RemoteNoteRow;
  return {
    id: row.id,
    date: row.date,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    revision: row.revision,
    updatedAt: row.updated_at,
    serverUpdatedAt: row.server_updated_at,
    deleted: row.deleted
  };
}

export async function fetchNoteIndex(
  supabase: SupabaseClient,
  userId: string,
  year?: number
): Promise<string[]> {
  let query = supabase
    .from('note_index')
    .select('date')
    .eq('user_id', userId);

  if (typeof year === 'number') {
    query = query.eq('year', year);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => String((row as { date: string }).date));
}

export async function pushNote(
  supabase: SupabaseClient,
  userId: string,
  note: SyncedNote,
  vaultKey: CryptoKey
): Promise<EncryptedRemoteNote> {
  const { ciphertext, nonce } = await encryptNote(vaultKey, note);

  const payload = {
    user_id: userId,
    date: note.date,
    ciphertext,
    nonce,
    revision: note.revision,
    updated_at: note.updatedAt,
    deleted: note.deleted ?? false
  };

  if (note.id) {
    // Update existing note
    let query = supabase
      .from('notes')
      .update(payload)
      .eq('id', note.id)
      .eq('user_id', userId);

    if (note.serverUpdatedAt) {
      query = query.eq('server_updated_at', note.serverUpdatedAt);
    } else {
      query = query.is('server_updated_at', null);
    }

    const { data, error } = await query
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new RevisionConflictError();
    const row = data as RemoteNoteRow;
    return {
      id: row.id,
      date: row.date,
      ciphertext: row.ciphertext,
      nonce: row.nonce,
      revision: row.revision,
      updatedAt: row.updated_at,
      serverUpdatedAt: row.server_updated_at,
      deleted: row.deleted
    };
  } else {
    // Insert new note
    const { data, error } = await supabase
      .from('notes')
      .insert(payload)
      .select()
      .single();

    if (error) {
      if ('code' in error && error.code === '23505') {
        throw new RevisionConflictError();
      }
      throw error;
    }
    const row = data as RemoteNoteRow;
    return {
      id: row.id,
      date: row.date,
      ciphertext: row.ciphertext,
      nonce: row.nonce,
      revision: row.revision,
      updatedAt: row.updated_at,
      serverUpdatedAt: row.server_updated_at,
      deleted: row.deleted
    };
  }
}

export async function deleteRemoteNote(
  supabase: SupabaseClient,
  userId: string,
  noteId: string
): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .update({ deleted: true })
    .eq('id', noteId)
    .eq('user_id', userId);

  if (error) throw error;
}

// Last-write-wins conflict resolution
export function resolveConflict(
  local: SyncedNote,
  remote: SyncedNote
): 'local' | 'remote' {
  const localTime = new Date(local.updatedAt).getTime();
  const remoteTime = new Date(remote.updatedAt).getTime();

  if (localTime > remoteTime) {
    return 'local';
  } else if (remoteTime > localTime) {
    return 'remote';
  } else {
    // Same timestamp - higher revision wins
    return local.revision >= remote.revision ? 'local' : 'remote';
  }
}
