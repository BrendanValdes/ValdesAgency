import type { EvidenceValue } from "../crawl/types.js";
import type { NicheConfiguration } from "../config/niches.js";
import type { HtmlExtraction } from "./html.js";
import type { JsonLdExtraction } from "./json-ld.js";
import type { ClaimState, ProvenanceSourceClass } from "../domain/provenance.js";

export interface ServiceEvidenceObservation {
  state: "positive" | "negative" | "ambiguous" | "unavailable";
  term: string | null;
  basis: "heading" | "service_description" | "json_ld_service" | "navigation" | "provider_category" | "not_available";
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
  evidence: EvidenceValue<string> | null;
}

function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, "i").test(text);
}

export function extractServiceEvidence(input: {
  html: HtmlExtraction | null;
  jsonLd: JsonLdExtraction | null;
  niche: Pick<NicheConfiguration, "service_synonyms" | "required_indicators" | "negative_keywords" | "excluded_adjacent_industries" | "relevant_categories">;
  providerCategories?: ReadonlyArray<string>;
  providerSourceClass?: ProvenanceSourceClass;
}): ServiceEvidenceObservation[] {
  if (!input.html || !input.jsonLd) {
    return [{ state: "unavailable", term: null, basis: "not_available", sourceClass: "synthetic_fixture", claimState: "unknown", evidence: null }];
  }
  const result: ServiceEvidenceObservation[] = [];
  const positiveTerms = [...input.niche.service_synonyms, ...input.niche.required_indicators];
  for (const heading of input.html.headings) {
    for (const term of positiveTerms) {
      if (containsTerm(heading.value, term)) result.push({ state: "positive", term, basis: "heading", sourceClass: heading.sourceClass, claimState: heading.claimState, evidence: heading });
    }
    for (const term of input.niche.excluded_adjacent_industries) {
      if (containsTerm(heading.value, term)) result.push({ state: "ambiguous", term, basis: "heading", sourceClass: heading.sourceClass, claimState: heading.claimState, evidence: heading });
    }
  }
  for (const service of input.jsonLd.services) {
    for (const term of positiveTerms) {
      if (containsTerm(service.value, term)) result.push({ state: "positive", term, basis: "json_ld_service", sourceClass: service.sourceClass, claimState: service.claimState, evidence: service });
    }
  }
  for (const term of input.niche.negative_keywords) {
    if (containsTerm(input.html.visibleText, term)) {
      const source = input.html.title ?? input.html.headings[0] ?? null;
      result.push({ state: "negative", term, basis: "service_description", sourceClass: source?.sourceClass ?? "synthetic_fixture", claimState: source?.claimState ?? "unknown", evidence: source ? { ...source, value: term, confidence: "medium" } : null });
    }
  }
  for (const category of input.providerCategories ?? []) {
    for (const relevant of input.niche.relevant_categories) {
      if (containsTerm(category, relevant)) {
        result.push({ state: "positive", term: relevant, basis: "provider_category", sourceClass: input.providerSourceClass ?? "synthetic_fixture", claimState: "observed", evidence: null });
      }
    }
  }
  const seen = new Set<string>();
  return result.filter((observation) => {
    const key = `${observation.state}:${observation.basis}:${observation.term ?? ""}:${observation.evidence?.pageUrl ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
