import type { ActivityCandidate } from "../types/autoTags";

export const AUTO_TAG_MODEL =
  "MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33";
export const AUTO_TAG_MODEL_REVISION =
  "262ae02f29173eec1c250f90804dc7edc677dcff";
export const AUTO_TAG_HYPOTHESIS = "I {}.";

const ACTIVITIES: ActivityCandidate[] = [
  { type: "trumpet", label: "played the trumpet" },
  { type: "trumpet", label: "practiced the trumpet" },
  { type: "trombone", label: "played the trombone" },
  { type: "trombone", label: "practiced the trombone" },
  { type: "piano", label: "played the piano" },
  { type: "piano", label: "practiced the piano" },
  { type: "guitar", label: "played the guitar" },
  { type: "guitar", label: "practiced the guitar" },
  { type: "meditation", label: "meditated" },
  { type: "run", label: "went for a run" },
  { type: "singing", label: "sang" },
  { type: "singing", label: "practiced singing" },
  { type: "yoga", label: "practiced yoga" },
  { type: "swimming", label: "went swimming" },
  { type: "cycling", label: "went cycling" },
  { type: "reading", label: "read a book" },
  { type: "dream", label: "recalled a dream" },
];

export function activityCandidates(
  custom: readonly string[],
): ActivityCandidate[] {
  const candidates = [...ACTIVITIES];
  const seen = new Set(candidates.map(({ type }) => type));
  for (const type of [...new Set(custom)].sort()) {
    if (!seen.has(type))
      candidates.push({ type, label: `did ${type.replaceAll("-", " ")}` });
  }
  return candidates;
}

export function tagsFromScores(
  result: { labels: string[]; scores: number[] },
  candidates: readonly ActivityCandidate[],
): string[] {
  const labels = new Map(candidates.map(({ type, label }) => [label, type]));
  return [
    ...new Set(
      result.labels.flatMap((label, index) => {
        const type = labels.get(label);
        const score = result.scores[index];
        return type && Number.isFinite(score) && score >= 0.85 ? [type] : [];
      }),
    ),
  ];
}

export function entryText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style").forEach((node) => node.remove());
  doc.querySelectorAll("p, div, section, li, br").forEach((node) => {
    node.append(doc.createTextNode("\n"));
  });
  return (doc.body.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

/** Bound each inference to avoid silently truncating the end of long notes. */
export function entryChunks(text: string): string[] {
  return text.split(/\n+|(?<=[.!?])\s+/).flatMap((sentence) => {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += 100)
      chunks.push(words.slice(i, i + 100).join(" "));
    return chunks;
  });
}
