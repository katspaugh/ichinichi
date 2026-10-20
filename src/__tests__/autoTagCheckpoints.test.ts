// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedAutoTagCache } from "../storage/autoTagCache";
import { AutoTagClassifier } from "../services/autoTagClassifier";
import { entryChunks } from "../utils/autoTags";

describe("resumable activity analysis", () => {
  beforeEach(() => localStorage.clear());
  it("encrypts checkpoints and restores them only with the same vault key and scope", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const store = new EncryptedAutoTagCache("account/year", key);
    const records = [
      { date: "20-10-2026", fingerprint: "a".repeat(64), tags: ["trumpet"] },
    ];
    await store.save(records, new AbortController().signal);
    expect(JSON.stringify(localStorage)).not.toContain("trumpet");
    expect(JSON.stringify(localStorage)).not.toContain("20-10-2026");
    expect(await new EncryptedAutoTagCache("account/year", key).load()).toEqual(
      records,
    );
    expect(
      await new EncryptedAutoTagCache("another-account/year", key).load(),
    ).toEqual([]);
  });
  it("resumes after a reload from the first unfinished entry and publishes completed results immediately", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const store = new EncryptedAutoTagCache("resume", key);
    const worker = {
      onmessage: null as null | ((event: MessageEvent) => void),
      onerror: null,
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };
    const factory = () => worker as unknown as Worker;
    const first = new AutoTagClassifier(factory, store);
    const entries = [
      { date: "19-10-2026", content: "Played trumpet" },
      { date: "20-10-2026", content: "Meditated" },
    ];
    const candidates = [{ type: "trumpet", label: "played trumpet" }];
    const controller = new AbortController();
    const partial = vi.fn();
    const pending = first.classify(
      entries,
      candidates,
      controller.signal,
      vi.fn(),
      partial,
    );
    const stopped = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1));
    worker.onmessage!(
      new MessageEvent("message", {
        data: {
          type: "result",
          entries: [{ date: entries[0].date, tags: ["trumpet"] }],
        },
      }),
    );
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(2));
    expect(partial).toHaveBeenCalledWith(
      new Map([[entries[0].date, ["trumpet"]]]),
    );
    controller.abort();
    await stopped;
    first.dispose();
    worker.postMessage.mockClear();
    const reloaded = new AutoTagClassifier(
      factory,
      new EncryptedAutoTagCache("resume", key),
    );
    const resumed = reloaded.classify(
      entries,
      candidates,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1));
    expect(
      worker.postMessage.mock.calls[0][0].entries.map(
        (entry: { date: string }) => entry.date,
      ),
    ).toEqual([entries[1].date]);
    worker.onmessage!(
      new MessageEvent("message", {
        data: {
          type: "result",
          entries: [{ date: entries[1].date, tags: [] }],
        },
      }),
    );
    expect((await resumed).get(entries[0].date)).toEqual(["trumpet"]);
    reloaded.dispose();
    const noWorker = vi.fn();
    const complete = new AutoTagClassifier(
      noWorker,
      new EncryptedAutoTagCache("resume", key),
    );
    expect(
      (
        await complete.classify(
          entries,
          candidates,
          new AbortController().signal,
          vi.fn(),
        )
      ).size,
    ).toBe(2);
    expect(noWorker).not.toHaveBeenCalled();
  });
  it("packs sentences into bounded passages instead of running the model for every sentence", () => {
    const text = Array.from({ length: 40 }, () => "This is a sentence.").join(
      " ",
    );
    const chunks = entryChunks(text);
    expect(chunks.length).toBeLessThan(4);
    expect(chunks.join(" ")).toBe(text);
    expect(chunks.every((chunk) => chunk.split(/\s+/).length <= 100)).toBe(
      true,
    );
  });
});
