export interface ActivityCandidate {
  type: string;
  label: string;
}
export interface AutoTagEntry {
  date: string;
  content: string;
}
export interface AutoTagStatus {
  phase: "disabled" | "classifying" | "ready" | "error";
  message: string;
}
export type AutoTagWorkerMessage =
  | { type: "progress"; message: string }
  | { type: "result"; entries: Array<{ date: string; tags: string[] }> }
  | { type: "error"; message: string };
export interface AutoTagWorkerRequest {
  entries: Array<{ date: string; text: string }>;
  candidates: ActivityCandidate[];
}
