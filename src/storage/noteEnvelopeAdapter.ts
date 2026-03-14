import type { NoteEnvelopePort } from "../domain/notes/noteEnvelopePort";
import {
  getNoteEnvelopeState,
  getAllNoteEnvelopeStates,
  toNoteEnvelope,
} from "./unifiedNoteEnvelopeRepository";
import {
  setNoteAndMeta,
  setNoteMeta,
  deleteNoteAndMeta,
  deleteNoteRecord,
  getAllNoteRecordDates,
} from "./unifiedNoteStore";

export function createNoteEnvelopeAdapter(): NoteEnvelopePort {
  return {
    getState: getNoteEnvelopeState,
    getAllStates: getAllNoteEnvelopeStates,
    getAllRecordDates: getAllNoteRecordDates,
    setNoteAndMeta,
    setMeta: setNoteMeta,
    deleteNoteAndMeta,
    deleteRecord: deleteNoteRecord,
    toEnvelope: toNoteEnvelope,
  };
}
