import type { EvidenceValue } from "../crawl/types.js";
import type { HtmlExtraction } from "./html.js";
import { extractLinks } from "./links.js";
import type { ClaimState, ProvenanceSourceClass } from "../domain/provenance.js";

export type ConversionFeature =
  | "click_to_call"
  | "contact_form"
  | "estimate_request"
  | "booking"
  | "primary_cta"
  | "contact_route"
  | "mobile_viewport"
  | "https"
  | "valid_page_response"
  | "service_route";

export interface ConversionSignal {
  feature: ConversionFeature;
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
  evidence: EvidenceValue<string>;
}

function signal(feature: ConversionFeature, evidence: EvidenceValue<string>): ConversionSignal {
  return { feature, sourceClass: evidence.sourceClass, claimState: evidence.claimState, evidence };
}

function cta(text: string): boolean {
  return /\b(?:contact|call|book|schedule|get started|request|quote|estimate)\b/i.test(text);
}

export function extractConversionSignals(input: {
  html: HtmlExtraction;
  homepage: string;
  validResponse: boolean;
}): ConversionSignal[] {
  const result: ConversionSignal[] = [];
  const links = extractLinks(input.html, input.homepage);
  for (const link of links) {
    const value = { ...link.evidence, value: link.url };
    if (link.kind === "telephone") result.push(signal("click_to_call", value));
    if (link.kind === "contact") result.push(signal("contact_route", value));
    if (link.kind === "services") result.push(signal("service_route", value));
    if (link.kind === "booking" || /\b(?:book|schedule|appointment)\b/i.test(link.text)) result.push(signal("booking", value));
    if (/\b(?:estimate|quote|request service)\b/i.test(link.text)) result.push(signal("estimate_request", value));
    if (cta(link.text)) result.push(signal("primary_cta", value));
  }
  for (const form of input.html.forms) {
    const formPurpose = `${form.action ?? ""} ${form.text}`;
    if (/\b(?:contact|message|email|phone|name|estimate|quote|request|service)\b/i.test(formPurpose)) {
      result.push(signal("contact_form", form.evidence));
    }
    if (/\b(?:estimate|quote)\b/i.test(form.text)) result.push(signal("estimate_request", form.evidence));
    if (/\b(?:book|schedule|appointment)\b/i.test(form.text)) result.push(signal("booking", form.evidence));
  }
  if (input.html.viewport) result.push(signal("mobile_viewport", input.html.viewport));
  const source = input.html.title ?? input.html.headings[0] ?? input.html.viewport;
  if (source && new URL(input.html.title?.pageUrl ?? input.homepage).protocol === "https:") {
    result.push(signal("https", { ...source, value: "https" }));
  }
  if (source && input.validResponse) result.push(signal("valid_page_response", { ...source, value: "usable_http_response" }));
  return result;
}
