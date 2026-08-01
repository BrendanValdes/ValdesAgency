import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractHtml } from "../../src/lead-engine/extraction/html.js";

const fixturePath = path.join(process.cwd(), "test/lead-engine/fixtures/websites/synthetic/valid-local-business.html");
const malformedPath = path.join(process.cwd(), "test/lead-engine/fixtures/websites/synthetic/malformed-jsonld.html");

function context(html: string) {
  return {
    pageUrl: "https://clearwater.example/",
    observedAt: "2026-01-15T12:00:00.000Z",
    fetchedAt: "2026-01-15T12:00:01.000Z",
    contentChecksum: createHash("sha256").update(html).digest("hex"),
  };
}

describe("HTML extraction", () => {
  it("extracts metadata, headings, routes, forms, address, and provenance", () => {
    const html = readFileSync(fixturePath, "utf8");
    const result = extractHtml(html, context(html));
    expect(result.title?.value).toBe("Clearwater Example Pool Care");
    expect(result.metaDescription?.value).toContain("Synthetic");
    expect(result.canonicalUrl?.value).toBe("https://clearwater.example/");
    expect(result.language?.value).toBe("en");
    expect(result.viewport?.value).toContain("width=device-width");
    expect(result.headings.map(({ value }) => value)).toContain("Pool maintenance and repair");
    expect(result.anchors.map(({ href }) => href)).toContain("/contact");
    expect(result.forms).toHaveLength(1);
    expect(result.addressTexts[0]?.value).toContain("Example Avenue");
    expect(result.title).toMatchObject({ extractionMethod: "html", selector: "title", extractionPolicyVersion: "website-extraction-1.0.0" });
  });

  it("fails safely on malformed content while retaining valid HTML evidence", () => {
    const html = readFileSync(malformedPath, "utf8");
    const result = extractHtml(html, context(html));
    expect(result.title?.value).toBe("Malformed JSON-LD Fixture");
    expect(result.headings[0]?.value).toBe("Pool service remains extractable");
  });
});
