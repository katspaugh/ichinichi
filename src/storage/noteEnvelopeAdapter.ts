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
} from "./unifiedNoteStore";

export function createNoteEnvelopeAdapter(): NoteEnvelopePort {
  return {
    getState: getNoteEnvelopeState,
    getAllStates: getAllNoteEnvelopeStates,
    setNoteAndMeta,
    setMeta: setNoteMeta,
    deleteNoteAndMeta,
    deleteRecord: deleteNoteRecord,
    toEnvelope: toNoteEnvelope,
  };
}
