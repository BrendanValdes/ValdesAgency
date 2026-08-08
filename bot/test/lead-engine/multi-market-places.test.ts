import { describe, expect, it } from "vitest";
import {
  combinedCsv,
  googleQueriesForNiche,
  marketQuery,
  MULTI_MARKET_BUDGETS,
  newDedupeState,
  orderedStateCodes,
  parseMarketSpec,
  parseMarketsFile,
  parseMultiMarketArguments,
  planMarketCell,
  salesFitHistogram,
  selectNewCandidates,
  type MultiMarket,
} from "../../scripts/run-multi-market-places.js";
import type { ExportRow } from "../../scripts/run-pool-lead-batch.js";
import type { EligibleCandidate } from "../../src/lead-engine/assessment/candidate-gate.js";

/**
 * Multi-market runner — pure argument parsing, dedupe, and export assembly.
 *
 * No network, no filesystem beyond an injected `readFile`, no live Google
 * request. Everything here is a direct input/output assertion over the
 * runner's exported helpers.
 */

function market(overrides: Partial<MultiMarket> = {}): MultiMarket {
  return {
    id: "chandler_az",
    city: "Chandler",
    stateCode: "AZ",
    countryCode: "US",
    bounds: { west: -111.9, south: 33.2, east: -111.8, north: 33.3 },
    ...overrides,
  };
}

function candidate(overrides: Partial<EligibleCandidate> = {}): EligibleCandidate {
  return {
    candidateKey: "places/1",
    expectedBusinessName: "Blue Wave Pool Service",
    candidateUrl: "https://bluewavepool.example/",
    candidateHost: "bluewavepool.example",
    providerPlaceId: "places/1",
    releaseId: "release-1",
    expectedLocality: null,
    expectedPhones: [],
    ...overrides,
  };
}

function exportRow(overrides: Partial<ExportRow> = {}): ExportRow {
  return {
    leadId: "lead-1",
    businessName: "Blue Wave Pool Service",
    website: "https://bluewavepool.example/",
    observedPhone: "",
    market: "chandler_az",
    score: 70,
    result: "qualified_with_review",
    queueDisposition: "review",
    priorityScore: 50,
    priorityBand: "medium",
    reasonCodes: [],
    missingFlags: [],
    salesFitScore: 3,
    salesFitBand: "light",
    salesFitReasons: ["no_online_booking"],
    ...overrides,
  };
}

describe("parseMarketSpec", () => {
  it("parses City,ST,west,south,east,north", () => {
    expect(parseMarketSpec("Chandler,az,-111.9,33.2,-111.8,33.3")).toEqual(
      market({ stateCode: "AZ" }),
    );
  });

  it("rejects a spec without exactly six parts", () => {
    expect(() => parseMarketSpec("Chandler,az,-111.9,33.2,-111.8")).toThrow(
      /City,ST,west,south,east,north/,
    );
  });

  it("rejects a blank city", () => {
    expect(() => parseMarketSpec(",az,-111.9,33.2,-111.8,33.3")).toThrow(/requires a city/);
  });

  it("rejects a state code that is not two letters", () => {
    expect(() => parseMarketSpec("Chandler,arizona,-111.9,33.2,-111.8,33.3")).toThrow(
      /state code must be two letters/,
    );
  });

  it("rejects inverted bounds", () => {
    expect(() => parseMarketSpec("Chandler,az,-111.8,33.2,-111.9,33.3")).toThrow(
      /ordered west<east and south<north/,
    );
  });

  it("rejects bounds wider than two degrees on a side", () => {
    expect(() => parseMarketSpec("Chandler,az,-114.0,33.2,-111.0,33.3")).toThrow(
      /exceed two degrees/,
    );
  });

  it("rejects out-of-range latitude and longitude", () => {
    expect(() => parseMarketSpec("Chandler,az,-181,33.2,-111.8,33.3")).toThrow(
      /longitude must be within/,
    );
    expect(() => parseMarketSpec("Chandler,az,-111.9,91,-111.8,92")).toThrow(
      /latitude must be within/,
    );
  });
});

