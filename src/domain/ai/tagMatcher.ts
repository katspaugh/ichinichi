export interface TagIndex {
  tagIds: string[];
  tagLabels: string[];
  vectors: Float32Array[];
}

export interface ScoredTag {
  id: string;
  label: string;
  score: number;
}

const DEFAULT_THRESHOLD = 0.35;
const DEFAULT_MAX_TAGS = 8;

/**
 * Cosine similarity between two vectors.
 * Returns 0 if either vector has zero magnitude.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Match note chunk vectors against the tag index.
 * For each tag, computes max similarity across all chunks.
 * Returns tags sorted by score descending, filtered by threshold, capped at maxTags.
 */
export function matchTags(
  chunkVecs: Float32Array[],
  tagIndex: TagIndex,
  options?: { threshold?: number; maxTags?: number },
): ScoredTag[] {
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const maxTags = options?.maxTags ?? DEFAULT_MAX_TAGS;

  if (chunkVecs.length === 0) return [];

  const scored: ScoredTag[] = [];

  for (let t = 0; t < tagIndex.tagIds.length; t++) {
    const tagVec = tagIndex.vectors[t];
    let maxSim = -Infinity;

    for (const chunkVec of chunkVecs) {
      const sim = cosineSimilarity(chunkVec, tagVec);
      if (sim > maxSim) maxSim = sim;
    }

    if (maxSim >= threshold) {
      scored.push({
        id: tagIndex.tagIds[t],
        label: tagIndex.tagLabels[t],
        score: maxSim,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxTags);
}
