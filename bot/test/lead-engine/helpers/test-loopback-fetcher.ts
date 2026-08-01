import type { CrawlLimits, SafeFetcher } from "../../../src/lead-engine/crawl/types.js";
import { createTestOnlyDirectHttpFetcher } from "../../../src/lead-engine/crawl/fetchers/direct-http.js";
import { issueTestLoopbackCapability } from "../../../src/lead-engine/crawl/fetchers/test-loopback-capability.js";

export function createSyntheticLoopbackFetcher(options: {
  allowedOrigin: string;
  testScopeId?: string;
  limits?: CrawlLimits;
  now?: () => string;
  random?: () => number;
}): SafeFetcher {
  const testScopeId = options.testScopeId ??
    `synthetic-loopback:${new URL(options.allowedOrigin).port}`;
  const capability = issueTestLoopbackCapability({
    testScopeId,
    allowedOrigin: options.allowedOrigin,
  });
  return createTestOnlyDirectHttpFetcher({
    capability,
    testScopeId,
    limits: options.limits,
    now: options.now,
    random: options.random,
  });
}