describe("parseMarketsFile", () => {
  it("parses a markets array and defaults the country code to US", () => {
    const contents = JSON.stringify({
      markets: [{ city: "Chandler", stateCode: "az", bounds: market().bounds }],
    });
    expect(parseMarketsFile(contents)).toEqual([market({ stateCode: "AZ" })]);
  });

  it("honours an explicit country code", () => {
    const contents = JSON.stringify({
      markets: [{ city: "Chandler", stateCode: "az", countryCode: "us", bounds: market().bounds }],
    });
    expect(parseMarketsFile(contents)[0]?.countryCode).toBe("US");
  });

  it("rejects invalid JSON", () => {
    expect(() => parseMarketsFile("{not json")).toThrow(/not valid JSON/);
  });

  it("rejects a missing or empty markets array", () => {
    expect(() => parseMarketsFile(JSON.stringify({}))).toThrow(/non-empty markets array/);
    expect(() => parseMarketsFile(JSON.stringify({ markets: [] }))).toThrow(
      /non-empty markets array/,
    );
  });

  it("rejects an entry missing a city", () => {
    const contents = JSON.stringify({ markets: [{ stateCode: "az", bounds: market().bounds }] });
    expect(() => parseMarketsFile(contents)).toThrow(/requires a city/);
  });

  it("rejects an entry missing bounds", () => {
    const contents = JSON.stringify({ markets: [{ city: "Chandler", stateCode: "az" }] });
    expect(() => parseMarketsFile(contents)).toThrow(/requires bounds/);
  });

  it("rejects a country code that is not two letters", () => {
    const contents = JSON.stringify({
      markets: [{ city: "Chandler", stateCode: "az", countryCode: "usa", bounds: market().bounds }],
    });
    expect(() => parseMarketsFile(contents)).toThrow(/country code must be two letters/);
  });
});

