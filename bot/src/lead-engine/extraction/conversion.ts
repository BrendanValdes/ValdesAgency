import type { EvidenceValue } from "../crawl/types.js";
import type { HtmlExtraction } from "./html.js";
import { extractLinks } from "./links.js";

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
  evidence: EvidenceValue<string>;
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
    if (link.kind === "telephone") result.push({ feature: "click_to_call", evidence: value });
    if (link.kind === "contact") result.push({ feature: "contact_route", evidence: value });
    if (link.kind === "services") result.push({ feature: "service_route", evidence: value });
    if (link.kind === "booking" || /\b(?:book|schedule|appointment)\b/i.test(link.text)) result.push({ feature: "booking", evidence: value });
    if (/\b(?:estimate|quote|request service)\b/i.test(link.text)) result.push({ feature: "estimate_request", evidence: value });
    if (cta(link.text)) result.push({ feature: "primary_cta", evidence: value });
  }
  for (const form of input.html.forms) {
    const formPurpose = `${form.action ?? ""} ${form.text}`;
    if (/\b(?:contact|message|email|phone|name|estimate|quote|request|service)\b/i.test(formPurpose)) {
      result.push({ feature: "contact_form", evidence: form.evidence });
    }
    if (/\b(?:estimate|quote)\b/i.test(form.text)) result.push({ feature: "estimate_request", evidence: form.evidence });
    if (/\b(?:book|schedule|appointment)\b/i.test(form.text)) result.push({ feature: "booking", evidence: form.evidence });
  }
  if (input.html.viewport) result.push({ feature: "mobile_viewport", evidence: input.html.viewport });
  const source = input.html.title ?? input.html.headings[0] ?? input.html.viewport;
  if (source && new URL(input.html.title?.pageUrl ?? input.homepage).protocol === "https:") {
    result.push({ feature: "https", evidence: { ...source, value: "https" } });
  }
  if (source && input.validResponse) result.push({ feature: "valid_page_response", evidence: { ...source, value: "usable_http_response" } });
  return result;
}
