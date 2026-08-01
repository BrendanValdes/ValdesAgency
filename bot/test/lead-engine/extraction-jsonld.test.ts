import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractJsonLd } from "../../src/lead-engine/extraction/json-ld.js";

function fixture(name: string): string {
  return readFileSync(path.join(process.cwd(), "test/lead-engine/fixtures/websites/synthetic", name), "utf8");
}

function extract(html: string) {
  return extractJsonLd(html, { pageUrl: "https://clearwater.example/", observedAt: "2026-01-15T12:00:00.000Z", fetchedAt: "2026-01-15T12:00:01.000Z", contentChecksum: createHash("sha256").update(html).digest("hex") });
}

describe("JSON-LD extraction", () => {
  it("extracts LocalBusiness, address, contact, service, person, and sameAs evidence", () => {
    const result = extract(fixture("valid-local-business.html"));
    expect(result.schemaTypes.map(({ value }) => value)).toContain("LocalBusiness");
    expect(result.organizationNames[0]?.value).toBe("Clearwater Example Pool Care");
    expect(result.addresses[0]?.value).toContain("Example Avenue");
    expect(result.contactPoints.map(({ value }) => value)).toEqual(expect.arrayContaining(["+1-202-555-0100", "hello@example.test"]));
    expect(result.services[0]?.value).toBe("Pool maintenance");
    expect(result.people[0]?.value).toEqual({ name: "Avery Example", title: "Operations Manager" });
    expect(result.sameAs[0]?.value).toContain("social.example");
    expect(result.people[0]?.structuredDataPath).toContain("employee");
  });

  it("isolates malformed JSON-LD without discarding HTML-layer evidence", () => {
    const result = extract(fixture("malformed-jsonld.html"));
    expect(result.malformedBlocks).toBe(1);
    expect(result.organizationNames).toEqual([]);
  });
});
