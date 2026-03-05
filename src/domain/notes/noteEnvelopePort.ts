import type { NoteRecord, NoteMetaRecord } from "./noteRecord";
import type { NoteEnvelope } from "../../types";

export interface NoteEnvelopeState {
  envelope: NoteEnvelope | null;
  record: NoteRecord | null;
  meta: NoteMetaRecord | null;
}

export interface NoteEnvelopePort {
  getState(date: string): Promise<NoteEnvelopeState>;
  getAllStates(): Promise<NoteEnvelopeState[]>;
  setNoteAndMeta(record: NoteRecord, meta: NoteMetaRecord): Promise<void>;
  setMeta(meta: NoteMetaRecord): Promise<void>;
  deleteNoteAndMeta(date: string): Promise<void>;
  deleteRecord(date: string): Promise<void>;
  toEnvelope(record: NoteRecord, meta: NoteMetaRecord | null): NoteEnvelope;
}
