export const CRAWL_POLICY_VERSION = "website-crawl-1.0.0";
export const EXTRACTION_POLICY_VERSION = "website-extraction-1.0.0";

export type ConfidenceCategory = "high" | "medium" | "low";

export interface EvidenceValue<T> {
  value: T;
  pageUrl: string;
  extractionMethod: "html" | "json_ld" | "http" | "robots";
  selector: string | null;
  structuredDataPath: string | null;
  observedAt: string;
  fetchedAt: string;
  contentChecksum: string;
  extractionPolicyVersion: string;
  confidence: ConfidenceCategory;
}

export type FetchErrorCode =
  | "invalid_url"
  | "unsupported_scheme"
  | "credentials_rejected"
  | "hostname_rejected"
  | "port_rejected"
  | "destination_blocked"
  | "dns_failure"
  | "dns_rebinding"
  | "connection_timeout"
  | "response_timeout"
  | "connection_failure"
  | "redirect_limit"
  | "redirect_loop"
  | "redirect_invalid"
  | "unsupported_content_type"
  | "compressed_size_exceeded"
  | "decompressed_size_exceeded"
  | "authentication_required"
  | "rate_limited"
  | "server_failure"
  | "cancelled"
  | "policy_rejected";

export interface RedirectHop {
  fromUrl: string;
  toUrl: string;
  status: number;
}

export interface FetchFailure {
  ok: false;
  requestedUrl: string;
  finalUrl: string | null;
  errorCode: FetchErrorCode;
  retryable: boolean;
  attempts: number;
  redirectHistory: ReadonlyArray<RedirectHop>;
  fetchedAt: string;
  httpStatus: number | null;
}

export interface FetchSuccess {
  ok: true;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  compressedBytes: number;
  decompressedBytes: number;
  contentChecksum: string;
  etag: string | null;
  lastModified: string | null;
  redirectHistory: ReadonlyArray<RedirectHop>;
  fetchedAt: string;
  attempts: number;
}

export type FetchResult = FetchSuccess | FetchFailure;

export interface FetchRequest {
  url: string;
  signal?: AbortSignal;
  ifNoneMatch?: string | null;
  ifModifiedSince?: string | null;
}

export type FetcherSourceClass =
  | "synthetic_fixture"
  | "test_loopback"
  | "public_web";

export interface SafeFetcher {
  readonly sourceClass: FetcherSourceClass;
  fetch(request: FetchRequest): Promise<FetchResult>;
}

export interface CrawlLimits {
  maxPages: number;
  maxSitemapFiles: number;
  maxSitemapUrls: number;
  maxRedirects: number;
  maxRetries: number;
  maxCompressedBytes: number;
  maxDecompressedBytes: number;
  connectionTimeoutMs: number;
  responseTimeoutMs: number;
  crawlDurationMs: number;
  sameDomainConcurrency: 1;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface ResolvedDestination {
  hostname: string;
  addresses: ReadonlyArray<ResolvedAddress>;
  selected: ResolvedAddress;
}

export interface DnsResolver {
  resolve(hostname: string): Promise<ReadonlyArray<ResolvedAddress>>;
}

export interface TransportResponse {
  status: number;
  headers: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>;
  compressedBody: Buffer;
  connectedAddress: string;
}

export interface PinnedHttpTransport {
  request(input: {
    url: URL;
    destination: ResolvedDestination;
    headers: Readonly<Record<string, string>>;
    signal?: AbortSignal;
    connectionTimeoutMs: number;
    responseTimeoutMs: number;
    maxCompressedBytes: number;
  }): Promise<TransportResponse>;
}

export type PageKind =
  | "homepage"
  | "contact"
  | "about"
  | "team"
  | "services"
  | "booking"
  | "sitemap_discovered"
  | "other";

export type InspectionStatus =
  | "successful"
  | "blocked"
  | "unavailable"
  | "failed"
  | "not_checked"
  | "stale";

export interface CrawlPage {
  url: string;
  kind: PageKind;
  inspectionStatus: InspectionStatus;
  fetch: FetchResult | null;
  html: string | null;
}

export interface CrawlResult {
  requestedUrl: string;
  canonicalHomepage: string | null;
  startedAt: string;
  completedAt: string;
  pages: ReadonlyArray<CrawlPage>;
  robots: RobotsDecision;
  robotsDecisions: ReadonlyArray<RobotsDecision>;
  complete: boolean;
  timedOut: boolean;
}

export interface RobotsDecision {
  origin: string;
  robotsUrl: string;
  status: "allowed" | "denied" | "unavailable";
  reason: "matched_allow" | "matched_disallow" | "no_matching_rule" | "not_published" | "fetch_failed";
  matchedRule: string | null;
  fetchedAt: string;
  expiresAt: string;
  contentChecksum: string | null;
  sitemapUrls: ReadonlyArray<string>;
}
