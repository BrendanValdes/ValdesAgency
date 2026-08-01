import type { CrawlResult } from "../crawl/types.js";
import type { BusinessIdentityEvidence } from "../extraction/business-identity.js";
import { identityAgreement } from "../extraction/business-identity.js";

export type OperationalEvidenceStatus = "positive" | "negative" | "ambiguous" | "blocked" | "unavailable";

export interface OperationalEvidence {
  kind:
    | "domain_resolves"
    | "https_works"
    | "homepage_usable"
    | "identity_agreement"
    | "contact_consistency"
    | "parked"
    | "placeholder"
    | "closed"
    | "moved"
    | "different_business_redirect"
    | "content_unavailable";
  status: OperationalEvidenceStatus;
  detail: string;
}

export interface BusinessOperationalAssessment {
  evidence: ReadonlyArray<OperationalEvidence>;
  identityState: "agrees" | "conflicts" | "ambiguous" | "unavailable";
  reviewRequired: boolean;
}

export function assessBusinessOperationalEvidence(input: {
  expectedBusinessName: string;
  crawl: CrawlResult;
  identity: BusinessIdentityEvidence | null;
  contactConsistency?: "agrees" | "conflicts" | "ambiguous" | "unavailable";
}): BusinessOperationalAssessment {
  const homepage = input.crawl.pages[0];
  const fetch = homepage?.fetch;
  const identityState = input.identity
    ? identityAgreement(input.expectedBusinessName, input.identity.names)
    : "unavailable";
  const evidence: OperationalEvidence[] = [
    {
      kind: "domain_resolves",
      status: fetch?.ok ? "positive" : homepage?.inspectionStatus === "blocked" ? "blocked" : "unavailable",
      detail: fetch?.ok ? "A permitted destination returned an HTTP response" : "No permitted HTTP response established domain availability",
    },
    {
      kind: "https_works",
      status: fetch?.ok && new URL(fetch.finalUrl).protocol === "https:" ? "positive" : fetch?.ok ? "negative" : "unavailable",
      detail: fetch?.ok ? new URL(fetch.finalUrl).protocol : "not observed",
    },
    {
      kind: "homepage_usable",
      status: homepage?.inspectionStatus === "successful" ? "positive" : homepage?.inspectionStatus === "blocked" ? "blocked" : "unavailable",
      detail: homepage?.inspectionStatus ?? "not_checked",
    },
    { kind: "identity_agreement", status: identityState === "agrees" ? "positive" : identityState === "conflicts" ? "negative" : identityState, detail: identityState },
    {
      kind: "contact_consistency",
      status: input.contactConsistency === "agrees" ? "positive" : input.contactConsistency === "conflicts" ? "negative" : input.contactConsistency ?? "unavailable",
      detail: input.contactConsistency ?? "unavailable",
    },
  ];
  if (input.identity?.parked) evidence.push({ kind: "parked", status: "negative", detail: "Explicit parked-domain language was observed" });
  if (input.identity?.placeholderOnly) evidence.push({ kind: "placeholder", status: "ambiguous", detail: "Only placeholder language was observed in the bounded inspection" });
  if (input.identity?.explicitlyClosed) evidence.push({ kind: "closed", status: "negative", detail: "The page explicitly states that the business is closed" });
  if (input.identity?.explicitlyMoved) evidence.push({ kind: "moved", status: "ambiguous", detail: "The page explicitly states that the business moved" });
  const finalOrigin = fetch?.ok ? new URL(fetch.finalUrl).origin : null;
  const requestedOrigin = input.crawl.canonicalHomepage ? new URL(input.crawl.canonicalHomepage).origin : null;
  if (finalOrigin && requestedOrigin && finalOrigin !== requestedOrigin && identityState === "conflicts") {
    evidence.push({ kind: "different_business_redirect", status: "negative", detail: "Redirected content conflicts with the discovered business identity" });
  }
  if (!homepage || homepage.inspectionStatus !== "successful") {
    evidence.push({ kind: "content_unavailable", status: homepage?.inspectionStatus === "blocked" ? "blocked" : "unavailable", detail: "Homepage content was not successfully inspected" });
  }
  return {
    evidence,
    identityState,
    reviewRequired: identityState === "conflicts" || (input.contactConsistency ?? "unavailable") === "conflicts" || evidence.some((item) => item.kind === "different_business_redirect"),
  };
}
