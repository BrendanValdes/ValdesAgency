import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractHtml } from "../../src/lead-engine/extraction/html.js";
import { extractLinks } from "../../src/lead-engine/extraction/links.js";

describe("website link extraction", () => {
  it("classifies contact, about, team, service, booking, social, phone, and email links", () => {
    const source = readFileSync(path.join(process.cwd(), "test/lead-engine/fixtures/websites/synthetic/valid-local-business.html"), "utf8");
    const pageUrl = "https://clearwater.example/";
    const html = extractHtml(source, {
      pageUrl,
      observedAt: "2026-01-15T12:00:00.000Z",
      fetchedAt: "2026-01-15T12:00:01.000Z",
      contentChecksum: createHash("sha256").update(source).digest("hex"),
    });
    const kinds = extractLinks(html, pageUrl).map(({ kind }) => kind);
    expect(kinds).toEqual(expect.arrayContaining(["contact", "about", "team", "services", "booking", "social", "telephone", "email"]));
  });
});
