import { createStore } from "zustand/vanilla";
import type { AiMeta } from "../domain/ai/aiTypes";
import { LOCAL_AI_ENABLED_KEY } from "../utils/constants";

export type ModelStatus = "idle" | "downloading" | "ready" | "error";

export interface LocalAiState {
  enabled: boolean;
  modelStatus: ModelStatus;
  modelError: string | null;
  analyzing: boolean;

  // Per-note AI metadata cache (populated on load/analysis)
  aiMetaByDate: Record<string, AiMeta>;
  // Content hashes at time of last analysis (to avoid re-analyzing unchanged content)
  lastAnalyzedHash: Record<string, string>;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setModelStatus: (status: ModelStatus, error?: string) => void;
  setAnalyzing: (analyzing: boolean) => void;
  cacheAiMeta: (date: string, meta: AiMeta) => void;
  updateAiTags: (date: string, tags: string[]) => AiMeta | undefined;
  getAiMeta: (date: string) => AiMeta | undefined;
  shouldAnalyze: (date: string, contentHash: string) => boolean;
  setLastAnalyzedHash: (date: string, hash: string) => void;
}

function readEnabled(): boolean {
  try {
    const stored = localStorage.getItem(LOCAL_AI_ENABLED_KEY);
    // Default to true when no key exists
    return stored !== "false";
  } catch {
    return true;
  }
}

export const localAiStore = createStore<LocalAiState>()((set, get) => ({
  enabled: readEnabled(),
  modelStatus: "idle" as ModelStatus,
  modelError: null,
  analyzing: false,
  aiMetaByDate: {},
  lastAnalyzedHash: {},

  setEnabled(enabled: boolean) {
    try {
      if (enabled) {
        localStorage.removeItem(LOCAL_AI_ENABLED_KEY);
      } else {
        localStorage.setItem(LOCAL_AI_ENABLED_KEY, "false");
      }
    } catch {
      // localStorage unavailable
    }
    set({ enabled });
  },

  setModelStatus(status: ModelStatus, error?: string) {
    set({ modelStatus: status, modelError: error ?? null });
  },

  setAnalyzing(analyzing: boolean) {
    set({ analyzing });
  },

  cacheAiMeta(date: string, meta: AiMeta) {
    const current = get().aiMetaByDate;
    set({ aiMetaByDate: { ...current, [date]: meta } });
  },

  updateAiTags(date: string, tags: string[]): AiMeta | undefined {
    const existing = get().aiMetaByDate[date];
    if (!existing) return undefined;
    const updated = { ...existing, tags };
    const current = get().aiMetaByDate;
    set({ aiMetaByDate: { ...current, [date]: updated } });
    return updated;
  },

  getAiMeta(date: string): AiMeta | undefined {
    return get().aiMetaByDate[date];
  },

  shouldAnalyze(date: string, contentHash: string): boolean {
    const lastHash = get().lastAnalyzedHash[date];
    return lastHash !== contentHash;
  },

  setLastAnalyzedHash(date: string, hash: string) {
    const current = get().lastAnalyzedHash;
    set({ lastAnalyzedHash: { ...current, [date]: hash } });
  },
}));
