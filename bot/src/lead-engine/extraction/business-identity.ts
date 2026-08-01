import type { EvidenceValue } from "../crawl/types.js";
import { normalizeBusinessName } from "../identity/normalize.js";
import type { HtmlExtraction } from "./html.js";
import type { JsonLdExtraction } from "./json-ld.js";

export interface BusinessIdentityEvidence {
  names: ReadonlyArray<EvidenceValue<string>>;
  parked: boolean;
  placeholderOnly: boolean;
  explicitlyClosed: boolean;
  explicitlyMoved: boolean;
}

export function extractBusinessIdentity(input: {
  html: HtmlExtraction;
  jsonLd: JsonLdExtraction;
}): BusinessIdentityEvidence {
  const names: EvidenceValue<string>[] = [...input.jsonLd.organizationNames];
  if (input.html.title) {
    const titleName = input.html.title.value.split(/\s+[|–—-]\s+/, 1)[0]?.trim();
    if (titleName) names.push({ ...input.html.title, value: titleName, confidence: "medium" });
  }
  for (const copyright of input.html.copyrightTexts) {
    const name = copyright.value
      .replace(/^(?:©|copyright\s*)\s*(?:19|20)\d{2}(?:\s*[-–]\s*(?:19|20)\d{2})?\s*/i, "")
      .replace(/\s+all rights.*$/i, "")
      .trim();
    if (name) names.push({ ...copyright, value: name, confidence: "medium" });
  }
  const text = input.html.visibleText;
  return {
    names,
    parked: /\b(?:domain (?:is )?for sale|buy this domain|parked (?:free|domain)|sedo domain parking)\b/i.test(text),
    placeholderOnly: /\b(?:coming soon|website under construction|site under maintenance)\b/i.test(text) && text.length < 1_000,
    explicitlyClosed: /\b(?:permanently closed|we have closed|no longer in business)\b/i.test(text),
    explicitlyMoved: /\b(?:we(?:'|’)ve moved|we have moved|now located at|visit our new website)\b/i.test(text),
  };
}

export function identityAgreement(
  expectedBusinessName: string,
  observedNames: ReadonlyArray<EvidenceValue<string>>,
): "agrees" | "conflicts" | "ambiguous" | "unavailable" {
  if (observedNames.length === 0) return "unavailable";
  const expected = normalizeBusinessName(expectedBusinessName);
  const expectedTokens = new Set(expected.split(" ").filter((token) => token.length > 2));
  let partial = false;
  for (const name of observedNames) {
    const normalized = normalizeBusinessName(name.value);
    if (normalized === expected) return "agrees";
    const observedTokens = new Set(normalized.split(" ").filter((token) => token.length > 2));
    const overlap = [...expectedTokens].filter((token) => observedTokens.has(token)).length;
    if (overlap >= Math.min(2, expectedTokens.size)) partial = true;
  }
  return partial ? "ambiguous" : "conflicts";
}
