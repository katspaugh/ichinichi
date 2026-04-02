import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// DOMPurify requires DOM — not available in Node test env
vi.mock('../utils/sanitize', () => ({
  sanitizeHtml: (html: string) => html,
}));
import { createNoteRepository } from '../storage/noteRepository';
import { setCachedNote, clearAll } from '../storage/cache';
import { generateDEK, computeKeyId, encryptNote } from '../crypto';
import type { RemoteNotes } from '../storage/remoteNotes';

let dek: CryptoKey;
let keyId: string;

const mockRemote: RemoteNotes = {
  fetchNotesSince: vi.fn(),
  fetchAllNotes: vi.fn(),
  pushNote: vi.fn(),
  deleteNote: vi.fn(),
  fetchNoteDates: vi.fn(),
};

const onlineConnectivity = { getOnline: () => true };
const offlineConnectivity = { getOnline: () => false };

beforeEach(async () => {
  dek = await generateDEK();
  keyId = await computeKeyId(dek);
  vi.clearAllMocks();
});

afterEach(async () => {
  await clearAll();
});

describe('noteRepository.get', () => {
  it('returns null for non-existent note (not cached, remote empty)', async () => {
    vi.mocked(mockRemote.fetchNotesSince).mockResolvedValue([]);

    const repo = createNoteRepository({ dek, keyId, remote: mockRemote, connectivity: onlineConnectivity });
    const result = await repo.get('01-01-2026');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('returns cached note when present', async () => {
    const content = '<p>Hello world</p>';
    const encrypted = await encryptNote(content, dek, keyId);

    await setCachedNote({
      date: '01-01-2026',
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      keyId: encrypted.keyId,
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: 1,
      remoteId: 'r1',
    });

    const repo = createNoteRepository({ dek, keyId, remote: mockRemote, connectivity: onlineConnectivity });
    const result = await repo.get('01-01-2026');

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      expect(result.value.date).toBe('01-01-2026');
      expect(result.value.content).toBe(content);
      expect(result.value.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    }
  });
});

describe('noteRepository.save', () => {
  it('returns Offline error when offline', async () => {
    const repo = createNoteRepository({ dek, keyId, remote: mockRemote, connectivity: offlineConnectivity });
    const result = await repo.save('01-01-2026', '<p>test</p>');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('Offline');
    }
  });

  it('encrypts and pushes to remote, updates cache', async () => {
    const now = new Date().toISOString();
    vi.mocked(mockRemote.pushNote).mockResolvedValue({
      id: 'r1',
      user_id: 'u1',
      date: '01-01-2026',
      ciphertext: 'ct',
      nonce: 'n',
      key_id: keyId,
      revision: 1,
      updated_at: now,
      server_updated_at: now,
      deleted: false,
    });

    const repo = createNoteRepository({ dek, keyId, remote: mockRemote, connectivity: onlineConnectivity });
    const result = await repo.save('01-01-2026', '<p>Hello</p>');

    expect(result.ok).toBe(true);
    expect(mockRemote.pushNote).toHaveBeenCalledOnce();

    const call = vi.mocked(mockRemote.pushNote).mock.calls[0][0];
    expect(call.date).toBe('01-01-2026');
    expect(call.keyId).toBe(keyId);
    expect(call.revision).toBe(1);
  });
});

describe('noteRepository.delete', () => {
  it('removes from cache after remote success', async () => {
    const content = '<p>To delete</p>';
    const encrypted = await encryptNote(content, dek, keyId);

    await setCachedNote({
      date: '02-01-2026',
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      keyId: encrypted.keyId,
      updatedAt: '2026-01-02T00:00:00.000Z',
      revision: 2,
      remoteId: 'r2',
    });

    vi.mocked(mockRemote.deleteNote).mockResolvedValue(undefined);

    const repo = createNoteRepository({ dek, keyId, remote: mockRemote, connectivity: onlineConnectivity });
    const result = await repo.delete('02-01-2026');

    expect(result.ok).toBe(true);
    expect(mockRemote.deleteNote).toHaveBeenCalledWith('r2', 2);

    // Verify removed from cache
    const getResult = await repo.get('02-01-2026');
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      // After deletion, fetchNotesSince returns empty → null
      vi.mocked(mockRemote.fetchNotesSince).mockResolvedValue([]);
      const getResult2 = await repo.get('02-01-2026');
      expect(getResult2.ok).toBe(true);
      if (getResult2.ok) expect(getResult2.value).toBeNull();
    }
  });
});

describe('noteRepository.getAllDates', () => {
  it('returns cached dates', async () => {
    const encrypted = await encryptNote('<p>a</p>', dek, keyId);
    const now = new Date().toISOString();

    await setCachedNote({ date: '01-01-2026', ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, keyId, updatedAt: now, revision: 1, remoteId: null });
    await setCachedNote({ date: '02-01-2026', ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, keyId, updatedAt: now, revision: 1, remoteId: null });

    const repo = createNoteRepository({ dek, keyId, remote: mockRemote, connectivity: onlineConnectivity });
    const result = await repo.getAllDates();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('01-01-2026');
      expect(result.value).toContain('02-01-2026');
    }
  });
});
