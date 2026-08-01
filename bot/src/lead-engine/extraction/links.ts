import type { EvidenceValue, PageKind } from "../crawl/types.js";
import { classifyPage } from "../crawl/page-priority.js";
import type { HtmlExtraction } from "./html.js";

export interface ExtractedLink {
  url: string;
  kind: PageKind | "social" | "telephone" | "email" | "external";
  text: string;
  evidence: EvidenceValue<string>;
}

const SOCIAL_HOST = /(?:^|\.)(?:facebook\.com|instagram\.com|linkedin\.com|x\.com|twitter\.com|youtube\.com|tiktok\.com|social\.example)$/i;

export function extractLinks(html: HtmlExtraction, homepage: string): ExtractedLink[] {
  const result: ExtractedLink[] = [];
  const seen = new Set<string>();
  for (const anchor of html.anchors) {
    const href = anchor.href.trim();
    if (/^tel:/i.test(href)) {
      result.push({ url: href, kind: "telephone", text: anchor.text, evidence: anchor.evidence });
      continue;
    }
    if (/^mailto:/i.test(href)) {
      result.push({ url: href, kind: "email", text: anchor.text, evidence: anchor.evidence });
      continue;
    }
    let url: URL;
    try {
      url = new URL(href, html.title?.pageUrl ?? homepage);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    url.hash = "";
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const home = new URL(homepage);
    const kind = url.origin === home.origin
      ? classifyPage(url.href, homepage)
      : SOCIAL_HOST.test(url.hostname) ? "social" : "external";
    result.push({ url: url.href, kind, text: anchor.text, evidence: anchor.evidence });
  }
  return result;
}
