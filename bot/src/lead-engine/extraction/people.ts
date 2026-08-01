import type { EvidenceValue } from "../crawl/types.js";
import { EXTRACTION_POLICY_VERSION } from "../crawl/types.js";
import { normalizeBusinessName } from "../identity/normalize.js";
import type { HtmlExtraction } from "./html.js";
import type { JsonLdExtraction, JsonLdPerson } from "./json-ld.js";

export interface PersonEvidenceCandidate {
  displayedName: string;
  displayedTitle: string | null;
  candidateStatus: "unverified_evidence_candidate";
  ambiguityState: "none" | "ambiguous" | "conflicting";
  evidence: EvidenceValue<JsonLdPerson>;
}

const ORGANIZATION_TERM = /\b(?:llc|inc|corp|corporation|company|services?|pools?|solutions?|group|plumbing|landscaping|hvac)\b/i;
const PERSON_NAME = /[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+){1,3}/u;

function validPersonName(name: string, businessNames: ReadonlyArray<string>): boolean {
  const normalized = normalizeBusinessName(name);
  return Boolean(
    PERSON_NAME.test(name) &&
    !ORGANIZATION_TERM.test(name) &&
    !businessNames.some((businessName) => normalizeBusinessName(businessName) === normalized),
  );
}

function htmlEvidence(
  html: HtmlExtraction,
  value: JsonLdPerson,
  selector: string,
): EvidenceValue<JsonLdPerson> {
  const source = html.title ?? html.headings[0] ?? html.copyrightTexts[0];
  return {
    value,
    pageUrl: source?.pageUrl ?? "",
    extractionMethod: "html",
    selector,
    structuredDataPath: null,
    observedAt: source?.observedAt ?? "",
    fetchedAt: source?.fetchedAt ?? "",
    contentChecksum: source?.contentChecksum ?? "",
    extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
    confidence: "medium",
  };
}

export function extractPersonCandidates(input: {
  html: HtmlExtraction;
  jsonLd: JsonLdExtraction;
  knownBusinessNames: ReadonlyArray<string>;
}): PersonEvidenceCandidate[] {
  const candidates: PersonEvidenceCandidate[] = [];
  for (const person of input.jsonLd.people) {
    if (!validPersonName(person.value.name, input.knownBusinessNames)) continue;
    candidates.push({
      displayedName: person.value.name,
      displayedTitle: person.value.title,
      candidateStatus: "unverified_evidence_candidate",
      ambiguityState: person.value.title ? "none" : "ambiguous",
      evidence: person,
    });
  }

  const patterns = [
    new RegExp(`(?:owner|founder|president|manager|director)\\s*[:–—-]\\s*(${PERSON_NAME.source})`, "giu"),
    new RegExp(`(${PERSON_NAME.source})\\s*[,–—-]\\s*(owner|founder|president|manager|director)`, "giu"),
    new RegExp(`(?:founded|owned|led)\\s+by\\s+(${PERSON_NAME.source})`, "giu"),
  ];
  for (const [patternIndex, pattern] of patterns.entries()) {
    for (const match of input.html.visibleText.matchAll(pattern)) {
      const name = (match[1] ?? "").trim();
      if (!validPersonName(name, input.knownBusinessNames)) continue;
      const title = patternIndex === 1 ? (match[2] ?? null) :
        /owner/i.test(match[0] ?? "") ? "Owner" :
        /found/i.test(match[0] ?? "") ? "Founder" :
        /president/i.test(match[0] ?? "") ? "President" :
        /manager/i.test(match[0] ?? "") ? "Manager" : null;
      candidates.push({
        displayedName: name,
        displayedTitle: title,
        candidateStatus: "unverified_evidence_candidate",
        ambiguityState: title ? "none" : "ambiguous",
        evidence: htmlEvidence(input.html, { name, title }, `text:person-pattern(${patternIndex + 1})`),
      });
    }
  }
  const byName = new Map<string, PersonEvidenceCandidate>();
  for (const candidate of candidates) {
    const key = normalizeBusinessName(candidate.displayedName);
    const existing = byName.get(key);
    if (!existing) byName.set(key, candidate);
    else if (existing.displayedTitle !== candidate.displayedTitle && candidate.displayedTitle) {
      byName.set(key, { ...existing, ambiguityState: "conflicting" });
    }
  }
  return [...byName.values()].sort((left, right) => left.displayedName.localeCompare(right.displayedName));
}