describe("parseMultiMarketArguments", () => {
  const baseArgs = [
    "--confirm-live-run",
    "--data-root",
    "/tmp/data",
    "--market",
    "Chandler,az,-111.9,33.2,-111.8,33.3",
    "--max-google-requests",
    "10",
  ];

  it("parses a minimal valid argument set with documented defaults", () => {
    const parsed = parseMultiMarketArguments(baseArgs);
    expect(parsed.dataRoot).toBe("/tmp/data");
    expect(parsed.markets).toEqual([market({ stateCode: "AZ" })]);
    expect(parsed.targetCallablePerState).toBe(50);
    expect(parsed.maxGoogleRequests).toBe(10);
    expect(parsed.maxAssessedCandidates).toBe(400);
    expect(parsed.enableLiveRun).toBe(false);
    expect(parsed.nicheId).toBe("pool_service");
    expect(parsed.queriesPerCity).toBe(5);
  });

  it("accepts the foundation-waterproofing CLI identifier and its six queries", () => {
    const parsed = parseMultiMarketArguments([
      ...baseArgs,
      "--niche",
      "foundation-waterproofing",
    ]);
    expect(parsed.nicheId).toBe("foundation_waterproofing");
    expect(parsed.queriesPerCity).toBe(6);
    expect(googleQueriesForNiche(parsed.nicheId)).toEqual([
      "foundation repair",
      "basement waterproofing",
      "crawl space repair",
      "foundation contractor",
      "structural foundation repair",
      "foundation waterproofing",
    ]);
  });

  it("rejects any unsupported niche identifier", () => {
    expect(() => parseMultiMarketArguments([...baseArgs, "--niche", "plumbing"]))
      .toThrow(/Unsupported niche/);
  });

  it("sets enableLiveRun from --enable-live-run", () => {
    expect(parseMultiMarketArguments([...baseArgs, "--enable-live-run"]).enableLiveRun).toBe(true);
  });

  it("loads markets from an absolute --markets-file via the injected reader", () => {
    const readFile = () =>
      JSON.stringify({ markets: [{ city: "Chandler", stateCode: "az", bounds: market().bounds }] });
    const parsed = parseMultiMarketArguments(
      [
        "--confirm-live-run",
        "--data-root",
        "/tmp/data",
        "--markets-file",
        "/tmp/markets.json",
        "--max-google-requests",
        "10",
      ],
      readFile,
    );
    expect(parsed.markets).toEqual([market({ stateCode: "AZ" })]);
  });

  it("rejects a relative --markets-file path", () => {
    expect(() =>
      parseMultiMarketArguments([
        "--confirm-live-run",
        "--data-root",
        "/tmp/data",
        "--markets-file",
        "markets.json",
        "--max-google-requests",
        "10",
      ]),
    ).toThrow(/must be an absolute path/);
  });

  it("requires --confirm-live-run", () => {
    expect(() => parseMultiMarketArguments(baseArgs.filter((a) => a !== "--confirm-live-run"))).toThrow(
      /requires --confirm-live-run/,
    );
  });

  it("requires --data-root", () => {
    const args = baseArgs.filter((_, i) => baseArgs[i] !== "--data-root" && baseArgs[i - 1] !== "--data-root");
    expect(() => parseMultiMarketArguments(args)).toThrow(/requires --data-root/);
  });

  it("requires at least one market", () => {
    const args = baseArgs.filter(
      (_, i) => baseArgs[i] !== "--market" && baseArgs[i - 1] !== "--market",
    );
    expect(() => parseMultiMarketArguments(args)).toThrow(/at least one --market/);
  });

  it("rejects duplicate markets", () => {
    expect(() =>
      parseMultiMarketArguments([
        ...baseArgs,
        "--market",
        "Chandler,az,-111.9,33.2,-111.8,33.3",
      ]),
    ).toThrow(/Duplicate market/);
  });

  it("rejects a target-callable-per-state outside 1..500", () => {
    expect(() =>
      parseMultiMarketArguments([...baseArgs, "--target-callable-per-state", "0"]),
    ).toThrow(/Callable target per state/);
    expect(() =>
      parseMultiMarketArguments([...baseArgs, "--target-callable-per-state", "501"]),
    ).toThrow(/Callable target per state/);
  });

  it("requires --max-google-requests and enforces the run ceiling", () => {
    const withoutCap = baseArgs.filter(
      (_, i) => baseArgs[i] !== "--max-google-requests" && baseArgs[i - 1] !== "--max-google-requests",
    );
    expect(() => parseMultiMarketArguments(withoutCap)).toThrow(/requires --max-google-requests/);
    expect(() =>
      parseMultiMarketArguments([
        ...withoutCap,
        "--max-google-requests",
        String(MULTI_MARKET_BUDGETS.maxGoogleRequestsCeiling + 1),
      ]),
    ).toThrow(/between 1 and the run ceiling/);
  });

  it("rejects a max-assessed-candidates outside 1..2000", () => {
    expect(() =>
      parseMultiMarketArguments([...baseArgs, "--max-assessed-candidates", "2001"]),
    ).toThrow(/Candidate cap/);
  });

  it("rejects a queries-per-city outside the checked-in query count", () => {
    expect(() => parseMultiMarketArguments([...baseArgs, "--queries", "0"])).toThrow(
      /Queries per city/,
    );
    expect(() => parseMultiMarketArguments([...baseArgs, "--queries", "999"])).toThrow(
      /Queries per city/,
    );
  });

  it("rejects an unknown flag and a flag missing its value", () => {
    expect(() => parseMultiMarketArguments([...baseArgs, "--bogus", "1"])).toThrow(
      /Unknown runner argument/,
    );
    expect(() => parseMultiMarketArguments([...baseArgs, "--data-root"])).toThrow(
      /requires a value/,
    );
  });
});

describe("planMarketCell", () => {
  it("plans exactly one coverage cell carrying the market's bounds", () => {
    const { manifest, cell } = planMarketCell(market());
    expect(manifest.cells).toHaveLength(1);
    expect(cell.bounds).toEqual(market().bounds);
    expect(cell.countryCode).toBe("US");
    expect(cell.subdivisionCode).toBe("AZ");
  });

  it("carries foundation-waterproofing into coverage lineage", () => {
    const { manifest } = planMarketCell(market(), "foundation_waterproofing");
    expect(manifest.nicheId).toBe("foundation_waterproofing");
    expect(manifest.queryVersion).toBe("foundation-waterproofing-places-1.0.0");
  });
});

