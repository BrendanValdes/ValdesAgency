import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POOL_SERVICE_MARKETS } from "../../src/lead-engine/assessment/market-windows.js";
import { googlePlaceCandidates } from "../../src/lead-engine/providers/google/candidates.js";
import { createRequestQuota } from "../../src/lead-engine/providers/google/quota.js";
import {
  createGooglePlacesSession,
  parseTextSearchPayload,
} from "../../src/lead-engine/providers/google/text-search.js";
import {
  GOOGLE_PLACES_ADAPTER_VERSION,
  GOOGLE_PLACES_FIELD_MASK,
  GOOGLE_PLACES_MAX_PAGE_SIZE,
} from "../../src/lead-engine/providers/google/types.js";
import {
  DEFAULT_LEAD_POLICY_ROOT,
  loadRuntimeLeadPolicy,
} from "../../src/lead-engine/config/lead-policy.js";
import { createEphemeralGooglePlacesPolicy } from "../../src/lead-engine/providers/google/policy.js";
import {
  GOOGLE_PLACES_PILOT_BUDGETS,
  GOOGLE_PLACES_PILOT_MARKET_ID,
  GOOGLE_PLACES_PILOT_QUERY,
  parseGooglePlacesPilotArguments,
  planPilotCoverage,
  runGooglePlacesPilot,
} from "../../scripts/run-google-places-pilot.js";
import type { CoverageCell } from "../../src/lead-engine/geography/types.js";

/**
 * Google Places pilot — offline guarantees.
 *
 * Nothing here touches the network or needs an API key. What is asserted is the
 * set of properties that are cheap to hold now and expensive to notice later:
 * the field-mask stance, that no Google fact reaches the durable evidence model,
 * that the coverage key the queue scope depends on is always attached, that the
 * request budget is a hard rail, and that the credential cannot leak into a
 * report or an error.
 */

const SECRET = "test-google-places-key-do-not-log";

function pilotCell(): CoverageCell {
  const cell = planPilotCoverage().cells[0];
  if (!cell) throw new Error("pilot coverage must plan one cell");
  return cell;
}

function place(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `places/${index}`,
    displayName: { text: `Blue Wave Pool Service ${index}`, languageCode: "en" },
    websiteUri: `https://bluewavepool${index}.com/`,
    ...overrides,
  };
}

describe("Google Places response parsing", () => {
  it("keeps only the three masked fields and drops everything else", () => {
    const parsed = parseTextSearchPayload({
      places: [place(1, {
        // Everything below is what the field mask is supposed to make
        // impossible. If a mask edit ever lets these through, they still must
        // not survive parsing.
        formattedAddress: "123 E Camelback Rd, Phoenix, AZ 85012",
        nationalPhoneNumber: "(602) 555-0100",
        businessStatus: "OPERATIONAL",
        pureServiceAreaBusiness: true,
        types: ["general_contractor"],
        rating: 4.7,
      })],
      nextPageToken: "token-value",
    }, 512);

    expect(parsed.places).toHaveLength(1);
    expect(parsed.places[0]).toEqual({
      placeId: "places/1",
      websiteUri: "https://bluewavepool1.com/",
      displayName: "Blue Wave Pool Service 1",
    });
    // No key beyond the three exists on the observation at all.
    expect(Object.keys(parsed.places[0] as object).sort())
      .toEqual(["displayName", "placeId", "websiteUri"]);
    expect(parsed.nextPageToken).toBe("token-value");
    expect(parsed.downloadedBytes).toBe(512);
  });

  it("pins the field mask, page size, and endpoint so a widening is an explicit edit", () => {
    expect(GOOGLE_PLACES_FIELD_MASK)
      .toBe("places.id,places.websiteUri,places.displayName,nextPageToken");
    expect(GOOGLE_PLACES_FIELD_MASK).not.toMatch(/address|phone|rating|businessStatus|types/i);
    expect(GOOGLE_PLACES_MAX_PAGE_SIZE).toBe(20);
  });

  it("rejects an API error payload without exposing a request detail", () => {
    expect(() => parseTextSearchPayload({ error: { code: 403, message: "denied" } }, 64))
      .toThrowError(/api_error_response/);
  });
});

