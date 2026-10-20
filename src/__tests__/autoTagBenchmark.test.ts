import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import {
  AUTO_TAG_MODEL,
  AUTO_TAG_MODEL_REVISION,
  AUTO_TAG_HYPOTHESIS,
  activityCandidates,
  entryChunks,
} from "../utils/autoTags";
import { parseModelClassification } from "../storage/parsers";

// Opt-in benchmark; synthetic entries only. Regular test runs stay offline.
// AUTO_TAG_BENCHMARK=1 AUTO_TAG_BENCHMARK_OUTPUT=/path/report.json vitest run ...
const BGE_MODEL = "TaylorAI/bge-micro-v2";
const BGE_REVISION = "3edf6d7de0faa426b09780416fe61009f26ae589";
type Fixture = { text: string; expected: string[] };
const calibration: Fixture[] = [
  { text: "Practiced trumpet for an hour.", expected: ["trumpet"] },
  { text: "I meditated.", expected: ["meditation"] },
  {
    text: "I worked on my embouchure and scales on the trumpet.",
    expected: ["trumpet"],
  },
  { text: "I did not play trumpet today.", expected: [] },
  { text: "Tomorrow I will play the trumpet.", expected: [] },
  { text: "John played trumpet while I listened.", expected: [] },
  { text: "A quiet day at home.", expected: [] },
];
const holdout: Fixture[] = [
  { text: "I played the trumpet.", expected: ["trumpet"] },
  {
    text: "Spent twenty minutes working through scales and long tones on my trumpet.",
    expected: ["trumpet"],
  },
  {
    text: "I sat quietly and followed my breath for twenty minutes.",
    expected: ["meditation"],
  },
  { text: "I went for a run around the park.", expected: ["run"] },
  { text: "I sang in the choir this evening.", expected: ["singing"] },
  { text: "I read a book before bed.", expected: ["reading"] },
  { text: "I played piano after dinner.", expected: ["piano"] },
  { text: "I went swimming this morning.", expected: ["swimming"] },
  { text: "I practiced yoga today.", expected: ["yoga"] },
  { text: "I went cycling along the river.", expected: ["cycling"] },
  {
    text: "I meditated. Later I practiced the trumpet.",
    expected: ["meditation", "trumpet"],
  },
  { text: "I didn't practice trumpet because I felt ill.", expected: [] },
  { text: "I haven't meditated for weeks.", expected: [] },
  { text: "I planned to go running, but stayed home.", expected: [] },
  { text: "I want to learn to play the trumpet next year.", expected: [] },
  { text: "I will meditate tomorrow morning.", expected: [] },
  {
    text: "My neighbor practiced the trumpet while I cooked dinner.",
    expected: [],
  },
  { text: "I listened to a recording of a trumpet concerto.", expected: [] },
  { text: "I bought a new trumpet mouthpiece online.", expected: [] },
  {
    text: "My friend ran a marathon. I watched from the sidelines.",
    expected: [],
  },
  {
    text: "I used to play trumpet as a child, but no longer do.",
    expected: [],
  },
  {
    text: "Work was busy. Had soup for dinner and went to bed early.",
    expected: [],
  },
];
interface Scored {
  text: string;
  expected: string[];
  scores: Record<string, number>;
}
const predictions = (item: Scored, threshold: number) =>
  Object.entries(item.scores)
    .filter(([, score]) => score >= threshold)
    .map(([type]) => type)
    .sort();
function evaluate(items: Scored[], threshold: number) {
  let exact = 0,
    truePositive = 0,
    falsePositive = 0,
    falseNegative = 0;
  const cases = items.map((item) => {
    const predicted = predictions(item, threshold);
    const expected = [...item.expected].sort();
    const correct = JSON.stringify(predicted) === JSON.stringify(expected);
    if (correct) exact++;
    truePositive += predicted.filter((tag) => expected.includes(tag)).length;
    falsePositive += predicted.filter((tag) => !expected.includes(tag)).length;
    falseNegative += expected.filter((tag) => !predicted.includes(tag)).length;
    return { ...item, predicted, correct };
  });
  return {
    exact,
    total: items.length,
    truePositive,
    falsePositive,
    falseNegative,
    precision:
      truePositive + falsePositive
        ? truePositive / (truePositive + falsePositive)
        : 0,
    recall:
      truePositive + falseNegative
        ? truePositive / (truePositive + falseNegative)
        : 0,
    cases,
  };
}