describe("marketQuery", () => {
  it("appends the city and state to the query text", () => {
    expect(marketQuery("pool service", market())).toBe("pool service in Chandler, AZ");
  });
});

describe("dedupe across queries, cities, and states", () => {
  it("drops a candidate seen before by place id or by host", () => {
    const seen = newDedupeState();
    const first = selectNewCandidates({
      candidates: [candidate()],
      seen,
      remainingCapacity: 10,
    });
    expect(first.accepted).toHaveLength(1);
    expect(first.duplicates).toBe(0);

    const byPlaceId = selectNewCandidates({
      candidates: [candidate({ candidateHost: "different.example" })],
      seen,
      remainingCapacity: 10,
    });
    expect(byPlaceId.accepted).toHaveLength(0);
    expect(byPlaceId.duplicates).toBe(1);

    const byHost = selectNewCandidates({
      candidates: [candidate({ candidateKey: "places/2", providerPlaceId: "places/2" })],
      seen,
      remainingCapacity: 10,
    });
    expect(byHost.accepted).toHaveLength(0);
    expect(byHost.duplicates).toBe(1);
  });

  it("blocks on remaining capacity rather than accepting past it", () => {
    const seen = newDedupeState();
    const result = selectNewCandidates({
      candidates: [
        candidate({ candidateKey: "places/1", candidateHost: "one.example", providerPlaceId: "places/1" }),
        candidate({ candidateKey: "places/2", candidateHost: "two.example", providerPlaceId: "places/2" }),
      ],
      seen,
      remainingCapacity: 1,
    });
    expect(result.accepted).toHaveLength(1);
    expect(result.capacityBlocked).toBe(1);
    expect(result.duplicates).toBe(0);
  });
});

describe("orderedStateCodes", () => {
  it("returns distinct state codes in first-seen order", () => {
    const markets = [
      market({ stateCode: "AZ" }),
      market({ id: "reno_nv", stateCode: "NV" }),
      market({ id: "gilbert_az", stateCode: "AZ" }),
    ];
    expect(orderedStateCodes(markets)).toEqual(["AZ", "NV"]);
  });
});

describe("salesFitHistogram", () => {
  it("counts rows by sales-fit band", () => {
    const rows = [
      exportRow({ salesFitBand: "strong" }),
      exportRow({ salesFitBand: "strong" }),
      exportRow({ salesFitBand: "minimal" }),
    ];
    expect(salesFitHistogram(rows)).toEqual({ strong: 2, minimal: 1 });
  });

  it("returns an empty histogram for no rows", () => {
    expect(salesFitHistogram([])).toEqual({});
  });
});

describe("combinedCsv", () => {
  it("dedupes by lead id, sorts by priority score, and appends the state code", () => {
    const rows = [
      exportRow({ leadId: "lead-low", priorityScore: 10 }),
      exportRow({ leadId: "lead-high", priorityScore: 90 }),
      exportRow({ leadId: "lead-low", priorityScore: 10, businessName: "Duplicate" }),
    ];
    const result = combinedCsv(rows, new Map([["chandler_az", "AZ"]]));
    expect(result.rowCount).toBe(2);
    expect(result.duplicateRowsDropped).toBe(1);
    const lines = result.csv.split("\n");
    expect(lines[0]).toBe("lead_id,business_name,website,observed_phone,market,score,result,queue_disposition,priority_score,priority_band,reason_codes,missing_flags,sales_fit_score,sales_fit_band,sales_fit_reasons,state_code");
    expect(lines[1]).toContain("lead-high");
    expect(lines[1]).toContain("AZ");
    expect(lines[2]).toContain("lead-low");
  });

  it("falls back to an empty state code when the market has no mapping", () => {
    const result = combinedCsv([exportRow()], new Map());
    expect(result.csv.split("\n")[1]?.endsWith(",")).toBe(true);
  });
});
