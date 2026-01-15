import type { PendingOpsSource, PendingOpsSummary } from "../domain/sync/pendingOpsSource";
import { getAllNoteMeta } from "./unifiedNoteStore";
import { getAllImageMeta } from "./unifiedImageStore";

export const pendingOpsSource: PendingOpsSource = {
  async getSummary(): Promise<PendingOpsSummary> {
    const [noteMeta, imageMeta] = await Promise.all([
      getAllNoteMeta(),
      getAllImageMeta(),
    ]);
    const notes = noteMeta.filter((meta) => meta.pendingOp).length;
    const images = imageMeta.filter((meta) => meta.pendingOp).length;
    return {
      notes,
      images,
      total: notes + images,
    };
  },

  async hasPending(): Promise<boolean> {
    const summary = await this.getSummary();
    return summary.total > 0;
  },
};
