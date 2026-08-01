import { describe, expect, it } from "vitest";
import { canonicalPageUrl, planPages } from "../../src/lead-engine/crawl/page-priority.js";
import { extractSitemapUrls, sitemapFiles } from "../../src/lead-engine/crawl/sitemap.js";

describe("crawl page priority", () => {
  const homepage = "https://clearwater.example/";

  it("orders homepage, contact, about, team, services, booking, then sitemap", () => {
    const plan = planPages({
      homepage,
      linkUrls: ["/booking", "/services", "/team", "/about", "/contact"],
      sitemapUrls: ["/misc"],
      maximumPages: 7,
    });
    expect(plan.map(({ kind }) => kind)).toEqual(["homepage", "contact", "about", "team", "services", "booking", "sitemap_discovered"]);
  });

  it("removes duplicates, tracking parameters, external domains, archives, and files", () => {
    const plan = planPages({
      homepage,
      linkUrls: ["/contact#top", "/contact", "/contact?utm_source=test", "https://other.example/contact", "/blog/archive", "/file.pdf"],
      maximumPages: 7,
    });
    expect(plan.map(({ url }) => url)).toEqual([homepage, "https://clearwater.example/contact"]);
    expect(canonicalPageUrl("https://CLEARWATER.example//contact/?utm_source=x&b=2&a=1#x")).toBe("https://clearwater.example/contact?a=1&b=2");
  });

  it("stops at the configured page limit", () => {
    expect(planPages({ homepage, linkUrls: ["/contact", "/about", "/team"], maximumPages: 2 })).toHaveLength(2);
  });

  it("bounds sitemap files and inspected URLs while rejecting external sitemap files", () => {
    const files = sitemapFiles({
      origin: "https://clearwater.example",
      robotsSitemaps: ["/one.xml", "/two.xml", "/three.xml", "https://other.example/site.xml"],
      maximumFiles: 2,
    });
    expect(files).toEqual(["https://clearwater.example/one.xml", "https://clearwater.example/two.xml"]);
    expect(extractSitemapUrls("<urlset><url><loc>/a</loc></url><url><loc>/a</loc></url><url><loc>/b</loc></url><url><loc>/c</loc></url></urlset>", 2)).toEqual(["/a", "/b"]);
  });
});
