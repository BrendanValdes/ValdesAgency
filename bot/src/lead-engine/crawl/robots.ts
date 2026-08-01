import { RESEARCH_CRAWLER_TOKEN } from "./policies.js";
import type { RobotsDecision, SafeFetcher } from "./types.js";

interface RobotsRule {
  directive: "allow" | "disallow";
  pattern: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

interface CachedPolicy {
  expiresAtMs: number;
  fetchedAt: string;
  checksum: string | null;
  groups: RobotsGroup[];
  sitemapUrls: string[];
  fetchState: "available" | "not_published" | "failed";
}

function parseRobots(text: string): { groups: RobotsGroup[]; sitemapUrls: string[] } {
  const groups: RobotsGroup[] = [];
  const sitemapUrls: string[] = [];
  let current: RobotsGroup | null = null;
  let rulesStarted = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const directive = line.slice(0, separator).trim().toLocaleLowerCase("en-US");
    const value = line.slice(separator + 1).trim();
    if (directive === "sitemap" && value) {
      sitemapUrls.push(value);
      continue;
    }
    if (directive === "user-agent") {
      if (!value) continue;
      if (!current || rulesStarted) {
        current = { agents: [], rules: [] };
        groups.push(current);
        rulesStarted = false;
      }
      current.agents.push(value.toLocaleLowerCase("en-US"));
      continue;
    }
    if ((directive === "allow" || directive === "disallow") && current) {
      rulesStarted = true;
      if (directive === "disallow" && value === "") continue;
      current.rules.push({ directive, pattern: value || "/" });
    }
  }
  return { groups, sitemapUrls: [...new Set(sitemapUrls)].sort() };
}

function agentScore(pattern: string, crawlerToken: string): number {
  if (pattern === "*") return 1;
  return crawlerToken.toLocaleLowerCase("en-US").startsWith(pattern) ? pattern.length + 1 : 0;
}

function ruleMatches(pattern: string, path: string): boolean {
  const endAnchored = pattern.endsWith("$");
  const withoutEnd = endAnchored ? pattern.slice(0, -1) : pattern;
  const source = withoutEnd
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${endAnchored ? "$" : ""}`).test(path);
}

function matchingRule(groups: RobotsGroup[], path: string, crawlerToken: string): RobotsRule | null {
  const scored = groups.map((group) => ({
    group,
    score: Math.max(0, ...group.agents.map((agent) => agentScore(agent, crawlerToken))),
  }));
  const bestAgentScore = Math.max(0, ...scored.map(({ score }) => score));
  if (bestAgentScore === 0) return null;
  const matches = scored
    .filter(({ score }) => score === bestAgentScore)
    .flatMap(({ group }) => group.rules)
    .filter((rule) => ruleMatches(rule.pattern, path))
    .sort((left, right) => {
      const length = right.pattern.replace(/[*$]/g, "").length - left.pattern.replace(/[*$]/g, "").length;
      if (length !== 0) return length;
      if (left.directive !== right.directive) return left.directive === "allow" ? -1 : 1;
      return left.pattern.localeCompare(right.pattern);
    });
  return matches[0] ?? null;
}

/**
 * Robots policy: 404/410 means no policy was published and permits the bounded
 * crawl. Any policy denial is absolute. Network, authentication, parsing-boundary,
 * or 5xx failure is fail-closed for every page; blocked content is never later
 * interpreted as evidence of absence. Policies are cached for an explicit TTL.
 */
export class RobotsPolicyService {
  readonly #fetcher: SafeFetcher;
  readonly #ttlMs: number;
  readonly #now: () => Date;
  readonly #cache = new Map<string, CachedPolicy>();

  constructor(options: { fetcher: SafeFetcher; ttlMs?: number; now?: () => Date }) {
    this.#fetcher = options.fetcher;
    this.#ttlMs = options.ttlMs ?? 86_400_000;
    this.#now = options.now ?? (() => new Date());
    if (!Number.isInteger(this.#ttlMs) || this.#ttlMs < 1_000 || this.#ttlMs > 604_800_000) {
      throw new Error("Robots TTL must be between one second and seven days");
    }
  }

  async #load(origin: string, signal?: AbortSignal): Promise<CachedPolicy> {
    const now = this.#now();
    const cached = this.#cache.get(origin);
    if (cached && cached.expiresAtMs > now.getTime()) return cached;
    const robotsUrl = new URL("/robots.txt", origin).href;
    const result = await this.#fetcher.fetch({ url: robotsUrl, signal });
    let policy: CachedPolicy;
    if (!result.ok || result.status >= 500 || result.status === 401 || result.status === 403) {
      policy = {
        expiresAtMs: now.getTime() + this.#ttlMs,
        fetchedAt: result.fetchedAt,
        checksum: result.ok ? result.contentChecksum : null,
        groups: [],
        sitemapUrls: [],
        fetchState: "failed",
      };
    } else if (result.status === 404 || result.status === 410) {
      policy = {
        expiresAtMs: now.getTime() + this.#ttlMs,
        fetchedAt: result.fetchedAt,
        checksum: result.contentChecksum,
        groups: [],
        sitemapUrls: [],
        fetchState: "not_published",
      };
    } else {
      const parsed = parseRobots(result.body);
      policy = {
        expiresAtMs: now.getTime() + this.#ttlMs,
        fetchedAt: result.fetchedAt,
        checksum: result.contentChecksum,
        groups: parsed.groups,
        sitemapUrls: parsed.sitemapUrls,
        fetchState: "available",
      };
    }
    this.#cache.set(origin, policy);
    return policy;
  }

  async decide(pageUrl: string, signal?: AbortSignal): Promise<RobotsDecision> {
    const page = new URL(pageUrl);
    const origin = page.origin;
    const policy = await this.#load(origin, signal);
    const expiresAt = new Date(policy.expiresAtMs).toISOString();
    const base = {
      origin,
      robotsUrl: new URL("/robots.txt", origin).href,
      fetchedAt: policy.fetchedAt,
      expiresAt,
      contentChecksum: policy.checksum,
      sitemapUrls: policy.sitemapUrls,
    };
    if (policy.fetchState === "failed") {
      return { ...base, status: "unavailable", reason: "fetch_failed", matchedRule: null };
    }
    if (policy.fetchState === "not_published") {
      return { ...base, status: "allowed", reason: "not_published", matchedRule: null };
    }
    const rule = matchingRule(policy.groups, `${page.pathname}${page.search}`, RESEARCH_CRAWLER_TOKEN);
    if (!rule) return { ...base, status: "allowed", reason: "no_matching_rule", matchedRule: null };
    return {
      ...base,
      status: rule.directive === "allow" ? "allowed" : "denied",
      reason: rule.directive === "allow" ? "matched_allow" : "matched_disallow",
      matchedRule: rule.pattern,
    };
  }

  get cacheSize(): number {
    return this.#cache.size;
  }
}