// Desktop CPU inference, q8, sequential sentences, pre-embedded activity examples.
// Download/load time is reported separately; these are not phone/browser timings.
describe.skipIf(process.env.AUTO_TAG_BENCHMARK !== "1")(
  "BGE Micro vs DeBERTa",
  () => {
    it("measures accuracy and warm inference without changing the app model", async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const candidates = activityCandidates([]);
      const fixtures = [...calibration, ...holdout];
      const loadStarted = performance.now();
      const embedding = await pipeline("feature-extraction", BGE_MODEL, {
        dtype: "q8",
        revision: BGE_REVISION,
      });
      const bgeLoadMs = performance.now() - loadStarted;
      let bgeItems: Scored[];
      const contrastItems: Scored[] = [];
      let bgeInferenceMs: number;
      try {
        const references = await embedding(
          candidates.map(({ label }) => `I ${label}.`),
          { pooling: "mean", normalize: true },
        );
        const baseVerbs: Record<string, string> = {
          played: "play",
          practiced: "practice",
          meditated: "meditate",
          went: "go",
          sang: "sing",
          recalled: "recall",
        };
        const negativeExamples = candidates.flatMap(({ type, label }) => {
          const base = label.replace(/^\S+/, (verb) => baseVerbs[verb] ?? verb);
          return [
            `I did not ${base}.`,
            `I will ${base} tomorrow.`,
            `Someone else ${label}, while I watched.`,
            `I used to ${base}, but no longer do.`,
          ].map((text) => ({ type, text }));
        });
        const negativeReferences = await embedding(
          negativeExamples.map(({ text }) => text),
          { pooling: "mean", normalize: true },
        );
        const dimensions = references.dims[1];
        expect(dimensions).toBe(384);
        // Warm inference before measuring, excluding initialization.
        await embedding("Warmup.", { pooling: "mean", normalize: true });
        const started = performance.now();
        bgeItems = [];
        for (const fixture of fixtures) {
          const scores: Record<string, number> = {};
          const contrasts: Record<string, number> = {};
          for (const chunk of entryChunks(fixture.text)) {
            const vector = await embedding(chunk, {
              pooling: "mean",
              normalize: true,
            });
            const positiveScores: Record<string, number> = {};
            const negativeScores: Record<string, number> = {};
            for (const [index, example] of negativeExamples.entries()) {
              let similarity = 0;
              for (let i = 0; i < dimensions; i++)
                similarity +=
                  Number(vector.data[i]) *
                  Number(negativeReferences.data[index * dimensions + i]);
              negativeScores[example.type] = Math.max(
                negativeScores[example.type] ?? -1,
                similarity,
              );
            }
            for (const [index, candidate] of candidates.entries()) {
              let similarity = 0;
              for (let i = 0; i < dimensions; i++) {
                similarity +=
                  Number(vector.data[i]) *
                  Number(references.data[index * dimensions + i]);
              }
              expect(Number.isFinite(similarity)).toBe(true);
              scores[candidate.type] = Math.max(
                scores[candidate.type] ?? -1,
                similarity,
              );
              positiveScores[candidate.type] = Math.max(
                positiveScores[candidate.type] ?? -1,
                similarity,
              );
            }
            for (const [type, positive] of Object.entries(positiveScores)) {
              const margin =
                positive >= 0.7 ? positive - negativeScores[type] : -1;
              contrasts[type] = Math.max(contrasts[type] ?? -1, margin);
            }
          }
          bgeItems.push({ ...fixture, scores });
          contrastItems.push({ ...fixture, scores: contrasts });
        }
        bgeInferenceMs = performance.now() - started;
      } finally {
        await embedding.dispose();
      }
      const nliLoadStarted = performance.now();
      const classifier = await pipeline(
        "zero-shot-classification",
        AUTO_TAG_MODEL,
        { dtype: "q8", revision: AUTO_TAG_MODEL_REVISION },
      );
      const nliLoadMs = performance.now() - nliLoadStarted;
      let nliItems: Scored[];
      let nliInferenceMs: number;
      try {
        const options = {
          multi_label: true,
          hypothesis_template: AUTO_TAG_HYPOTHESIS,
        };
        await classifier("Warmup.", ["meditated"], options);
        const started = performance.now();
        nliItems = [];
        for (const fixture of fixtures) {
          const scores: Record<string, number> = {};
          for (const chunk of entryChunks(fixture.text)) {
            const result = parseModelClassification(
              await classifier(
                chunk,
                candidates.map(({ label }) => label),
                options,
              ),
            );
            expect(result).not.toBeNull();
            for (const [index, label] of result!.labels.entries()) {
              const type = candidates.find(
                (candidate) => candidate.label === label,
              )!.type;
              scores[type] = Math.max(scores[type] ?? 0, result!.scores[index]);
            }
          }
          nliItems.push({ ...fixture, scores });
        }
        nliInferenceMs = performance.now() - started;
      } finally {
        await classifier.dispose();
      }

      // Pick threshold on the original seven examples, never on holdout entries.
      const tune = (items: Scored[], thresholds: number[]) =>
        thresholds
          .map((threshold) => {
            const { exact, truePositive, falsePositive, falseNegative } =
              evaluate(items.slice(0, calibration.length), threshold);
            const f1 =
              (2 * truePositive) /
              Math.max(1, 2 * truePositive + falsePositive + falseNegative);
            return { threshold, exact, falsePositive, falseNegative, f1 };
          })
          .sort(
            (a, b) =>
              b.f1 - a.f1 ||
              b.exact - a.exact ||
              a.falsePositive - b.falsePositive ||
              b.threshold - a.threshold,
          );
      const sweep = tune(
        bgeItems,
        Array.from({ length: 70 }, (_, i) => (30 + i) / 100),
      );
      const contrastSweep = tune(
        contrastItems,
        Array.from({ length: 81 }, (_, i) => (i - 20) / 100),
      );
      const threshold = sweep[0].threshold;
      const contrastThreshold = contrastSweep[0].threshold;
      const report = {
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          device: "desktop CPU",
          dtype: "q8",
        },
        methodology:
          "Synthetic English entries; seven original calibration entries and 22 held-out entries. BGE uses mean-pooled normalized embeddings, cosine similarity against the same activity examples as DeBERTa, max over synonyms and sentence chunks. Threshold selected only on calibration label F1, then exact matches, then fewer false positives. A second BGE variant requires cosine >= 0.7 and a calibrated positive-minus-negative margin, using four negative prototypes per activity example (negation, plans, someone else, historical activity). DeBERTa uses the app's fixed 0.85 threshold. Warm inference excludes model and reference loading. Small diagnostic benchmark, not a general accuracy estimate.",
        bge: {
          model: BGE_MODEL,
          revision: BGE_REVISION,
          threshold,
          loadMs: bgeLoadMs,
          warmInferenceMs: bgeInferenceMs,
          calibration: evaluate(
            bgeItems.slice(0, calibration.length),
            threshold,
          ),
          holdout: evaluate(bgeItems.slice(calibration.length), threshold),
        },
        bgeContrast: {
          threshold: contrastThreshold,
          calibration: evaluate(
            contrastItems.slice(0, calibration.length),
            contrastThreshold,
          ),
          holdout: evaluate(
            contrastItems.slice(calibration.length),
            contrastThreshold,
          ),
        },
        deberta: {
          model: AUTO_TAG_MODEL,
          revision: AUTO_TAG_MODEL_REVISION,
          threshold: 0.85,
          loadMs: nliLoadMs,
          warmInferenceMs: nliInferenceMs,
          calibration: evaluate(nliItems.slice(0, calibration.length), 0.85),
          holdout: evaluate(nliItems.slice(calibration.length), 0.85),
        },
        bgeCalibrationSweep: sweep,
        bgeContrastCalibrationSweep: contrastSweep,
      };
      if (process.env.AUTO_TAG_BENCHMARK_OUTPUT) {
        await writeFile(
          process.env.AUTO_TAG_BENCHMARK_OUTPUT,
          JSON.stringify(report, null, 2) + "\n",
        );
      }
      console.log(
        JSON.stringify(
          {
            bge: {
              threshold,
              calibration: report.bge.calibration.exact,
              holdout: report.bge.holdout.exact,
              falsePositive: report.bge.holdout.falsePositive,
              falseNegative: report.bge.holdout.falseNegative,
              warmMs: bgeInferenceMs,
            },
            bgeContrast: {
              threshold: contrastThreshold,
              calibration: report.bgeContrast.calibration.exact,
              holdout: report.bgeContrast.holdout.exact,
              falsePositive: report.bgeContrast.holdout.falsePositive,
              falseNegative: report.bgeContrast.holdout.falseNegative,
            },
            deberta: {
              calibration: report.deberta.calibration.exact,
              holdout: report.deberta.holdout.exact,
              falsePositive: report.deberta.holdout.falsePositive,
              falseNegative: report.deberta.holdout.falseNegative,
              warmMs: nliInferenceMs,
            },
          },
          null,
          2,
        ),
      );
    }, 180_000);
  },
);
