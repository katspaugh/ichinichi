import type {
  AutoTagEntry,
  ActivityCandidate,
  AutoTagWorkerRequest,
} from "../types/autoTags";
import { parseAutoTagWorkerMessage } from "../storage/parsers";
import { entryText } from "../utils/autoTags";

/** One worker per open repository. No note text or predictions persist to disk. */
export class AutoTagClassifier {
  private worker: Worker | null = null;
  private cache = new Map<string, { content: string; tags: string[] }>();
  private labels = "";

  private createWorker: () => Worker;
  constructor(
    createWorker: () => Worker = () =>
      new Worker(new URL("../workers/autoTags.worker.ts", import.meta.url), {
        type: "module",
      }),
  ) {
    this.createWorker = createWorker;
  }

  async classify(
    entries: AutoTagEntry[],
    candidates: ActivityCandidate[],
    signal: AbortSignal,
    progress: (message: string) => void,
  ): Promise<Map<string, string[]>> {
    signal.throwIfAborted();
    const labels = JSON.stringify(candidates);
    if (labels !== this.labels) {
      this.cache.clear();
      this.labels = labels;
    }
    const dates = new Set(entries.map(({ date }) => date));
    for (const date of this.cache.keys())
      if (!dates.has(date)) this.cache.delete(date);
    const pending = entries.filter(
      (entry) => this.cache.get(entry.date)?.content !== entry.content,
    );
    // Always initialize on first opt-in, including an empty journal.
    if (pending.length > 0 || !this.worker) {
      this.worker ??= this.createWorker();
      const worker = this.worker;
      const results = await new Promise<
        Array<{ date: string; tags: string[] }>
      >((resolve, reject) => {
        const cleanup = () => {
          worker.onmessage = null;
          worker.onerror = null;
          signal.removeEventListener("abort", abort);
        };
        const abort = () => {
          cleanup();
          this.stopWorker(); // Cancels downloads/inference, not just React updates.
          reject(new DOMException("Cancelled", "AbortError"));
        };
        worker.onmessage = (event: MessageEvent<unknown>) => {
          const message = parseAutoTagWorkerMessage(event.data);
          if (!message) {
            cleanup();
            this.stopWorker();
            reject(new Error("Invalid model response"));
            return;
          }
          if (message.type === "progress") progress(message.message);
          else if (message.type === "error") {
            cleanup();
            this.stopWorker();
            reject(new Error(message.message));
          } else {
            cleanup();
            resolve(message.entries);
          }
        };
        worker.onerror = () => {
          cleanup();
          this.stopWorker();
          reject(new Error("Unable to start the on-device model."));
        };
        signal.addEventListener("abort", abort, { once: true });
        const request: AutoTagWorkerRequest = {
          entries: pending.map(({ date, content }) => ({
            date,
            text: entryText(content),
          })),
          candidates,
        };
        worker.postMessage(request);
      });
      signal.throwIfAborted();
      for (const entry of pending) {
        const result = results.find(({ date }) => date === entry.date);
        if (!result) throw new Error("Incomplete model response");
        this.cache.set(entry.date, {
          content: entry.content,
          tags: result.tags,
        });
      }
    }
    return new Map(
      entries.map(({ date }) => [date, this.cache.get(date)?.tags ?? []]),
    );
  }

  private stopWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
  dispose(): void {
    this.stopWorker();
    this.cache.clear();
  }
}