describe("Google candidate mapping", () => {
  it("admits a place with a safe website and attaches the coverage key to every one", () => {
    const cell = pilotCell();
    const outcome = googlePlaceCandidates({
      places: parseTextSearchPayload({ places: [place(1), place(2)] }, 128).places,
      cell,
    });

    expect(outcome.eligible).toHaveLength(2);
    expect(outcome.consideredCount).toBe(2);
    for (const candidate of outcome.eligible) {
      // The queue scope check has no other route in for a Google candidate: with
      // no provider address there is no business_locations row, so a missing
      // coverage key means every lead is classified outside the queue scope.
      expect(candidate.discoveredCoverageKey).toBe(cell.coverageKey);
      expect(candidate.releaseId).toBe(GOOGLE_PLACES_ADAPTER_VERSION);
      expect(candidate.candidateUrl.startsWith("https://")).toBe(true);
    }
  });

  it("carries no provider location, category, or source class into the evidence model", () => {
    const outcome = googlePlaceCandidates({
      places: parseTextSearchPayload({ places: [place(1)] }, 128).places,
      cell: pilotCell(),
    });
    const candidate = outcome.eligible[0];
    if (!candidate) throw new Error("expected one admitted candidate");

    // business_locations is a citable qualification source and the basis of the
    // geography hard gate. A Google address must never reach it, so none is
    // carried and the store has nothing to write.
    expect(candidate.providerLocation ?? null).toBeNull();
    expect(candidate.providerCategories ?? null).toBeNull();
    expect(candidate.providerSourceClass ?? null).toBeNull();
    // Absent expected phones make the phone identity dimension `unavailable`
    // rather than `conflicting`, so this can never manufacture a conflict.
    expect(candidate.expectedPhones).toEqual([]);
    expect(candidate.expectedLocality).toBeNull();
  });

  it("blocks a place with no website, no name, an unsafe URL, or a duplicate", () => {
    const cell = pilotCell();
    const outcome = googlePlaceCandidates({
      places: parseTextSearchPayload({
        places: [
          place(1),
          place(2, { websiteUri: undefined }),
          // A name-less place must not fall back to the hostname: that would let
          // the domain identity dimension corroborate itself.
          place(3, { displayName: undefined }),
          place(4, { websiteUri: "http://127.0.0.1/admin" }),
          place(5, { websiteUri: "https://bluewavepool1.com/contact" }),
          place(1, { websiteUri: "https://someotherhost.example/" }),
        ],
      }, 512).places,
      cell,
    });

    expect(outcome.eligible).toHaveLength(1);
    expect(outcome.blockedCounts).toEqual({
      no_observed_website: 1,
      no_provider_name: 1,
      unsafe_candidate_url: 1,
      // The shared host and the repeated place id.
      duplicate_candidate: 2,
    });
  });
});

describe("Google Places request budget", () => {
  const policy = loadRuntimeLeadPolicy();

  it("issues exactly one request and refuses the second", async () => {
    // A one-request quota is the rail; the policy is only asked to authorize it.
    const quota = createRequestQuota({ maxRequests: 1, minimumIntervalMs: 0 });
    expect(quota.remaining()).toBe(1);
    await quota.acquire();
    expect(quota.hasRemaining()).toBe(false);
    await expect(quota.acquire()).rejects.toThrowError(/quota of 1 was exhausted/);
    expect(policy.providers.search?.enabled).toBe(false);
  });
});

describe("Google Places session credential handling", () => {
  it("cannot authorize a request against the checked-in policy at all", async () => {
    // The committed configuration keeps `search` disabled, so the pilot only ever
    // works through the ephemeral policy. A session built on the committed tree
    // must refuse before any fetch is attempted.
    let attempts = 0;
    const session = createGooglePlacesSession({
      policy: loadRuntimeLeadPolicy(),
      apiKey: SECRET,
      runId: "disabled-policy-test",
      scopeId: "disabled-policy-test",
      maxRequests: 1, minimumIntervalMs: 0, maxBytesPerRequest: 1024,
      maxRequestDurationMs: 1_000, capabilityTtlMs: 60_000,
      requestsPerLease: 1, maxRetriesPerRequest: 0,
      fetchImpl: (async () => {
        attempts += 1;
        throw new Error("should never be reached");
      }) as unknown as typeof fetch,
    });

    await expect(session.searchText({
      textQuery: GOOGLE_PLACES_PILOT_QUERY, rectangle: pilotCell().bounds,
    })).rejects.toThrowError();
    expect(attempts).toBe(0);
  });

  it("strips the API key out of a transport error that echoes it", async () => {
    // The real leak path: fetch failures routinely include the request headers,
    // and the headers hold the key. The session must discard that message rather
    // than wrap it. Run against the ephemeral policy so the request is actually
    // authorized and a fetch really happens.
    const ephemeral = createEphemeralGooglePlacesPolicy({
      checkedInConfigurationRoot: DEFAULT_LEAD_POLICY_ROOT,
      maxRequests: 1,
      maxBytes: 1024 * 1024,
      maxRequestDurationMs: 1_000,
      capabilityTtlSeconds: 60,
    });
    let attempts = 0;
    try {
      const session = createGooglePlacesSession({
        policy: ephemeral.policy,
        apiKey: SECRET,
        runId: "credential-test",
        scopeId: "credential-test",
        maxRequests: 1, minimumIntervalMs: 0, maxBytesPerRequest: 1024 * 1024,
        maxRequestDurationMs: 1_000, capabilityTtlMs: 60_000,
        requestsPerLease: 1, maxRetriesPerRequest: 0,
        fetchImpl: (async () => {
          attempts += 1;
          throw new Error(`connect ECONNREFUSED — sent X-Goog-Api-Key: ${SECRET}`);
        }) as unknown as typeof fetch,
      });

      let surfaced = "";
      try {
        await session.searchText({
          textQuery: GOOGLE_PLACES_PILOT_QUERY, rectangle: pilotCell().bounds,
        });
      } catch (error) {
        surfaced = error instanceof Error
          ? `${error.name}: ${error.message}\n${error.stack ?? ""}${JSON.stringify(error, Object.getOwnPropertyNames(error))}`
          : String(error);
      }

      // The fetch really was attempted, so the redaction is doing the work here.
      expect(attempts).toBe(1);
      expect(surfaced).toContain("transport_failed");
      expect(surfaced).not.toContain(SECRET);
      expect(JSON.stringify(session.usage())).not.toContain(SECRET);
    } finally {
      ephemeral.cleanup();
    }
  });

  it("refuses a session with no API key", () => {
    const policy = loadRuntimeLeadPolicy();
    expect(() => createGooglePlacesSession({
      policy,
      apiKey: "   ",
      runId: "r", scopeId: "s",
      maxRequests: 1, minimumIntervalMs: 0, maxBytesPerRequest: 1024,
      maxRequestDurationMs: 1_000, capabilityTtlMs: 1_000,
      requestsPerLease: 1, maxRetriesPerRequest: 0,
    })).toThrowError(/requires an API key/);
  });
});

