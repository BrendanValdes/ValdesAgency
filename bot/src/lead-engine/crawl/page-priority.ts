import type { PageKind } from "./types.js";

const BLOCKED_PATH = /(?:^|\/)(?:blog|news|articles?|tags?|search|cart|checkout|account|login|privacy|legal|terms|calendar|events?|page\/\d+)(?:\/|$)/i;

const KIND_RULES: ReadonlyArray<{ kind: PageKind; pattern: RegExp }> = [
  { kind: "contact", pattern: /(?:^|\/)(?:contact|contact-us|get-in-touch)(?:\/|$)/i },
  { kind: "about", pattern: /(?:^|\/)(?:about|about-us|our-story)(?:\/|$)/i },
  { kind: "team", pattern: /(?:^|\/)(?:team|our-team|leadership|staff)(?:\/|$)/i },
  { kind: "services", pattern: /(?:^|\/)(?:services?|what-we-do|pool-service)(?:\/|$)/i },
  { kind: "booking", pattern: /(?:^|\/)(?:book|booking|schedule|appointment|estimate|quote|request-estimate)(?:\/|$)/i },
];

const PRIORITY: Readonly<Record<PageKind, number>> = {
  homepage: 0,
  contact: 1,
  about: 2,
  team: 3,
  services: 4,
  booking: 5,
  sitemap_discovered: 6,
  other: 7,
};

export function classifyPage(url: string, homepage: string): PageKind {
  const candidate = new URL(url);
  const home = new URL(homepage);
  if (candidate.origin === home.origin && candidate.pathname.replace(/\/+$/, "") === home.pathname.replace(/\/+$/, "") && !candidate.search) {
    return "homepage";
  }
  return KIND_RULES.find(({ pattern }) => pattern.test(candidate.pathname))?.kind ?? "other";
}

export function isCrawlablePage(url: string, homepage: string): boolean {
  let candidate: URL;
  let home: URL;
  try {
    candidate = new URL(url);
    home = new URL(homepage);
  } catch {
    return false;
  }
  if (candidate.origin !== home.origin || candidate.username || candidate.password) return false;
  if (candidate.protocol !== "http:" && candidate.protocol !== "https:") return false;
  if (BLOCKED_PATH.test(candidate.pathname)) return false;
  if (/\.(?:pdf|zip|gz|tar|exe|dmg|mp[34]|avi|mov|jpe?g|png|gif|webp|svg|woff2?|ttf)$/i.test(candidate.pathname)) return false;
  return true;
}

export function canonicalPageUrl(url: string): string {
  const value = new URL(url);
  value.hash = "";
  value.hostname = value.hostname.toLocaleLowerCase("en-US").replace(/\.$/, "");
  value.pathname = value.pathname.replace(/\/{2,}/g, "/");
  if (value.pathname !== "/") value.pathname = value.pathname.replace(/\/$/, "");
  for (const key of [...value.searchParams.keys()]) {
    if (/^(?:utm_|fbclid|gclid)/i.test(key)) value.searchParams.delete(key);
  }
  value.searchParams.sort();
  return value.href;
}

export function planPages(input: {
  homepage: string;
  linkUrls?: ReadonlyArray<string>;
  sitemapUrls?: ReadonlyArray<string>;
  maximumPages: number;
}): Array<{ url: string; kind: PageKind }> {
  if (!Number.isInteger(input.maximumPages) || input.maximumPages < 1) {
    throw new Error("Page plan limit must be a positive integer");
  }
  const homepage = canonicalPageUrl(input.homepage);
  const candidates = new Map<string, { url: string; kind: PageKind }>();
  candidates.set(homepage, { url: homepage, kind: "homepage" });
  for (const [source, values] of [
    ["link", input.linkUrls ?? []],
    ["sitemap", input.sitemapUrls ?? []],
  ] as const) {
    for (const value of values) {
      let resolved: string;
      try {
        resolved = canonicalPageUrl(new URL(value, homepage).href);
      } catch {
        continue;
      }
      if (!isCrawlablePage(resolved, homepage)) continue;
      const classified = classifyPage(resolved, homepage);
      const kind = classified === "other" && source === "sitemap" ? "sitemap_discovered" : classified;
      const existing = candidates.get(resolved);
      if (!existing || PRIORITY[kind] < PRIORITY[existing.kind]) candidates.set(resolved, { url: resolved, kind });
    }
  }
  return [...candidates.values()]
    .sort((left, right) => PRIORITY[left.kind] - PRIORITY[right.kind] || left.url.localeCompare(right.url))
    .slice(0, input.maximumPages);
}
