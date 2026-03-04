export interface AiEvent {
  type: "person" | "place" | "activity" | "fact";
  text: string; // exact text matched in note
  label: string; // normalized label
}

export interface AiMeta {
  title: string;
  tags: string[];
  events: AiEvent[];
  contentHash: string; // SHA-256 of plain text at analysis time
  analyzedAt: string; // ISO timestamp
}
