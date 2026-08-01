export interface CrawlCacheMetadata {
  url: string;
  fetchedAt: string;
  expiresAt: string;
  etag: string | null;
  lastModified: string | null;
  contentChecksum: string | null;
  httpStatus: number | null;
  contentType: string | null;
  robotsStatus: "allowed" | "denied" | "unavailable" | null;
  extractionPolicyVersion: string;
}

export class CrawlMetadataCache {
  readonly #entries = new Map<string, CrawlCacheMetadata>();
  readonly #maximumEntries: number;

  constructor(maximumEntries = 10_000) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 1 || maximumEntries > 1_000_000) {
      throw new Error("Crawl cache maximum entries must be between 1 and 1000000");
    }
    this.#maximumEntries = maximumEntries;
  }

  get(url: string, now = new Date()): CrawlCacheMetadata | null {
    const value = this.#entries.get(url);
    if (!value) return null;
    if (Date.parse(value.expiresAt) <= now.getTime()) {
      this.#entries.delete(url);
      return null;
    }
    return { ...value };
  }

  put(metadata: CrawlCacheMetadata): void {
    if (!Number.isFinite(Date.parse(metadata.fetchedAt)) || !Number.isFinite(Date.parse(metadata.expiresAt))) {
      throw new Error("Crawl cache timestamps must be valid ISO-compatible values");
    }
    const previous = this.#entries.get(metadata.url);
    const retained = metadata.contentChecksum === null && previous?.contentChecksum
      ? {
          ...metadata,
          contentChecksum: previous.contentChecksum,
          etag: metadata.etag ?? previous.etag,
          lastModified: metadata.lastModified ?? previous.lastModified,
        }
      : metadata;
    this.#entries.delete(metadata.url);
    this.#entries.set(metadata.url, { ...retained });
    while (this.#entries.size > this.#maximumEntries) {
      const oldest = this.#entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#entries.delete(oldest);
    }
  }

  get size(): number {
    return this.#entries.size;
  }
}
