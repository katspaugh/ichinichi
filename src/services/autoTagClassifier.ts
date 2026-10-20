import type {
  AutoTagEntry,
  ActivityCandidate,
  AutoTagWorkerRequest,
  AutoTagCheckpoint,
  AutoTagCheckpointStore,
} from "../types/autoTags";
import { parseAutoTagWorkerMessage } from "../storage/parsers";
import { encodeUtf8 } from "../storage/cryptoUtils";
import { reportError } from "../utils/errorReporter";
import {
  entryText,
  AUTO_TAG_MODEL,
  AUTO_TAG_MODEL_REVISION,
  AUTO_TAG_HYPOTHESIS,
} from "../utils/autoTags";

/** One worker per open repository/year, with independently saved entry results. */
export class AutoTagClassifier {
  private worker: Worker | null = null;
  private cache = new Map<string, AutoTagCheckpoint>();
  private restored = false;
  private createWorker: () => Worker;
  private checkpoints?: AutoTagCheckpointStore;
  constructor(
    createWorker: () => Worker = () =>
      new Worker(new URL("../workers/autoTags.worker.ts", import.meta.url), {
        type: "module",
      }),
    checkpoints?: AutoTagCheckpointStore,
  ) {
    this.createWorker = createWorker;
    this.checkpoints = checkpoints;
  }

  async classify(
    entries: AutoTagEntry[],
    candidates: ActivityCandidate[],
    signal: AbortSignal,
    progress: (message: string) => void,
    partial: (tags: Map<string, string[]>) => void = () => {},
  ): Promise<Map<string, string[]>> {
    signal.throwIfAborted();
    if (!this.restored) {
      const records = (await this.checkpoints?.load()) ?? [];
      signal.throwIfAborted();
      this.cache = new Map(records.map((record) => [record.date, record]));
      this.restored = true;
    }
    const signature = JSON.stringify([
      2,
      AUTO_TAG_MODEL,
      AUTO_TAG_MODEL_REVISION,
      AUTO_TAG_HYPOTHESIS,
      candidates,
    ]);
    const pending: Array<{ entry: AutoTagEntry; fingerprint: string }> = [];
    const tags = new Map<string, string[]>();
    const dates = new Set(entries.map(({ date }) => date));
    for (const date of this.cache.keys())
      if (!dates.has(date)) this.cache.delete(date);
    for (const entry of entries) {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        encodeUtf8(JSON.stringify([signature, entry.content])),
      );
      signal.throwIfAborted();
      const fingerprint = Array.from(new Uint8Array(bytes), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const cached = this.cache.get(entry.date);
      if (cached?.fingerprint === fingerprint)
        tags.set(entry.date, cached.tags);
      else {
        this.cache.delete(entry.date);
        pending.push({ entry, fingerprint });
      }
    }
    partial(new Map(tags));
    for (const { entry, fingerprint } of pending) {
      signal.throwIfAborted();
      const prefix = `Analyzing entries: ${tags.size + 1} of ${entries.length}`;
      progress(prefix);
      const results = await this.run(
        {
          entries: [{ date: entry.date, text: entryText(entry.content) }],
          candidates,
        },
        signal,
        (message) => progress(`${prefix}\n${message}`),
      );
      signal.throwIfAborted();
      const result = results.find(({ date }) => date === entry.date);
      if (!result) throw new Error("Incomplete model response");
      this.cache.set(entry.date, {
        date: entry.date,
        fingerprint,
        tags: result.tags,
      });
      await this.checkpoints?.save([...this.cache.values()], signal);
      signal.throwIfAborted();
      tags.set(entry.date, result.tags);
      partial(new Map(tags));
      progress(`Analyzed ${tags.size} of ${entries.length} entries`);
    }
    // Also persist pruning/deletions and retry any previously failed checkpoint write.
    await this.checkpoints?.save([...this.cache.values()], signal);
    signal.throwIfAborted();
    return tags;
  }

  private run(
    request: AutoTagWorkerRequest,
    signal: AbortSignal,
    progress: (message: string) => void,
  ): Promise<Array<{ date: string; tags: string[] }>> {
    this.worker ??= this.createWorker();
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        clearTimeout(timeout);
        worker.onmessage = null;
        worker.onerror = null;
        signal.removeEventListener("abort", abort);
      };
      const fail = (error: Error) => {
        cleanup();
        this.stopWorker();
        reject(error);
      };
      const watch = () => {
        clearTimeout(timeout);
        timeout = setTimeout(
          () =>
            fail(
              new Error(
                "Activity analysis timed out. Progress is saved; retry to continue.",
              ),
            ),
          120_000,
        );
      };
      const abort = () => fail(new DOMException("Cancelled", "AbortError"));
      worker.onmessage = (event: MessageEvent<unknown>) => {
        const message = parseAutoTagWorkerMessage(event.data);
        if (!message) {
          fail(new Error("Invalid model response"));
          return;
        }
        if (message.type === "progress") {
          watch();
          progress(message.message);
        } else if (message.type === "error") fail(new Error(message.message));
        else {
          cleanup();
          resolve(message.entries);
        }
      };
      worker.onerror = () =>
        fail(new Error("Unable to start the on-device model."));
      signal.addEventListener("abort", abort, { once: true });
      watch();
      try {
        worker.postMessage(request);
      } catch (error) {
        reportError("autoTags.worker.post", error);
        fail(
          error instanceof Error
            ? error
            : new Error("Unable to send entry to model"),
        );
      }
    });
  }
  private stopWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
  dispose(): void {
    this.stopWorker();
    this.cache.clear();
    this.restored = false;
  }
}
