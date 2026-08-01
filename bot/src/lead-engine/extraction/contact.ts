import type { EvidenceValue } from "../crawl/types.js";
import type { HtmlExtraction } from "./html.js";
import type { JsonLdExtraction } from "./json-ld.js";
import { extractLinks } from "./links.js";

export interface ContactObservation {
  kind: "phone" | "email" | "address";
  displayedValue: string;
  candidateStatus: "public_unverified";
  evidence: EvidenceValue<string>;
}

function contactValue(value: string, scheme: "tel" | "mailto"): string | null {
  const withoutScheme = value.slice(scheme.length + 1).split("?", 1)[0] ?? "";
  try {
    const decoded = decodeURIComponent(withoutScheme).trim();
    return decoded || null;
  } catch {
    return withoutScheme.trim() || null;
  }
}

export function extractContactInformation(input: {
  html: HtmlExtraction;
  jsonLd: JsonLdExtraction;
  homepage: string;
}): ContactObservation[] {
  const observations: ContactObservation[] = [];
  for (const link of extractLinks(input.html, input.homepage)) {
    if (link.kind !== "telephone" && link.kind !== "email") continue;
    const scheme = link.kind === "telephone" ? "tel" : "mailto";
    const value = contactValue(link.url, scheme);
    if (!value) continue;
    observations.push({
      kind: link.kind === "telephone" ? "phone" : "email",
      displayedValue: value,
      candidateStatus: "public_unverified",
      evidence: { ...link.evidence, value },
    });
  }
  for (const address of input.html.addressTexts) {
    observations.push({ kind: "address", displayedValue: address.value, candidateStatus: "public_unverified", evidence: address });
  }
  for (const address of input.jsonLd.addresses) {
    observations.push({ kind: "address", displayedValue: address.value, candidateStatus: "public_unverified", evidence: address });
  }
  for (const point of input.jsonLd.contactPoints) {
    const kind = point.value.includes("@") ? "email" : "phone";
    observations.push({ kind, displayedValue: point.value, candidateStatus: "public_unverified", evidence: point });
  }
  const seen = new Set<string>();
  return observations.filter((observation) => {
    const key = `${observation.kind}:${observation.displayedValue.toLocaleLowerCase("en-US")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