describe("pilot scope and guards", () => {
  it("plans exactly one metro cell over the configured Phoenix bounds", () => {
    const market = POOL_SERVICE_MARKETS.find((entry) => entry.id === GOOGLE_PLACES_PILOT_MARKET_ID);
    const coverage = planPilotCoverage();
    expect(coverage.cells).toHaveLength(1);
    const cell = coverage.cells[0];
    // The cell the lineage cites and the rectangle the request restricts to are
    // the same bounds, so the key describes exactly where we looked.
    expect(cell?.bounds).toEqual(market?.bounds);
    expect(cell?.level).toBe("metro");
    expect(cell?.subdivisionCode).toBe("AZ");
    expect(cell?.coverageKey).toMatch(/.+/);
  });

  it("searches one query and never paginates or fetches place details", () => {
    expect(GOOGLE_PLACES_PILOT_QUERY).toBe("pool cleaning service in Phoenix Arizona");
    expect(GOOGLE_PLACES_PILOT_BUDGETS.maxDiscoveryRequests).toBe(1);
  });

  it("pins the declared budgets so a raise is always an explicit edit", () => {
    expect(GOOGLE_PLACES_PILOT_BUDGETS).toEqual({
      maxDiscoveryRequests: 1,
      maxDiscoveryBytes: 1024 * 1024,
      maxDiscoveryRequestDurationMs: 15_000,
      minimumIntervalMs: 6_000,
      discoveryCapabilityTtlSeconds: 120,
      maxRetriesPerDiscoveryRequest: 1,
      assessmentChunkSize: 16,
      maxPagesPerBusiness: 2,
      maxRequestsPerBusiness: 4,
      maxRequestsPerAssessmentChunk: 64,
      maxBytesPerAssessmentChunk: 32 * 1024 * 1024,
      maxProcessedBytesPerAssessmentChunk: 64 * 1024 * 1024,
      maxAssessmentChunkDurationMs: 110_000,
      maxRetriesPerBusiness: 1,
      maxCrawlRequests: 160,
      maxCrawlBytes: 16 * 1024 * 1024,
      maxRuntimeMs: 900_000,
    });
  });

  it("requires explicit confirmation and a durable data root", () => {
    expect(() => parseGooglePlacesPilotArguments(["--data-root", "/srv/pilot"]))
      .toThrowError(/--confirm-live-pilot/);
    expect(() => parseGooglePlacesPilotArguments(["--confirm-live-pilot"]))
      .toThrowError(/--data-root/);
    expect(() => parseGooglePlacesPilotArguments(["--confirm-live-pilot", "--unknown", "x"]))
      .toThrowError(/Unknown pilot argument/);
    const args = parseGooglePlacesPilotArguments([
      "--confirm-live-pilot", "--data-root", "/srv/pilot",
    ]);
    expect(args).toEqual({ dataRoot: "/srv/pilot", enableLivePilot: false });
  });

  it("does no network work and writes nothing while the pilot is disabled", async () => {
    const report = await runGooglePlacesPilot({
      argv: ["--confirm-live-pilot", "--data-root", "/srv/rocco-google-pilot"],
      repositoryRoot: path.resolve(process.cwd(), ".."),
    });
    expect(report.ran).toBe(false);
    expect(report.aggregateVerdict).toBe("blocked_live_pilot_disabled");
    expect(report.usage).toEqual({});
    expect(report.artifacts).toEqual({});
    expect(existsSync("/srv/rocco-google-pilot")).toBe(false);
  });
});
