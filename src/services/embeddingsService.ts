export interface EmbeddingsService {
  isReady(): boolean;
  isLoading(): boolean;
  embed(texts: string[]): Promise<Float32Array[]>;
  init(): Promise<void>;
  dispose(): void;
}

type Status = "idle" | "loading" | "ready" | "error";

interface PendingRequest {
  resolve: (value: Float32Array[]) => void;
  reject: (reason: unknown) => void;
}

// ---------- Singleton accessor ----------

let _singleton: EmbeddingsService | null = null;

export function getEmbeddingsService(): EmbeddingsService {
  if (!_singleton) {
    _singleton = createEmbeddingsService();
  }
  return _singleton;
}

export function resetEmbeddingsService(): void {
  _singleton = null;
}

// ---------- Factory ----------

export function createEmbeddingsService(): EmbeddingsService {
  let worker: Worker | null = null;
  let status: Status = "idle";
  let nextId = 1;
  let initPromise: Promise<void> | null = null;
  let initResolve: (() => void) | null = null;
  let initReject: ((reason: unknown) => void) | null = null;
  const pending = new Map<number, PendingRequest>();

  function rejectAllPending(reason: Error) {
    for (const [, req] of pending) {
      req.reject(reason);
    }
    pending.clear();
  }

  function handleMessage(e: MessageEvent) {
    const msg = e.data;

    if (msg.type === "ready") {
      status = "ready";
      initResolve?.();
      initResolve = null;
      initReject = null;
    }

    if (msg.type === "error") {
      if (status === "loading" && initReject) {
        status = "error";
        initReject(new Error(msg.error));
        initResolve = null;
        initReject = null;
      } else if (msg.id != null) {
        const req = pending.get(msg.id);
        if (req) {
          pending.delete(msg.id);
          req.reject(new Error(msg.error));
        }
      } else {
        console.error("[embeddingsService] worker error:", msg.error);
      }
    }

    if (msg.type === "embeddings") {
      const req = pending.get(msg.id);
      if (req) {
        pending.delete(msg.id);
        const vectors = (msg.vectors as ArrayBuffer[]).map((buf) => new Float32Array(buf));
        req.resolve(vectors);
      }
    }
  }

  function handleWorkerError(evt: ErrorEvent) {
    evt.preventDefault();
    const errorMsg = evt.message || "Worker failed to load";
    const err = new Error(errorMsg);

    if (status === "loading" && initReject) {
      status = "error";
      initReject(err);
      initResolve = null;
      initReject = null;
    }

    rejectAllPending(err);
  }

  return {
    isReady() {
      return status === "ready";
    },

    isLoading() {
      return status === "loading";
    },

    init() {
      if (status === "ready") return Promise.resolve();
      if (status === "loading" && initPromise) return initPromise;

      status = "loading";
      // @ts-ignore TS1343: import.meta.url valid in Vite but not Jest CommonJS
      worker = new Worker(new URL("../workers/embeddings.worker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleWorkerError);

      initPromise = new Promise<void>((resolve, reject) => {
        initResolve = resolve;
        initReject = reject;
        worker!.postMessage({ type: "init" });
      });

      return initPromise;
    },

    embed(texts: string[]): Promise<Float32Array[]> {
      if (status !== "ready" || !worker) {
        return Promise.reject(new Error("Model not ready"));
      }

      const id = nextId++;
      return new Promise<Float32Array[]>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker!.postMessage({ type: "embed", id, texts });
      });
    },

    dispose() {
      if (worker) {
        worker.terminate();
        worker = null;
      }

      rejectAllPending(new Error("Service disposed"));

      initReject?.(new Error("Service disposed"));
      initResolve = null;
      initReject = null;
      initPromise = null;

      status = "idle";
    },
  };
}
