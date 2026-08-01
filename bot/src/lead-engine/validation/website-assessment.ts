import type { BrowserRenderResult } from "../crawl/fetchers/browser-renderer.js";
import type { CrawlResult, EvidenceValue } from "../crawl/types.js";
import type { ConversionFeature, ConversionSignal } from "../extraction/conversion.js";
import type { ClaimState, ProvenanceSourceClass } from "../domain/provenance.js";

export type FeatureAssessmentStatus =
  | "present"
  | "absent_after_successful_inspection"
  | "ambiguous"
  | "blocked"
  | "unavailable"
  | "not_checked"
  | "stale";

export interface ConversionFeatureAssessment {
  feature: ConversionFeature;
  status: FeatureAssessmentStatus;
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
  evidence: ReadonlyArray<EvidenceValue<string>>;
  assessedAt: string;
  policyVersion: string;
}

export const WEBSITE_ASSESSMENT_POLICY_VERSION = "website-assessment-1.0.0";

export const CONVERSION_FEATURES: ReadonlyArray<ConversionFeature> = [
  "click_to_call",
  "contact_form",
  "estimate_request",
  "booking",
  "primary_cta",
  "contact_route",
  "mobile_viewport",
  "https",
  "valid_page_response",
  "service_route",
];

export function assessConversionFeatures(input: {
  crawl: CrawlResult;
  signals: ReadonlyArray<ConversionSignal>;
  browser: BrowserRenderResult | { status: "not_checked" };
  assessedAt: string;
  freshUntil: string;
}): ConversionFeatureAssessment[] {
  const now = Date.parse(input.assessedAt);
  const stale = !Number.isFinite(now) || Date.parse(input.freshUntil) <= now;
  const hasBlocked = input.crawl.pages.some((page) => page.inspectionStatus === "blocked") || input.crawl.robots.status !== "allowed";
  const hasFailed = input.crawl.pages.some((page) => ["failed", "unavailable"].includes(page.inspectionStatus));
  return CONVERSION_FEATURES.map((feature) => {
    const evidence = input.signals.filter((signal) => signal.feature === feature).map((signal) => signal.evidence);
    let status: FeatureAssessmentStatus;
    if (evidence.length > 0) status = stale ? "stale" : "present";
    else if (stale) status = "stale";
    else if (hasBlocked) status = "blocked";
    else if (hasFailed) status = "unavailable";
    else if (input.browser.status === "unavailable" || input.browser.status === "failed") status = "unavailable";
    else if (!input.crawl.complete) status = input.crawl.pages.length === 0 ? "not_checked" : "ambiguous";
    else status = "absent_after_successful_inspection";
    const claimState: ClaimState = evidence.length > 0
      ? evidence[0]?.claimState ?? "observed"
      : status === "absent_after_successful_inspection"
        ? "observed"
        : status === "stale"
          ? "stale"
          : "unknown";
    return {
      feature,
      status,
      sourceClass: evidence[0]?.sourceClass ?? input.crawl.sourceClass,
      claimState,
      evidence,
      assessedAt: input.assessedAt,
      policyVersion: WEBSITE_ASSESSMENT_POLICY_VERSION,
    };
  });
}
