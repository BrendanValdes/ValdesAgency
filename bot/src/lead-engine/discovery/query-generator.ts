import type { NicheConfiguration } from "../config/niches.js";
import { nicheConfigurationHash } from "../config/niches.js";
import type { CoverageCell } from "../geography/types.js";
import { stableId } from "../shared/stable.js";

export interface DiscoveryQuery {
  queryId: string;
  queryVersion: string;
  nicheId: string;
  configurationVersion: string;
  configurationHash: string;
  coverageKey: string;
  text: string;
  negativeTerms: ReadonlyArray<string>;
}

function unique(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value.trim().replace(/\s+/g, " "));
  }
  return result;
}

export function generateDiscoveryQueries(input: {
  niche: NicheConfiguration;
  geography: CoverageCell;
  queryVersion: string;
}): DiscoveryQuery[] {
  if (!input.niche.enabled) {
    throw new Error(`Niche ${input.niche.id} is disabled pending its benchmark gate`);
  }
  const configHash = nicheConfigurationHash(input.niche);
  const negativeTerms = unique([
    ...input.niche.negative_keywords,
    ...input.niche.excluded_adjacent_industries,
  ]);
  const negativeClause = negativeTerms.map((term) => `-${JSON.stringify(term)}`).join(" ");
  return unique([...input.niche.search_terms, ...input.niche.service_synonyms]).map((term) => {
    const text = `${term} ${input.geography.label}${negativeClause ? ` ${negativeClause}` : ""}`;
    return {
      queryId: stableId("query", {
        queryVersion: input.queryVersion,
        nicheId: input.niche.id,
        configurationHash: configHash,
        coverageKey: input.geography.coverageKey,
        text,
      }),
      queryVersion: input.queryVersion,
      nicheId: input.niche.id,
      configurationVersion: input.niche.configuration_version,
      configurationHash: configHash,
      coverageKey: input.geography.coverageKey,
      text,
      negativeTerms,
    };
  });
}

