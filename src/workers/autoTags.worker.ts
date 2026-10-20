import { env, pipeline } from "@huggingface/transformers";
import wasmUrl from "../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url";
import mjsUrl from "../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url";
import type {
  AutoTagWorkerRequest,
  AutoTagWorkerMessage,
} from "../types/autoTags";
import {
  entryChunks,
  tagsFromScores,
  AUTO_TAG_MODEL,
  AUTO_TAG_MODEL_REVISION,
  AUTO_TAG_HYPOTHESIS,
} from "../utils/autoTags";
import { parseModelClassification } from "../storage/parsers";
import { reportError } from "../utils/errorReporter";

env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
  env.backends.onnx.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
}
const send = (message: AutoTagWorkerMessage) => self.postMessage(message);

const loadClassifier = () =>
  pipeline("zero-shot-classification", AUTO_TAG_MODEL, {
    dtype: "q8",
    device: "wasm",
    revision: AUTO_TAG_MODEL_REVISION,
    progress_callback: (progress) => {
      if (
        progress.status === "progress" &&
        Number.isFinite(progress.progress)
      ) {
        send({
          type: "progress",
          message: `Downloading model: ${Math.round(progress.progress)}% (${progress.file})`,
        });
      }
    },
  });
let classifier: ReturnType<typeof loadClassifier> | null = null;

self.onmessage = async (event: MessageEvent<AutoTagWorkerRequest>) => {
  try {
    if (!classifier)
      send({ type: "progress", message: "Loading on-device model…" });
    classifier ??= loadClassifier();
    const model = await classifier;
    const { entries, candidates } = event.data;
    const results: Array<{ date: string; tags: string[] }> = [];
    for (const entry of entries) {
      const tags = new Set<string>();
      const chunks = entryChunks(entry.text);
      let lastProgress = 0;
      for (const [chunkIndex, chunk] of chunks.entries()) {
        for (const [candidateIndex, candidate] of candidates.entries()) {
          if (tags.has(candidate.type)) continue;
          const now = performance.now();
          if (candidateIndex === 0 || now - lastProgress >= 300) {
            send({
              type: "progress",
              message: `Passage ${chunkIndex + 1}/${chunks.length}, activity ${candidateIndex + 1}/${candidates.length}`,
            });
            lastProgress = now;
          }
          const raw: unknown = await model(chunk, [candidate.label], {
            multi_label: true,
            hypothesis_template: AUTO_TAG_HYPOTHESIS,
          });
          const result = parseModelClassification(raw);
          if (!result) throw new Error("Invalid model classification");
          for (const tag of tagsFromScores(result, [candidate])) tags.add(tag);
        }
      }
      results.push({ date: entry.date, tags: [...tags] });
    }
    send({ type: "result", entries: results });
  } catch (error) {
    reportError("autoTags.worker", error);
    send({
      type: "error",
      message:
        "Could not load or run the model. Check your connection and retry.",
    });
  }
};
