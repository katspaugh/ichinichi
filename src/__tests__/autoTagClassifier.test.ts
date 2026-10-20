// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { AutoTagClassifier } from "../services/autoTagClassifier";
import {
  getAutoTagsEnabled,
  setAutoTagsEnabled,
} from "../services/autoTagPreferences";
import {
  parseAutoTagWorkerMessage,
  parseModelClassification,
} from "../storage/parsers";

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  respond(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}
const candidates = [{ type: "trumpet", label: "played the trumpet" }];
const note = { date: "20-10-2026", content: "<p>Trumpet practice</p>" };

// Worker is an injected test double; no model downloads occur in unit tests.
function setup() {
  const worker = new FakeWorker();
  const create = vi.fn(() => worker as unknown as Worker);
  return { worker, create, classifier: new AutoTagClassifier(create) };
}

describe("opt-in model lifecycle", () => {
  it("defaults off and persists an explicit opt-in", () => {
    localStorage.clear();
    expect(getAutoTagsEnabled()).toBe(false);
    setAutoTagsEnabled(true);
    expect(getAutoTagsEnabled()).toBe(true);
    setAutoTagsEnabled(false);
    expect(getAutoTagsEnabled()).toBe(false);
  });
  it("does not create a worker until asked to classify; reuses unchanged results", async () => {
    const { worker, create, classifier } = setup();
    expect(create).not.toHaveBeenCalled();
    const pending = classifier.classify(
      [note],
      candidates,
      new AbortController().signal,
      () => {},
    );
    worker.respond({
      type: "result",
      entries: [{ date: note.date, tags: ["trumpet"] }],
    });
    expect((await pending).get(note.date)).toEqual(["trumpet"]);
    await classifier.classify(
      [note],
      candidates,
      new AbortController().signal,
      () => {},
    );
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    classifier.dispose();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("terminates actual inference on cancellation and rejects late results", async () => {
    const { worker, classifier } = setup();
    const controller = new AbortController();
    const pending = classifier.classify(
      [note],
      candidates,
      controller.signal,
      () => {},
    );
    controller.abort();
    worker.respond({
      type: "result",
      entries: [{ date: note.date, tags: ["trumpet"] }],
    });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("reclassifies edited entries and evicts deleted dates", async () => {
    const { worker, classifier } = setup();
    const initial = classifier.classify(
      [note],
      candidates,
      new AbortController().signal,
      () => {},
    );
    worker.respond({
      type: "result",
      entries: [{ date: note.date, tags: ["trumpet"] }],
    });
    await initial;
    const edited = classifier.classify(
      [{ ...note, content: "Quiet day" }],
      candidates,
      new AbortController().signal,
      () => {},
    );
    worker.respond({
      type: "result",
      entries: [{ date: note.date, tags: [] }],
    });
    expect((await edited).get(note.date)).toEqual([]);
    expect(
      (
        await classifier.classify(
          [],
          candidates,
          new AbortController().signal,
          () => {},
        )
      ).size,
    ).toBe(0);
  });
  it("rejects worker errors and allows retry with a fresh worker", async () => {
    const { worker, create, classifier } = setup();
    const pending = classifier.classify(
      [note],
      candidates,
      new AbortController().signal,
      () => {},
    );
    worker.respond({ type: "error", message: "Download failed" });
    await expect(pending).rejects.toThrow("Download failed");
    const retry = classifier.classify(
      [note],
      candidates,
      new AbortController().signal,
      () => {},
    );
    worker.respond({
      type: "result",
      entries: [{ date: note.date, tags: [] }],
    });
    await retry;
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("validates model and worker payloads", () => {
    expect(
      parseModelClassification({ labels: ["trumpet"], scores: [NaN] }),
    ).toBeNull();
    expect(
      parseModelClassification({ labels: ["trumpet"], scores: [] }),
    ).toBeNull();
    expect(
      parseAutoTagWorkerMessage({
        type: "result",
        entries: [{ date: note.date, tags: [3] }],
      }),
    ).toBeNull();
  });
});
