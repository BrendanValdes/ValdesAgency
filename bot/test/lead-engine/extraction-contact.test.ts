import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractContactInformation } from "../../src/lead-engine/extraction/contact.js";
import { extractHtml } from "../../src/lead-engine/extraction/html.js";
import { extractJsonLd } from "../../src/lead-engine/extraction/json-ld.js";

describe("public contact extraction", () => {
  it("retains link and structured-data provenance without verification upgrades", () => {
    const source = readFileSync(path.join(process.cwd(), "test/lead-engine/fixtures/websites/synthetic/valid-local-business.html"), "utf8");
    const context = { pageUrl: "https://clearwater.example/", observedAt: "2026-01-15T12:00:00.000Z", fetchedAt: "2026-01-15T12:00:01.000Z", contentChecksum: createHash("sha256").update(source).digest("hex") };
    const contacts = extractContactInformation({ html: extractHtml(source, context), jsonLd: extractJsonLd(source, context), homepage: context.pageUrl });
    expect(contacts.map(({ kind }) => kind)).toEqual(expect.arrayContaining(["phone", "email", "address"]));
    expect(contacts.every(({ candidateStatus }) => candidateStatus === "public_unverified")).toBe(true);
    expect(contacts.every(({ evidence }) => evidence.pageUrl === context.pageUrl && evidence.contentChecksum.length === 64)).toBe(true);
  });
});
