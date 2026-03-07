/// <reference lib="webworker" />

import { env, pipeline, type FeatureExtractionPipeline, type PretrainedModelOptions } from "@huggingface/transformers";

// Serve model files from /models/ instead of fetching from huggingface.co
env.localModelPath = "/models/";
env.allowLocalModels = true;
env.allowRemoteModels = false;

const MODEL_NAME = "all-MiniLM-L6-v2";

// Cast to a narrow signature to avoid TS2590 ("union type too complex")
// produced by the generic AllTasks[T] return type of pipeline().
const loadPipeline = pipeline as (
  task: "feature-extraction",
  model: string,
  options?: PretrainedModelOptions,
) => Promise<FeatureExtractionPipeline>;

let pipe: FeatureExtractionPipeline | null = null;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === "init") {
    try {
      pipe = await loadPipeline("feature-extraction", MODEL_NAME, {
        progress_callback: (p: { status: string; progress?: number }) => {
          self.postMessage({ type: "progress", status: p.status, progress: p.progress ?? 0 });
        },
      });
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (msg.type === "embed") {
    if (!pipe) {
      self.postMessage({ type: "error", id: msg.id, error: "Model not loaded" });
      return;
    }
    try {
      const output = await pipe(msg.texts, { pooling: "mean", normalize: true });
      const data = output.tolist() as number[][];
      const buffers: ArrayBuffer[] = data.map((row) => {
        const f32 = new Float32Array(row);
        return f32.buffer as ArrayBuffer;
      });
      self.postMessage({ type: "embeddings", id: msg.id, vectors: buffers }, buffers);
    } catch (err) {
      self.postMessage({ type: "error", id: msg.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
};

export {};
