import { extractHtml } from "../extraction/html.js";
import { extractLinks } from "../extraction/links.js";
import { provenanceForFetcherSource } from "../domain/provenance.js";
import { planPages } from "./page-priority.js";
import { DEFAULT_CRAWL_LIMITS, validateCrawlLimits } from "./policies.js";
import { RobotsPolicyService } from "./robots.js";
import { extractSitemapUrls, sitemapFiles } from "./sitemap.js";
import type {
  CrawlLimits,
  CrawlPage,
  CrawlResult,
  PageKind,
  RobotsDecision,
  SafeFetcher,
} from "./types.js";

function homepageUrl(input: string): string {
  const value = new URL(input);
  value.hash = "";
  value.pathname = "/";
  value.search = "";
  return value.href;
}

function statusForFailure(errorCode: string): CrawlPage["inspectionStatus"] {
  if (["policy_rejected", "destination_blocked", "authentication_required"].includes(errorCode)) return "blocked";
  if (["unsupported_content_type", "invalid_url", "unsupported_scheme"].includes(errorCode)) return "unavailable";
  return "failed";
}

export class WebsiteCrawler {
  readonly #fetcher: SafeFetcher;
  readonly #robots: RobotsPolicyService;
  readonly #limits: CrawlLimits;
  readonly #now: () => Date;

  constructor(options: {
    fetcher: SafeFetcher;
    robots?: RobotsPolicyService;
    limits?: CrawlLimits;
    now?: () => Date;
  }) {
    this.#fetcher = options.fetcher;
    this.#limits = validateCrawlLimits(options.limits ?? DEFAULT_CRAWL_LIMITS);
    this.#now = options.now ?? (() => new Date());
    this.#robots = options.robots ?? new RobotsPolicyService({ fetcher: options.fetcher, now: this.#now });
  }

  async crawl(input: {
    websiteUrl: string;
    observedAt?: string;
    signal?: AbortSignal;
  }): Promise<CrawlResult> {
    const started = this.#now();
    const sourceClass = provenanceForFetcherSource(this.#fetcher.sourceClass);
    let homepage: string;
    try {
      homepage = homepageUrl(input.websiteUrl);
    } catch {
      const timestamp = started.toISOString();
      const unavailableRobots: RobotsDecision = {
        origin: "",
        robotsUrl: "",
        status: "unavailable",
        reason: "fetch_failed",
        matchedRule: null,
        fetchedAt: timestamp,
        expiresAt: timestamp,
        contentChecksum: null,
        sitemapUrls: [],
      };
      return { requestedUrl: input.websiteUrl, sourceClass, canonicalHomepage: null, startedAt: timestamp, completedAt: timestamp, pages: [], robots: unavailableRobots, robotsDecisions: [unavailableRobots], complete: false, timedOut: false };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("crawl_duration_exceeded"), this.#limits.crawlDurationMs);
    const cancel = () => controller.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", cancel, { once: true });
    const pages: CrawlPage[] = [];
    const robotsDecisions: RobotsDecision[] = [];
    const discoveredLinks: string[] = [];
    const discoveredSitemapUrls: string[] = [];
    const visited = new Set<string>();
    let homeRobots: RobotsDecision;
    try {
      homeRobots = await this.#robots.decide(homepage, controller.signal);
      robotsDecisions.push(homeRobots);
      if (homeRobots.status !== "allowed") {
        pages.push({ url: homepage, kind: "homepage", inspectionStatus: "blocked", fetch: null, html: null });
        return {
          requestedUrl: input.websiteUrl,
          sourceClass,
          canonicalHomepage: homepage,
          startedAt: started.toISOString(),
          completedAt: this.#now().toISOString(),
          pages,
          robots: homeRobots,
          robotsDecisions,
          complete: false,
          timedOut: controller.signal.aborted && !input.signal?.aborted,
        };
      }

      const inspect = async (url: string, kind: PageKind): Promise<void> => {
        const decision = url === homepage ? homeRobots : await this.#robots.decide(url, controller.signal);
        if (url !== homepage) robotsDecisions.push(decision);
        if (decision.status !== "allowed") {
          pages.push({ url, kind, inspectionStatus: "blocked", fetch: null, html: null });
          return;
        }
        const fetched = await this.#fetcher.fetch({ url, signal: controller.signal });
        if (!fetched.ok) {
          pages.push({ url, kind, inspectionStatus: statusForFailure(fetched.errorCode), fetch: fetched, html: null });
          return;
        }
        const usable = fetched.status >= 200 && fetched.status < 300 && ["text/html", "application/xhtml+xml"].includes(fetched.contentType);
        if (!usable) {
          pages.push({ url: fetched.finalUrl, kind, inspectionStatus: "unavailable", fetch: fetched, html: null });
          return;
        }
        pages.push({ url: fetched.finalUrl, kind, inspectionStatus: "successful", fetch: fetched, html: fetched.body });
        const extracted = extractHtml(fetched.body, {
          pageUrl: fetched.finalUrl,
          observedAt: input.observedAt ?? fetched.fetchedAt,
          fetchedAt: fetched.fetchedAt,
          contentChecksum: fetched.contentChecksum,
          sourceClass,
        });
        discoveredLinks.push(...extractLinks(extracted, homepage).filter((link) => !["external", "social", "telephone", "email"].includes(link.kind)).map((link) => link.url));
      };

      visited.add(homepage);
      await inspect(homepage, "homepage");
      if (pages[0]?.inspectionStatus === "successful") {
        let inspectedSitemapUrls = 0;
        for (const sitemapUrl of sitemapFiles({ origin: new URL(homepage).origin, robotsSitemaps: homeRobots.sitemapUrls, maximumFiles: this.#limits.maxSitemapFiles })) {
          if (controller.signal.aborted) break;
          const decision = await this.#robots.decide(sitemapUrl, controller.signal);
          robotsDecisions.push(decision);
          if (decision.status !== "allowed") continue;
          const sitemap = await this.#fetcher.fetch({ url: sitemapUrl, signal: controller.signal });
          if (!sitemap.ok || sitemap.status < 200 || sitemap.status >= 300 || !["application/xml", "text/xml", "text/plain"].includes(sitemap.contentType)) continue;
          const remaining = this.#limits.maxSitemapUrls - inspectedSitemapUrls;
          if (remaining <= 0) break;
          const urls = extractSitemapUrls(sitemap.body, remaining);
          inspectedSitemapUrls += urls.length;
          discoveredSitemapUrls.push(...urls);
        }
      }

      while (pages.length < this.#limits.maxPages && !controller.signal.aborted) {
        const next = planPages({
          homepage,
          linkUrls: discoveredLinks,
          sitemapUrls: discoveredSitemapUrls,
          maximumPages: this.#limits.maxPages,
        }).find((candidate) => !visited.has(candidate.url));
        if (!next) break;
        visited.add(next.url);
        await inspect(next.url, next.kind);
      }
      const complete = !controller.signal.aborted && pages.length > 0 && pages[0]?.inspectionStatus === "successful" && pages.every((page) => page.inspectionStatus === "successful");
      return {
        requestedUrl: input.websiteUrl,
        sourceClass,
        canonicalHomepage: homepage,
        startedAt: started.toISOString(),
        completedAt: this.#now().toISOString(),
        pages,
        robots: homeRobots,
        robotsDecisions,
        complete,
        timedOut: controller.signal.aborted && !input.signal?.aborted,
      };
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", cancel);
    }
  }
}
