import type { AiMeta } from "./aiTypes";
import type { E2eeService } from "../crypto/e2eeService";
import { extractPlainText, computeContentHash } from "./aiTextExtractor";
import { stripAiMarks } from "./aiMarker";
import { localAiStore } from "../../stores/localAiStore";
import { getEmbeddingsService } from "../../services/embeddingsService";
import { saveEncryptedAiMeta } from "../../storage/aiMetaStore";
import { chunkText } from "./textChunker";
import { getOrBuildTagIndex } from "./buildTagIndex";
import { matchTags } from "./tagMatcher";

const EMBEDDINGS_MODEL = "all-MiniLM-L6-v2";

let _analysisGeneration = 0;

/**
 * Trigger AI analysis for a saved note.
 * Called from the afterSave callback in useNoteRepository.
 * Uses generation counter to cancel superseded analyses.
 */
export async function triggerAiAnalysis(
  date: string,
  savedContent: string,
  e2ee: E2eeService,
): Promise<void> {
  const store = localAiStore.getState();
  if (!store.enabled) {
    console.debug("[AI] skipped: disabled");
    return;
  }

  const svc = getEmbeddingsService();
  if (!svc.isReady()) {
    if (svc.isLoading()) {
      console.debug("[AI] model still loading, waiting…");
      try {
        await svc.init(); // returns existing init promise
      } catch {
        console.debug("[AI] model failed to load while waiting");
        return;
      }
    } else {
      console.debug("[AI] skipped: model not ready (status idle or error)");
      return;
    }
  }

  const stripped = stripAiMarks(savedContent);
  const plainText = extractPlainText(stripped);
  if (!plainText.trim()) {
    console.debug("[AI] skipped: empty text after extraction");
    return;
  }

  const hash = await computeContentHash(plainText);
  if (!store.shouldAnalyze(date, hash)) {
    console.debug("[AI] skipped: already analyzed this hash for", date);
    return;
  }

  const gen = ++_analysisGeneration;
  store.setAnalyzing(true);
  console.debug("[AI] starting analysis for", date, "text length:", plainText.length);

  try {
    const chunks = chunkText(plainText);
    const chunkVecs = await svc.embed(chunks);
    if (gen !== _analysisGeneration) return;

    const tagIndex = await getOrBuildTagIndex(
      (texts) => svc.embed(texts),
      EMBEDDINGS_MODEL,
    );
    if (gen !== _analysisGeneration) return;

    const scored = matchTags(chunkVecs, tagIndex);

    if (scored.length === 0) {
      console.debug("[AI] analysis complete but no tags exceeded threshold");
    } else {
      console.debug(
        "[AI] matched tags:",
        scored.map((s) => `${s.label}(${s.score.toFixed(3)})`),
      );
    }

    const now = new Date().toISOString();

    const meta: AiMeta = {
      title: "",
      tags: scored.map((s) => s.label),
      events: [],
      contentHash: hash,
      analyzedAt: now,
    };

    localAiStore.getState().cacheAiMeta(date, meta);
    localAiStore.getState().setLastAnalyzedHash(date, hash);
    await saveEncryptedAiMeta(date, meta, e2ee);
    console.debug("[AI] cached meta for", date, "tags:", meta.tags);
  } catch (error) {
    console.error("AI analysis failed:", error);
  } finally {
    if (gen === _analysisGeneration) {
      localAiStore.getState().setAnalyzing(false);
    }
  }
}
