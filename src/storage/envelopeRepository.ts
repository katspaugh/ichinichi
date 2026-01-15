import type { ImageEnvelope, NoteEnvelope } from "../types";

/**
 * Storage boundary for encrypted note envelopes (ciphertext-only).
 */
export interface NoteEnvelopeRepository {
  getEnvelope(date: string): Promise<NoteEnvelope | null>;
  saveEnvelope(envelope: NoteEnvelope): Promise<void>;
  deleteEnvelope(date: string): Promise<void>;
  getAllEnvelopeDates(): Promise<string[]>;
}

/**
 * Storage boundary for encrypted image envelopes (ciphertext-only).
 */
export interface ImageEnvelopeRepository {
  getEnvelope(imageId: string): Promise<ImageEnvelope | null>;
  saveEnvelope(envelope: ImageEnvelope): Promise<void>;
  deleteEnvelope(imageId: string): Promise<void>;
  getEnvelopesByNoteDate(noteDate: string): Promise<ImageEnvelope[]>;
  deleteEnvelopesByNoteDate(noteDate: string): Promise<void>;
}
