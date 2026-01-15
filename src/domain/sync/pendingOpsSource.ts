export interface PendingOpsSummary {
  notes: number;
  images: number;
  total: number;
}

export interface PendingOpsSource {
  getSummary(): Promise<PendingOpsSummary>;
  hasPending(): Promise<boolean>;
}
