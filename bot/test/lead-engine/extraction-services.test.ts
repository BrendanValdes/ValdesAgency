import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractHtml } from "../../src/lead-engine/extraction/html.js";
import { extractJsonLd } from "../../src/lead-engine/extraction/json-ld.js";
import { extractServiceEvidence } from "../../src/lead-engine/extraction/services.js";

const niche = {
  service_synonyms: ["pool maintenance", "pool service"],
  required_indicators: ["pool repair"],
  negative_keywords: ["pool supply store"],
  excluded_adjacent_industries: ["pool construction"],
  relevant_categories: ["pool service"],
};

function inputs(source: string) {
  const context = { pageUrl: "https://clearwater.example/services", observedAt: "2026-01-15T12:00:00.000Z", fetchedAt: "2026-01-15T12:00:01.000Z", contentChecksum: createHash("sha256").update(source).digest("hex") };
  return { html: extractHtml(source, context), jsonLd: extractJsonLd(source, context), niche };
}

describe("service and niche evidence", () => {
  it("separates explicit positive, negative, and adjacent-industry evidence", () => {
    const source = "<html><head><title>Synthetic</title></head><body><h1>Pool maintenance</h1><h2>Pool construction</h2><p>We are not a pool supply store.</p></body></html>";
    const observations = extractServiceEvidence(inputs(source));
    expect(observations.map(({ state }) => state)).toEqual(expect.arrayContaining(["positive", "negative", "ambiguous"]));
  });

  it("records unavailable evidence without accepting or rejecting a business", () => {
    expect(extractServiceEvidence({ html: null, jsonLd: null, niche })).toEqual([{
      state: "unavailable",
      term: null,
      basis: "not_available",
      sourceClass: "synthetic_fixture",
      claimState: "unknown",
      evidence: null,
    }]);
  });
});
