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

const EMBEDDINGS_MODEL = "Xenova/all-MiniLM-L6-v2";

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
  if (!store.enabled) return;

  const svc = getEmbeddingsService();
  if (!svc.isReady()) return;

  const stripped = stripAiMarks(savedContent);
  const plainText = extractPlainText(stripped);
  if (!plainText.trim()) return;

  const hash = await computeContentHash(plainText);
  if (!store.shouldAnalyze(date, hash)) return;

  const gen = ++_analysisGeneration;
  store.setAnalyzing(true);

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
  } catch (error) {
    console.error("AI analysis failed:", error);
  } finally {
    if (gen === _analysisGeneration) {
      localAiStore.getState().setAnalyzing(false);
    }
  }
}
