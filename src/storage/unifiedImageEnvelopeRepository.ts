import type { ImageEnvelope } from "../types";
import type { ImageMetaRecord, ImageRecord } from "./unifiedDb";
import {
  getAllImageMeta,
  getImageMeta,
  getImageRecord,
} from "./unifiedImageStore";

export interface ImageEnvelopeState {
  envelope: ImageEnvelope | null;
  record: ImageRecord | null;
  meta: ImageMetaRecord | null;
}

export function toImageEnvelope(
  meta: ImageMetaRecord,
  record: ImageRecord,
): ImageEnvelope {
  return {
    id: meta.id,
    noteDate: meta.noteDate,
    type: meta.type,
    filename: meta.filename,
    mimeType: meta.mimeType,
    width: meta.width,
    height: meta.height,
    size: meta.size,
    createdAt: meta.createdAt,
    sha256: meta.sha256,
    ciphertext: record.ciphertext,
    nonce: record.nonce,
    keyId: record.keyId,
    serverUpdatedAt: meta.serverUpdatedAt ?? null,
    deleted: false,
    remotePath: meta.remotePath ?? null,
  };
}

export async function getImageEnvelopeState(
  imageId: string,
): Promise<ImageEnvelopeState> {
  const [record, meta] = await Promise.all([
    getImageRecord(imageId),
    getImageMeta(imageId),
  ]);
  return {
    envelope: record && meta ? toImageEnvelope(meta, record) : null,
    record,
    meta,
  };
}

export async function getAllImageEnvelopeStates(): Promise<
  ImageEnvelopeState[]
> {
  const metas = await getAllImageMeta();
  const results: ImageEnvelopeState[] = [];

  for (const meta of metas) {
    const record = await getImageRecord(meta.id);
    results.push({
      envelope: record ? toImageEnvelope(meta, record) : null,
      record,
      meta,
    });
  }

  return results;
}
