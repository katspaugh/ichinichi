import { describe, expect, it } from "vitest";
import {
  AUTO_TAG_MODEL,
  AUTO_TAG_MODEL_REVISION,
  AUTO_TAG_HYPOTHESIS,
  activityCandidates,
  tagsFromScores,
} from "../utils/autoTags";
import { parseModelClassification } from "../storage/parsers";

// Explicit integration test: downloads ~90 MB on first run; regular tests stay offline.
describe.skipIf(process.env.AUTO_TAG_MODEL_TEST !== "1")(
  "real activity model",
  () => {
    it("recognizes prose while rejecting negation, future plans and other people's activities", async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const model = await pipeline("zero-shot-classification", AUTO_TAG_MODEL, {
        dtype: "q8",
        revision: AUTO_TAG_MODEL_REVISION,
      });
      const candidates = activityCandidates([]);
      const fixtures: Array<[string, string[]]> = [
        ["Practiced trumpet for an hour.", ["trumpet"]],
        ["I meditated.", ["meditation"]],
        ["I worked on my embouchure and scales on the trumpet.", ["trumpet"]],
        ["I did not play trumpet today.", []],
        ["Tomorrow I will play the trumpet.", []],
        ["John played trumpet while I listened.", []],
        ["A quiet day at home.", []],
      ];
      try {
        for (const [text, expected] of fixtures) {
          const raw: unknown = await model(
            text,
            candidates.map(({ label }) => label),
            { multi_label: true, hypothesis_template: AUTO_TAG_HYPOTHESIS },
          );
          const result = parseModelClassification(raw);
          expect(result).not.toBeNull();
          expect(tagsFromScores(result!, candidates).sort(), text).toEqual(
            expected,
          );
        }
      } finally {
        await model.dispose();
      }
    }, 180_000);
  },
);
