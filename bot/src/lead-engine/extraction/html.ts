import type { EvidenceValue } from "../crawl/types.js";
import { EXTRACTION_POLICY_VERSION } from "../crawl/types.js";

export interface HtmlExtractionContext {
  pageUrl: string;
  observedAt: string;
  fetchedAt: string;
  contentChecksum: string;
}

export interface HtmlAnchor {
  href: string;
  text: string;
  rel: string | null;
  evidence: EvidenceValue<string>;
}

export interface HtmlForm {
  action: string | null;
  method: string;
  text: string;
  evidence: EvidenceValue<string>;
}

export interface HtmlExtraction {
  title: EvidenceValue<string> | null;
  metaDescription: EvidenceValue<string> | null;
  canonicalUrl: EvidenceValue<string> | null;
  language: EvidenceValue<string> | null;
  viewport: EvidenceValue<string> | null;
  headings: ReadonlyArray<EvidenceValue<string>>;
  anchors: ReadonlyArray<HtmlAnchor>;
  forms: ReadonlyArray<HtmlForm>;
  addressTexts: ReadonlyArray<EvidenceValue<string>>;
  copyrightTexts: ReadonlyArray<EvidenceValue<string>>;
  visibleText: string;
}

export function decodeHtmlEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (_match, decimal, hex, name) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    return named[String(name).toLocaleLowerCase("en-US")] ?? _match;
  });
}

export function parseHtmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = (match[1] ?? "").toLocaleLowerCase("en-US");
    if (!name || name === "<") continue;
    attributes[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

export function textContent(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function evidence(
  context: HtmlExtractionContext,
  value: string,
  selector: string,
  confidence: EvidenceValue<string>["confidence"] = "high",
): EvidenceValue<string> {
  return {
    value: value.trim().replace(/\s+/g, " "),
    pageUrl: context.pageUrl,
    extractionMethod: "html",
    selector,
    structuredDataPath: null,
    observedAt: context.observedAt,
    fetchedAt: context.fetchedAt,
    contentChecksum: context.contentChecksum,
    extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
    confidence,
  };
}

function firstTagText(html: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)(?:<\\/${tag}\\s*>|$)`, "i").exec(html);
  const value = match ? textContent(match[1] ?? "") : "";
  return value || null;
}

export function extractHtml(html: string, context: HtmlExtractionContext): HtmlExtraction {
  const titleValue = firstTagText(html, "title");
  const htmlTag = /<html\b([^>]*)>/i.exec(html);
  const htmlAttributes = parseHtmlAttributes(htmlTag?.[1] ?? "");
  let metaDescription: EvidenceValue<string> | null = null;
  let viewport: EvidenceValue<string> | null = null;
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = parseHtmlAttributes(match[1] ?? "");
    const name = (attributes.name ?? attributes.property ?? "").toLocaleLowerCase("en-US");
    if (name === "description" && attributes.content && !metaDescription) {
      metaDescription = evidence(context, attributes.content, 'meta[name="description"]');
    }
    if (name === "viewport" && attributes.content && !viewport) {
      viewport = evidence(context, attributes.content, 'meta[name="viewport"]');
    }
  }

  let canonicalUrl: EvidenceValue<string> | null = null;
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = parseHtmlAttributes(match[1] ?? "");
    if ((attributes.rel ?? "").split(/\s+/).some((value) => value.toLocaleLowerCase("en-US") === "canonical") && attributes.href) {
      try {
        canonicalUrl = evidence(context, new URL(attributes.href, context.pageUrl).href, 'link[rel="canonical"]');
      } catch {
        canonicalUrl = null;
      }
      break;
    }
  }

  const headings: EvidenceValue<string>[] = [];
  let headingIndex = 0;
  for (const match of html.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)(?:<\/\1\s*>|$)/gi)) {
    const value = textContent(match[2] ?? "");
    if (!value) continue;
    headingIndex += 1;
    headings.push(evidence(context, value, `${(match[1] ?? "h").toLocaleLowerCase("en-US")}:nth-of-type(${headingIndex})`));
  }

  const anchors: HtmlAnchor[] = [];
  let anchorIndex = 0;
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)(?:<\/a\s*>|$)/gi)) {
    const attributes = parseHtmlAttributes(match[1] ?? "");
    if (!attributes.href) continue;
    anchorIndex += 1;
    const label = textContent(match[2] ?? "") || attributes["aria-label"] || attributes.title || attributes.href;
    anchors.push({
      href: attributes.href,
      text: label,
      rel: attributes.rel ?? null,
      evidence: evidence(context, attributes.href, `a:nth-of-type(${anchorIndex})`),
    });
  }

  const forms: HtmlForm[] = [];
  let formIndex = 0;
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)(?:<\/form\s*>|$)/gi)) {
    formIndex += 1;
    const attributes = parseHtmlAttributes(match[1] ?? "");
    forms.push({
      action: attributes.action ?? null,
      method: (attributes.method ?? "get").toLocaleLowerCase("en-US"),
      text: textContent(match[2] ?? ""),
      evidence: evidence(context, "contact_form", `form:nth-of-type(${formIndex})`),
    });
  }

  const addressTexts: EvidenceValue<string>[] = [];
  let addressIndex = 0;
  for (const match of html.matchAll(/<address\b[^>]*>([\s\S]*?)(?:<\/address\s*>|$)/gi)) {
    const value = textContent(match[1] ?? "");
    if (!value) continue;
    addressIndex += 1;
    addressTexts.push(evidence(context, value, `address:nth-of-type(${addressIndex})`, "medium"));
  }

  const visibleText = textContent(html);
  const copyrightTexts = [...visibleText.matchAll(/(?:©|copyright\s*)\s*(?:19|20)\d{2}(?:\s*[-–]\s*(?:19|20)\d{2})?\s+([^|•]+?)(?=\s{2,}|all rights|privacy|terms|$)/gi)]
    .map((match, index) => evidence(context, (match[0] ?? "").trim(), `text:copyright(${index + 1})`, "medium"));

  return {
    title: titleValue ? evidence(context, titleValue, "title") : null,
    metaDescription,
    canonicalUrl,
    language: htmlAttributes.lang ? evidence(context, htmlAttributes.lang, "html[lang]") : null,
    viewport,
    headings,
    anchors,
    forms,
    addressTexts,
    copyrightTexts,
    visibleText,
  };
}
