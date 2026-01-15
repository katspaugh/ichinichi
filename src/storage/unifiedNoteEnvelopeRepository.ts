import type { NoteEnvelope } from "../types";
import type { NoteMetaRecord, NoteRecord } from "./unifiedDb";
import {
  getAllNoteMeta,
  getAllNoteRecords,
  getNoteMeta,
  getNoteRecord,
} from "./unifiedNoteStore";

export interface NoteEnvelopeState {
  envelope: NoteEnvelope | null;
  record: NoteRecord | null;
  meta: NoteMetaRecord | null;
}

export function toNoteEnvelope(
  record: NoteRecord,
  meta: NoteMetaRecord | null,
): NoteEnvelope {
  return {
    date: record.date,
    ciphertext: record.ciphertext,
    nonce: record.nonce,
    keyId: record.keyId,
    updatedAt: record.updatedAt,
    revision: meta?.revision ?? 1,
    serverUpdatedAt: meta?.serverUpdatedAt ?? null,
    deleted: false,
  };
}

export async function getNoteEnvelopeState(
  date: string,
): Promise<NoteEnvelopeState> {
  const [record, meta] = await Promise.all([
    getNoteRecord(date),
    getNoteMeta(date),
  ]);
  return {
    envelope: record ? toNoteEnvelope(record, meta) : null,
    record,
    meta,
  };
}

export async function getAllNoteEnvelopeStates(): Promise<
  NoteEnvelopeState[]
> {
  const [records, metas] = await Promise.all([
    getAllNoteRecords(),
    getAllNoteMeta(),
  ]);
  const recordMap = new Map(records.map((record) => [record.date, record]));
  const metaMap = new Map(metas.map((meta) => [meta.date, meta]));
  const dates = new Set<string>([
    ...recordMap.keys(),
    ...metaMap.keys(),
  ]);

  const results: NoteEnvelopeState[] = [];
  for (const date of dates) {
    const record = recordMap.get(date) ?? null;
    const meta = metaMap.get(date) ?? null;
    results.push({
      envelope: record ? toNoteEnvelope(record, meta) : null,
      record,
      meta,
    });
  }

  return results;
}
