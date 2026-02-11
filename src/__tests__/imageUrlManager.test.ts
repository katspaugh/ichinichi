import { ImageUrlManager } from "../utils/imageUrlManager";
import type { ImageRepository } from "../storage/imageRepository";
import { ok, err } from "../domain/result";

function createMockRepository(overrides?: Partial<ImageRepository>): ImageRepository {
  return {
    upload: jest.fn(),
    get: jest.fn().mockResolvedValue(ok(null)),
    getUrl: jest.fn().mockResolvedValue(ok(null)),
    delete: jest.fn(),
    getByNoteDate: jest.fn(),
    deleteByNoteDate: jest.fn(),
    ...overrides,
  };
}

// Mock URL.createObjectURL / revokeObjectURL
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();

beforeAll(() => {
  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateObjectURL.mockReturnValue("blob:test-url");
});

describe("ImageUrlManager", () => {
  describe("acquireUrl", () => {
    it("returns remote URL when repository provides one", async () => {
      const repo = createMockRepository({
        getUrl: jest.fn().mockResolvedValue(ok("https://signed.url/image.jpg")),
      });
      const manager = new ImageUrlManager(repo);

      const url = await manager.acquireUrl("img-1", "owner-a");

      expect(url).toBe("https://signed.url/image.jpg");
      expect(repo.getUrl).toHaveBeenCalledWith("img-1");
      expect(repo.get).not.toHaveBeenCalled();
    });

    it("falls back to blob URL when no remote URL", async () => {
      const blob = new Blob(["pixels"], { type: "image/png" });
      const repo = createMockRepository({
        getUrl: jest.fn().mockResolvedValue(ok(null)),
        get: jest.fn().mockResolvedValue(ok(blob)),
      });
      mockCreateObjectURL.mockReturnValue("blob:local-url");
      const manager = new ImageUrlManager(repo);

      const url = await manager.acquireUrl("img-2", "owner-a");

      expect(url).toBe("blob:local-url");
      expect(repo.getUrl).toHaveBeenCalledWith("img-2");
      expect(repo.get).toHaveBeenCalledWith("img-2");
      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
    });

    it("returns null when image not found anywhere", async () => {
      const repo = createMockRepository({
        getUrl: jest.fn().mockResolvedValue(ok(null)),
        get: jest.fn().mockResolvedValue(ok(null)),
      });
      const manager = new ImageUrlManager(repo);

      const url = await manager.acquireUrl("img-missing", "owner-a");

      expect(url).toBeNull();
    });

    it("returns null when getUrl returns error", async () => {
      const repo = createMockRepository({
        getUrl: jest.fn().mockResolvedValue(err({ type: "IO", message: "fail" })),
        get: jest.fn().mockResolvedValue(ok(null)),
      });
      const manager = new ImageUrlManager(repo);

      const url = await manager.acquireUrl("img-err", "owner-a");

      expect(url).toBeNull();
    });

    it("caches URL across multiple acquires", async () => {
      const repo = createMockRepository({
        getUrl: jest.fn().mockResolvedValue(ok("https://signed.url/cached")),
      });
      const manager = new ImageUrlManager(repo);

      const url1 = await manager.acquireUrl("img-c", "owner-a");
      const url2 = await manager.acquireUrl("img-c", "owner-b");

      expect(url1).toBe("https://signed.url/cached");
      expect(url2).toBe("https://signed.url/cached");
      // Only fetched once
      expect(repo.getUrl).toHaveBeenCalledTimes(1);
    });

    it("evicts expired remote URL and refetches", async () => {
      const repo = createMockRepository({
        getUrl: jest
          .fn()
          .mockResolvedValueOnce(ok("https://signed.url/first"))
          .mockResolvedValueOnce(ok("https://signed.url/second")),
      });
      // Use a very short TTL
      const manager = new ImageUrlManager(repo, { remoteTtlMs: 1 });

      const url1 = await manager.acquireUrl("img-e", "owner-a");
      expect(url1).toBe("https://signed.url/first");

      // Wait for expiry
      await new Promise((r) => setTimeout(r, 10));

      const url2 = await manager.acquireUrl("img-e", "owner-a");
      expect(url2).toBe("https://signed.url/second");
      expect(repo.getUrl).toHaveBeenCalledTimes(2);
    });

    it("blob URLs never expire", async () => {
      const blob = new Blob(["data"], { type: "image/png" });
      const repo = createMockRepository({
        getUrl: jest.fn().mockResolvedValue(ok(null)),
        get: jest.fn().mockResolvedValue(ok(blob)),
      });
      mockCreateObjectURL.mockReturnValue("blob:stable");
      const manager = new ImageUrlManager(repo, { remoteTtlMs: 1 });

      await manager.acquireUrl("img-b", "owner-a");
      await new Promise((r) => setTimeout(r, 10));
      const url2 = await manager.acquireUrl("img-b", "owner-a");

      expect(url2).toBe("blob:stable");
      // Only resolved once
      expect(repo.get).toHaveBeenCalledTimes(1);
    });

    it("deduplicates concurrent in-flight requests", async () => {
      let resolveGetUrl: (v: unknown) => void;
      const repo = createMockRepository({
        getUrl: jest.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveGetUrl = resolve;
            }),
        ),
      });
      const manager = new ImageUrlManager(repo);

      const p1 = manager.acquireUrl("img-d", "owner-a");
      const p2 = manager.acquireUrl("img-d", "owner-b");

      // Only one request in flight
      expect(repo.getUrl).toHaveBeenCalledTimes(1);

      resolveGetUrl!(ok("https://signed.url/deduped"));
      const [url1, url2] = await Promise.all([p1, p2]);

      expect(url1).toBe("https://signed.url/deduped");
      expect(url2).toBe("https://signed.url/deduped");
    });
  });

  describe("releaseImage", () => {
    it("revokes blob URL when last owner releases", async () => {
      const blob = new Blob(["data"], { type: "image/png" });
      const repo = createMockRepository({
        getUrl: jest.fn().mockResolvedValue(ok(null)),
        get: jest.fn().mockResolvedValue(ok(blob)),
      });
      mockCreateObjectURL.mockReturnValue("blob:revocable");
      const manager = new ImageUrlManager(repo);

      await manager.acquireUrl("img-r", "owner-a");
      manager.releaseImage("img-r", "owner-a");

      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:revocable");
    });

    it("does not revoke blob URL when other owners remain", async () => {
      const blob = new Blob(["data"], { type: "image/png" });
      const repo = createMockRepository({
        getUrl: jest.fn().mockResolvedValue(ok(null)),
        get: jest.fn().mockResolvedValue(ok(blob)),
      });
      mockCreateObjectURL.mockReturnValue("blob:shared");
      const manager = new ImageUrlManager(repo);

      await manager.acquireUrl("img-s", "owner-a");
      await manager.acquireUrl("img-s", "owner-b");
      manager.releaseImage("img-s", "owner-a");

      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    });

    it("does not revoke remote URLs", async () => {
      const repo = createMockRepository({
        getUrl: jest.fn().mockResolvedValue(ok("https://signed.url/remote")),
      });
      const manager = new ImageUrlManager(repo);

      await manager.acquireUrl("img-rm", "owner-a");
      manager.releaseImage("img-rm", "owner-a");

      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    });
  });

  describe("releaseOwner", () => {
    it("releases all images owned by a given owner", async () => {
      const blob = new Blob(["data"], { type: "image/png" });
      const repo = createMockRepository({
        getUrl: jest.fn().mockResolvedValue(ok(null)),
        get: jest.fn().mockResolvedValue(ok(blob)),
      });
      let counter = 0;
      mockCreateObjectURL.mockImplementation(() => `blob:url-${++counter}`);
      const manager = new ImageUrlManager(repo);

      await manager.acquireUrl("img-1", "component-a");
      await manager.acquireUrl("img-2", "component-a");
      manager.releaseOwner("component-a");

      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it("does not revoke images shared with other owners", async () => {
      const blob = new Blob(["data"], { type: "image/png" });
      const repo = createMockRepository({
        getUrl: jest.fn().mockResolvedValue(ok(null)),
        get: jest.fn().mockResolvedValue(ok(blob)),
      });
      mockCreateObjectURL.mockReturnValue("blob:shared");
      const manager = new ImageUrlManager(repo);

      await manager.acquireUrl("img-shared", "component-a");
      await manager.acquireUrl("img-shared", "component-b");
      manager.releaseOwner("component-a");

      // Still held by component-b
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    });

    it("is a no-op for unknown owner", () => {
      const repo = createMockRepository();
      const manager = new ImageUrlManager(repo);

      // Should not throw
      manager.releaseOwner("nonexistent");
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    });
  });
});
