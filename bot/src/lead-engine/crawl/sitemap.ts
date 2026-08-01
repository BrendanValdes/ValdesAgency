export function extractSitemapUrls(xml: string, maximumUrls: number): string[] {
  if (!Number.isInteger(maximumUrls) || maximumUrls < 0 || maximumUrls > 500) {
    throw new Error("Sitemap URL limit must be between zero and 500");
  }
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const match of xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi)) {
    const value = (match[1] ?? "")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    urls.push(value);
    if (urls.length >= maximumUrls) break;
  }
  return urls;
}

export function sitemapFiles(input: {
  origin: string;
  robotsSitemaps: ReadonlyArray<string>;
  maximumFiles: number;
}): string[] {
  const candidates = input.robotsSitemaps.length > 0
    ? input.robotsSitemaps
    : [new URL("/sitemap.xml", input.origin).href];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of candidates) {
    try {
      const url = new URL(value, input.origin);
      if (url.origin !== input.origin || seen.has(url.href)) continue;
      seen.add(url.href);
      result.push(url.href);
      if (result.length >= input.maximumFiles) break;
    } catch {
      continue;
    }
  }
  return result;
}
