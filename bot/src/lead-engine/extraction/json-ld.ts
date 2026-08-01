import type { EvidenceValue } from "../crawl/types.js";
import { EXTRACTION_POLICY_VERSION } from "../crawl/types.js";
import { parseHtmlAttributes } from "./html.js";
import type { HtmlExtractionContext } from "./html.js";

export interface JsonLdPerson {
  name: string;
  title: string | null;
}

export interface JsonLdExtraction {
  schemaTypes: ReadonlyArray<EvidenceValue<string>>;
  organizationNames: ReadonlyArray<EvidenceValue<string>>;
  addresses: ReadonlyArray<EvidenceValue<string>>;
  contactPoints: ReadonlyArray<EvidenceValue<string>>;
  services: ReadonlyArray<EvidenceValue<string>>;
  people: ReadonlyArray<EvidenceValue<JsonLdPerson>>;
  sameAs: ReadonlyArray<EvidenceValue<string>>;
  malformedBlocks: number;
}

function evidence<T>(context: HtmlExtractionContext, value: T, path: string, confidence: EvidenceValue<T>["confidence"] = "high"): EvidenceValue<T> {
  return {
    value,
    pageUrl: context.pageUrl,
    extractionMethod: "json_ld",
    selector: 'script[type="application/ld+json"]',
    structuredDataPath: path,
    observedAt: context.observedAt,
    fetchedAt: context.fetchedAt,
    contentChecksum: context.contentChecksum,
    extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
    confidence,
  };
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : null;
}

function schemaTypes(value: unknown): string[] {
  return values(value).map(stringValue).filter((item): item is string => Boolean(item));
}

function postalAddress(value: unknown): string | null {
  if (typeof value === "string") return stringValue(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  return [item.streetAddress, item.addressLocality, item.addressRegion, item.postalCode, item.addressCountry]
    .map(stringValue)
    .filter((part): part is string => Boolean(part))
    .join(", ") || null;
}

export function extractJsonLd(html: string, context: HtmlExtractionContext): JsonLdExtraction {
  const result: {
    schemaTypes: EvidenceValue<string>[];
    organizationNames: EvidenceValue<string>[];
    addresses: EvidenceValue<string>[];
    contactPoints: EvidenceValue<string>[];
    services: EvidenceValue<string>[];
    people: EvidenceValue<JsonLdPerson>[];
    sameAs: EvidenceValue<string>[];
    malformedBlocks: number;
  } = { schemaTypes: [], organizationNames: [], addresses: [], contactPoints: [], services: [], people: [], sameAs: [], malformedBlocks: 0 };
  let blockIndex = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)(?:<\/script\s*>|$)/gi)) {
    const attributes = parseHtmlAttributes(match[1] ?? "");
    if ((attributes.type ?? "").toLocaleLowerCase("en-US") !== "application/ld+json") continue;
    blockIndex += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[2] ?? "");
    } catch {
      result.malformedBlocks += 1;
      continue;
    }
    const queue: Array<{ value: unknown; path: string }> = [{ value: parsed, path: `$[${blockIndex}]` }];
    let visited = 0;
    while (queue.length > 0 && visited < 500) {
      visited += 1;
      const current = queue.shift() as { value: unknown; path: string };
      if (Array.isArray(current.value)) {
        current.value.forEach((value, index) => queue.push({ value, path: `${current.path}[${index}]` }));
        continue;
      }
      if (!current.value || typeof current.value !== "object") continue;
      const item = current.value as Record<string, unknown>;
      const types = schemaTypes(item["@type"]);
      for (const [index, type] of types.entries()) result.schemaTypes.push(evidence(context, type, `${current.path}.@type[${index}]`));
      const isOrganization = types.some((type) => type === "Organization" || type === "LocalBusiness" || /Business$/.test(type));
      const isPerson = types.includes("Person");
      const isService = types.includes("Service");
      const name = stringValue(item.name);
      if (isOrganization && name) result.organizationNames.push(evidence(context, name, `${current.path}.name`));
      if (isPerson && name) {
        result.people.push(evidence(context, {
          name,
          title: stringValue(item.jobTitle) ?? stringValue(item.title),
        }, current.path));
      }
      if (isService) {
        const service = name ?? stringValue(item.serviceType) ?? stringValue(item.description);
        if (service) result.services.push(evidence(context, service, `${current.path}.${name ? "name" : item.serviceType ? "serviceType" : "description"}`));
      }
      for (const [index, address] of values(item.address).entries()) {
        const formatted = postalAddress(address);
        if (formatted) result.addresses.push(evidence(context, formatted, `${current.path}.address[${index}]`));
      }
      for (const [index, contact] of values(item.contactPoint).entries()) {
        if (!contact || typeof contact !== "object" || Array.isArray(contact)) continue;
        const point = contact as Record<string, unknown>;
        for (const key of ["telephone", "email"] as const) {
          const value = stringValue(point[key]);
          if (value) result.contactPoints.push(evidence(context, value, `${current.path}.contactPoint[${index}].${key}`));
        }
      }
      for (const [index, link] of values(item.sameAs).entries()) {
        const value = stringValue(link);
        if (value) result.sameAs.push(evidence(context, value, `${current.path}.sameAs[${index}]`));
      }
      for (const [key, child] of Object.entries(item)) {
        if (["address", "contactPoint", "sameAs"].includes(key)) continue;
        if (child && typeof child === "object") queue.push({ value: child, path: `${current.path}.${key}` });
      }
    }
  }
  return result;
}
