import { useCallback, useEffect, useSyncExternalStore } from "react";
import { localAiStore } from "../stores/localAiStore";
import type { ModelStatus } from "../stores/localAiStore";
import {
  getEmbeddingsService,
  resetEmbeddingsService,
} from "../services/embeddingsService";
import type { AiMeta } from "../domain/ai/aiTypes";

const { subscribe, getState } = localAiStore;

// ---------- Shared init helper ----------

function initEmbeddings(): void {
  const svc = getEmbeddingsService();
  getState().setModelStatus("downloading");
  svc
    .init()
    .then(() => {
      // Only update if still in downloading state (not disposed in between)
      if (getState().modelStatus === "downloading") {
        getState().setModelStatus("ready");
      }
    })
    .catch((err: unknown) => {
      if (getState().modelStatus === "downloading") {
        getState().setModelStatus(
          "error",
          err instanceof Error ? err.message : String(err),
        );
      }
    });
}

// ---------- UI hook (NoteEditor, sidebar) ----------

export interface UseLocalAiReturn {
  enabled: boolean;
  modelStatus: ModelStatus;
  modelError: string | null;
  analyzing: boolean;
  aiMeta: AiMeta | undefined;
  toggleEnabled: () => void;
}

export function useLocalAi(date: string | null): UseLocalAiReturn {
  const enabled = useSyncExternalStore(subscribe, () => getState().enabled);
  const modelStatus = useSyncExternalStore(
    subscribe,
    () => getState().modelStatus,
  );
  const modelError = useSyncExternalStore(
    subscribe,
    () => getState().modelError,
  );
  const analyzing = useSyncExternalStore(
    subscribe,
    () => getState().analyzing,
  );

  const aiMeta = useSyncExternalStore(subscribe, () =>
    date ? getState().getAiMeta(date) : undefined,
  );

  // Auto-init on mount if already enabled but idle
  useEffect(() => {
    if (enabled && getState().modelStatus === "idle") {
      initEmbeddings();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleEnabled = useCallback(() => {
    const next = !getState().enabled;
    getState().setEnabled(next);
    if (next) {
      initEmbeddings();
    } else {
      getEmbeddingsService().dispose();
      resetEmbeddingsService();
      getState().setModelStatus("idle");
    }
  }, []);

  return {
    enabled,
    modelStatus,
    modelError,
    analyzing,
    aiMeta,
    toggleEnabled,
  };
}
