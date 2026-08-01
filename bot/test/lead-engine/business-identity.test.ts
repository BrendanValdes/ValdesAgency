import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractBusinessIdentity, identityAgreement } from "../../src/lead-engine/extraction/business-identity.js";
import { extractHtml } from "../../src/lead-engine/extraction/html.js";
import { extractJsonLd } from "../../src/lead-engine/extraction/json-ld.js";

function extract(source: string) {
  const context = { pageUrl: "https://clearwater.example/", observedAt: "2026-01-15T12:00:00.000Z", fetchedAt: "2026-01-15T12:00:01.000Z", contentChecksum: createHash("sha256").update(source).digest("hex"), sourceClass: "public_business_website" as const };
  return extractBusinessIdentity({ html: extractHtml(source, context), jsonLd: extractJsonLd(source, context) });
}

describe("website business identity evidence", () => {
  it("detects parked, placeholder, closed, and moved statements as evidence signals", () => {
    const result = extract("<html><head><title>Domain for sale</title></head><body>Buy this domain. Coming soon. We have moved. We are permanently closed.</body></html>");
    expect(result).toMatchObject({ parked: true, placeholderOnly: true, explicitlyClosed: true, explicitlyMoved: true });
    expect(result).toMatchObject({ sourceClass: "public_business_website", claimState: "observed" });
  });

  it("distinguishes agreement from conflicting business identity", () => {
    const agreeing = extract("<html><head><title>Clearwater Example Pool Care | Home</title></head><body></body></html>");
    const conflict = extract("<html><head><title>Unrelated Example Roofing</title></head><body></body></html>");
    expect(identityAgreement("Clearwater Example Pool Care", agreeing.names)).toBe("agrees");
    expect(identityAgreement("Clearwater Example Pool Care", conflict.names)).toBe("conflicts");
  });
});
