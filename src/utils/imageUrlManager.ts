import type { ImageRepository } from "../storage/imageRepository";

type UrlKind = "blob" | "remote";

interface UrlEntry {
  url: string;
  kind: UrlKind;
  owners: Set<string>;
  expiresAt?: number;
}

const DEFAULT_REMOTE_TTL_MS = 50 * 60 * 1000;

export class ImageUrlManager {
  private repository: ImageRepository;
  private urlCache = new Map<string, UrlEntry>();
  private ownerMap = new Map<string, Set<string>>();
  private inFlight = new Map<string, Promise<string | null>>();
  private remoteTtlMs: number;

  constructor(repository: ImageRepository, options?: { remoteTtlMs?: number }) {
    this.repository = repository;
    this.remoteTtlMs = options?.remoteTtlMs ?? DEFAULT_REMOTE_TTL_MS;
  }

  async acquireUrl(imageId: string, ownerId: string): Promise<string | null> {
    const cached = this.urlCache.get(imageId);
    if (cached) {
      if (!this.isExpired(cached)) {
        this.trackOwner(imageId, ownerId);
        return cached.url;
      }
      this.urlCache.delete(imageId);
    }

    if (this.inFlight.has(imageId)) {
      const url = await this.inFlight.get(imageId)!;
      if (url) {
        this.trackOwner(imageId, ownerId);
      }
      return url;
    }

    const request = this.resolveUrl(imageId)
      .then((entry) => {
        if (!entry) {
          return null;
        }
        this.urlCache.set(imageId, entry);
        this.trackOwner(imageId, ownerId);
        return entry.url;
      })
      .finally(() => {
        this.inFlight.delete(imageId);
      });

    this.inFlight.set(imageId, request);
    return request;
  }

  releaseImage(imageId: string, ownerId: string): void {
    const owners = this.ownerMap.get(ownerId);
    if (owners) {
      owners.delete(imageId);
      if (!owners.size) {
        this.ownerMap.delete(ownerId);
      }
    }
    this.dropOwnerFromEntry(imageId, ownerId);
  }

  releaseOwner(ownerId: string): void {
    const owners = this.ownerMap.get(ownerId);
    if (!owners) return;
    owners.forEach((imageId) => {
      this.dropOwnerFromEntry(imageId, ownerId);
    });
    this.ownerMap.delete(ownerId);
  }

  private async resolveUrl(imageId: string): Promise<UrlEntry | null> {
    const remoteUrlResult = await this.repository.getUrl(imageId);
    if (remoteUrlResult.ok && remoteUrlResult.value) {
      return {
        url: remoteUrlResult.value,
        kind: "remote",
        owners: new Set(),
        expiresAt: Date.now() + this.remoteTtlMs,
      };
    }

    const blobResult = await this.repository.get(imageId);
    if (!blobResult.ok || !blobResult.value) {
      return null;
    }

    return {
      url: URL.createObjectURL(blobResult.value),
      kind: "blob",
      owners: new Set(),
    };
  }

  private trackOwner(imageId: string, ownerId: string): void {
    const entry = this.urlCache.get(imageId);
    if (entry) {
      entry.owners.add(ownerId);
    }
    if (!this.ownerMap.has(ownerId)) {
      this.ownerMap.set(ownerId, new Set());
    }
    this.ownerMap.get(ownerId)!.add(imageId);
  }

  private dropOwnerFromEntry(imageId: string, ownerId: string): void {
    const entry = this.urlCache.get(imageId);
    if (!entry) return;
    entry.owners.delete(ownerId);
    if (entry.owners.size) return;
    if (entry.kind === "blob") {
      URL.revokeObjectURL(entry.url);
    }
    this.urlCache.delete(imageId);
  }

  private isExpired(entry: UrlEntry): boolean {
    if (entry.kind !== "remote" || !entry.expiresAt) {
      return false;
    }
    return Date.now() > entry.expiresAt;
  }
}
