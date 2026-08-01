import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractHtml } from "../../src/lead-engine/extraction/html.js";
import { extractJsonLd } from "../../src/lead-engine/extraction/json-ld.js";
import { extractPersonCandidates } from "../../src/lead-engine/extraction/people.js";

describe("person evidence candidates", () => {
  it("extracts displayed people only as unverified candidates", () => {
    const source = readFileSync(path.join(process.cwd(), "test/lead-engine/fixtures/websites/synthetic/valid-local-business.html"), "utf8");
    const context = { pageUrl: "https://clearwater.example/", observedAt: "2026-01-15T12:00:00.000Z", fetchedAt: "2026-01-15T12:00:01.000Z", contentChecksum: createHash("sha256").update(source).digest("hex") };
    const candidates = extractPersonCandidates({ html: extractHtml(source, context), jsonLd: extractJsonLd(source, context), knownBusinessNames: ["Clearwater Example Pool Care"] });
    expect(candidates[0]).toMatchObject({ displayedName: "Avery Example", candidateStatus: "unverified_evidence_candidate" });
    expect(JSON.stringify(candidates)).not.toMatch(/confirmed_owner|externally_verified|reachable_contact/);
  });

  it("never interprets an organization name as a person", () => {
    const source = "<html><head><title>Example</title></head><body><p>Owner: Clearwater Example Pool Care</p></body></html>";
    const context = { pageUrl: "https://clearwater.example/", observedAt: "2026-01-15T12:00:00.000Z", fetchedAt: "2026-01-15T12:00:01.000Z", contentChecksum: createHash("sha256").update(source).digest("hex") };
    expect(extractPersonCandidates({ html: extractHtml(source, context), jsonLd: extractJsonLd(source, context), knownBusinessNames: ["Clearwater Example Pool Care"] })).toEqual([]);
  });
});
