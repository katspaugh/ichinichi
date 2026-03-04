import type { TagIndex } from "./tagMatcher";
import { TAG_TAXONOMY, TAXONOMY_VERSION, buildTagEmbeddingText } from "./tagTaxonomy";
import { loadTagIndex, saveTagIndex } from "../../storage/tagIndexStore";

type EmbedFn = (texts: string[]) => Promise<Float32Array[]>;

/**
 * Returns a cached TagIndex from IndexedDB, or builds one by embedding
 * all tag definitions and caching the result.
 */
export async function getOrBuildTagIndex(
  embed: EmbedFn,
  modelName: string,
): Promise<TagIndex> {
  const cached = await loadTagIndex(TAXONOMY_VERSION, modelName);
  if (cached) return cached;

  const tagTexts = TAG_TAXONOMY.map(buildTagEmbeddingText);
  const vectors = await embed(tagTexts);

  const index: TagIndex = {
    tagIds: TAG_TAXONOMY.map((t) => t.id),
    tagLabels: TAG_TAXONOMY.map((t) => t.label),
    vectors,
  };

  await saveTagIndex(TAXONOMY_VERSION, modelName, index);
  return index;
}
