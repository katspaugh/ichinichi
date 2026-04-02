import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import {
  clearAll,
  getCachedNote,
  setCachedNote,
  deleteCachedNote,
  getAllCachedDates,
  getSyncCursor,
  setSyncCursor,
  setCachedImage,
  getImageMeta,
  getImageMetaByDate,
  type CachedNoteRecord,
  type CachedImageRecord,
  type CachedImageMeta,
} from '../storage/cache';

const NOTE: CachedNoteRecord = {
  date: '01-04-2026',
  ciphertext: 'abc',
  nonce: 'nonce1',
  keyId: 'key1',
  updatedAt: '2026-04-01T00:00:00Z',
  revision: 1,
  remoteId: null,
};

const IMAGE: CachedImageRecord = {
  id: 'img-uuid-1',
  ciphertext: 'imgdata',
  nonce: 'nonce2',
  keyId: 'key1',
};

const META: CachedImageMeta = {
  id: 'img-uuid-1',
  noteDate: '01-04-2026',
  type: 'inline',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  width: 800,
  height: 600,
  size: 12345,
  sha256: 'abc123',
  remotePath: null,
};

afterEach(async () => {
  await clearAll();
});

describe('notes', () => {
  it('stores and retrieves a note', async () => {
    await setCachedNote(NOTE);
    const result = await getCachedNote(NOTE.date);
    expect(result).toEqual(NOTE);
  });

  it('returns null for missing note', async () => {
    const result = await getCachedNote('99-99-9999');
    expect(result).toBeNull();
  });

  it('deletes a note', async () => {
    await setCachedNote(NOTE);
    await deleteCachedNote(NOTE.date);
    const result = await getCachedNote(NOTE.date);
    expect(result).toBeNull();
  });

  it('returns all cached dates', async () => {
    const note2: CachedNoteRecord = { ...NOTE, date: '02-04-2026' };
    await setCachedNote(NOTE);
    await setCachedNote(note2);
    const dates = await getAllCachedDates();
    expect(dates).toContain('01-04-2026');
    expect(dates).toContain('02-04-2026');
    expect(dates).toHaveLength(2);
  });
});

describe('sync cursor', () => {
  it('stores and retrieves sync cursor', async () => {
    await setSyncCursor('cursor-abc');
    const result = await getSyncCursor();
    expect(result).toBe('cursor-abc');
  });
});

describe('clearAll', () => {
  it('removes all data', async () => {
    await setCachedNote(NOTE);
    await setSyncCursor('cursor-xyz');
    await clearAll();
    expect(await getCachedNote(NOTE.date)).toBeNull();
    expect(await getSyncCursor()).toBeNull();
    expect(await getAllCachedDates()).toHaveLength(0);
  });
});

describe('image meta', () => {
  it('getImageMeta returns single meta by ID', async () => {
    await setCachedImage(IMAGE, META);
    const result = await getImageMeta(META.id);
    expect(result).toEqual(META);
  });

  it('getImageMetaByDate returns metas for a date', async () => {
    const meta2: CachedImageMeta = { ...META, id: 'img-uuid-2' };
    const image2: CachedImageRecord = { ...IMAGE, id: 'img-uuid-2' };
    await setCachedImage(IMAGE, META);
    await setCachedImage(image2, meta2);

    const results = await getImageMetaByDate('01-04-2026');
    expect(results).toHaveLength(2);
    expect(results.map((m) => m.id)).toContain('img-uuid-1');
    expect(results.map((m) => m.id)).toContain('img-uuid-2');
  });
});
