const DEFAULT_MAX_CHARS = 400;

/**
 * Splits text into chunks on sentence boundaries.
 * Sentences end with . ! ? followed by whitespace or end-of-string.
 * A chunk may exceed maxChars if a single sentence is longer.
 * If text is shorter than maxChars, returns [text].
 */
export function chunkText(text: string, maxChars?: number): string[] {
  const limit = maxChars ?? DEFAULT_MAX_CHARS;
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= limit) return [trimmed];

  // Split on sentence boundaries: . ! ? followed by whitespace or end-of-string
  const sentences = trimmed.match(/[^.!?]*[.!?](?:\s+|$)|[^.!?]+$/g);
  if (!sentences) return [trimmed];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const s = sentence.trimEnd();
    if (!s) continue;

    if (current && current.length + s.length + 1 > limit) {
      chunks.push(current);
      current = s;
    } else {
      current = current ? current + " " + s : s;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
