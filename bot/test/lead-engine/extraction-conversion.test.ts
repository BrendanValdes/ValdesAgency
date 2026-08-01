import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractConversionSignals } from "../../src/lead-engine/extraction/conversion.js";
import { extractHtml } from "../../src/lead-engine/extraction/html.js";

describe("conversion-path extraction", () => {
  it("detects visible deterministic conversion signals without executing scripts", () => {
    const source = readFileSync(path.join(process.cwd(), "test/lead-engine/fixtures/websites/synthetic/valid-local-business.html"), "utf8");
    const context = { pageUrl: "https://clearwater.example/", observedAt: "2026-01-15T12:00:00.000Z", fetchedAt: "2026-01-15T12:00:01.000Z", contentChecksum: createHash("sha256").update(source).digest("hex") };
    const signals = extractConversionSignals({ html: extractHtml(source, context), homepage: context.pageUrl, validResponse: true });
    expect(signals.map(({ feature }) => feature)).toEqual(expect.arrayContaining(["click_to_call", "contact_form", "estimate_request", "booking", "primary_cta", "contact_route", "mobile_viewport", "https", "valid_page_response", "service_route"]));
    expect(signals.every(({ evidence }) => evidence.contentChecksum === context.contentChecksum)).toBe(true);
  });
});
