import BetterSqlite3 from "better-sqlite3";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { POOL_SERVICE_ICP_MODEL_VERSION } from "../src/lead-engine/assessment/batch-runner.js";
import { createCallingQueueRepository } from "../src/lead-engine/ranking/queue-repository.js";
import { CALLABLE_EVIDENCE_REASONS, rankQueueCandidate } from "../src/lead-engine/ranking/ranker.js";
import {
  CALLING_QUEUE_VERSION,
  POOL_SERVICE_QUEUE_FRESHNESS_POLICY_VERSION,
  POOL_SERVICE_RANKING_MODEL_VERSION,
} from "../src/lead-engine/ranking/pool-service-ranking-model.js";
import type { CallingQueueConstraints } from "../src/lead-engine/ranking/types.js";
import type { SqliteDatabase } from "../src/lead-engine/db/database.js";

/**
 * Read-only quality inspection of a retained lead batch.
 *
 * Opens the artifact read-only and never writes, never relabels, and never
 * prints a business name, domain, phone, email, or address. Every lead is
 * referred to by an anonymised short label derived from its persisted id, and
 * every quality judgement is reported as a boolean or a count.
 *
 * The callable check is not a re-implementation: it reloads each candidate
 * through the production calling-queue repository and re-runs the production
 * ranker, so a row can only be reported callable if the real gate says so.
 */

export const INSPECTION_VERSION = "pool-lead-batch-inspection-1.0.0" as const;

export interface LeadQualityRow {
  readonly label: string;
  readonly market: string;
  readonly score: number;
  readonly result: string;
  readonly disposition: string;
  readonly priorityScore: number | null;
  readonly priorityBand: string;
  /** Assessed site identity corroborated with the provider business identity. */
  readonly correctBusiness: boolean;
  /** Pool-service fit established by provider category or observed service work. */
  readonly correctNiche: boolean;
  /** Persisted location subdivision matches the market the lead was found in. */
  readonly geographyMatches: boolean;
  /** A phone was observed on the assessed website itself, for this assessment. */
  readonly directPhoneObserved: boolean;
  /** Shares a canonical host or a normalised phone with an earlier lead. */
  readonly duplicateOfEarlier: boolean;
  /** No pool-service evidence of any kind: a candidate false positive. */
  readonly obviousFalsePositive: boolean;
  readonly callableGateMissing: ReadonlyArray<string>;
}

export interface InspectionReport {
  readonly version: typeof INSPECTION_VERSION;
  readonly databasePath: string;
  readonly totals: Readonly<Record<string, number>>;
  readonly buckets: Readonly<Record<string, number>>;
  readonly callableVerification: Readonly<Record<string, number>>;
  readonly sample: Readonly<{
    size: number;
    correctBusinessRate: number;
    correctNicheRate: number;
    geographyCorrectRate: number;
    directPhoneRate: number;
    duplicateRate: number;
    falsePositiveRate: number;
  }>;
  readonly sampleRows: ReadonlyArray<LeadQualityRow>;
  readonly marketDistribution: Readonly<Record<string, number>>;
}

function label(id: string): string {
  return `L${createHash("sha256").update(id).digest("hex").slice(0, 8)}`;
}

function normalisedPhoneDigits(value: string): string {
  const digits = value.replace(/\D+/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
  } catch {
    return url.toLocaleLowerCase("en-US");
  }
}

function constraints(coverageKeys: ReadonlyArray<string>, generatedAt: string): CallingQueueConstraints {
  return {
    queueVersion: CALLING_QUEUE_VERSION,
    rankingModelVersion: POOL_SERVICE_RANKING_MODEL_VERSION,
    niche: "pool_service",
    scope: { kind: "coverage_keys", coverageKeys: [...coverageKeys] },
    maximumCallable: 300,
    maximumReview: 400,
    minimumQualificationScore: 0,
    minimumPriorityScore: 0,
    acceptedQualificationResults: ["qualified"],
    qualificationModelVersion: POOL_SERVICE_ICP_MODEL_VERSION,
    freshnessPolicyVersion: POOL_SERVICE_QUEUE_FRESHNESS_POLICY_VERSION,
    includedContactRoutes: ["phone", "email", "form"],
    contactPolicy: "require_route",
    generatedAt,
  };
}

interface LeadRow {
  businessId: string;
  businessName: string;
  assessmentId: string;
  identityState: string;
  canonicalUrl: string | null;
  sourceUrl: string;
  score: number | null;
  result: string | null;
  disposition: string | null;
  priorityScore: number | null;
  priorityBand: string | null;
  locationGeography: string | null;
}

export function inspectPoolLeadBatch(input: {
  databasePath: string;
  sampleSize?: number;
}): InspectionReport {
  const database = new BetterSqlite3(input.databasePath, {
    readonly: true, fileMustExist: true,
  }) as unknown as SqliteDatabase;
  try {
    const sampleSize = input.sampleSize ?? 25;
    const rows = database.prepare(`
      SELECT b.id AS businessId, b.canonical_name AS businessName,
             a.id AS assessmentId, a.identity_state AS identityState,
             a.canonical_homepage_url AS canonicalUrl, a.source_website_url AS sourceUrl,
             q.total_score AS score, q.icp_result AS result,
             e.disposition AS disposition, e.priority_score AS priorityScore,
             e.priority_band AS priorityBand,
             (SELECT upper(l.country_code || '-' || l.region) FROM business_locations l
              WHERE l.business_id = b.id ORDER BY l.id LIMIT 1) AS locationGeography
      FROM businesses b
      JOIN website_assessments a ON a.business_id = b.id
      LEFT JOIN icp_qualification_evaluations q ON q.business_id = b.id
      LEFT JOIN lead_queue_entries e ON e.source_business_id = b.id
      ORDER BY COALESCE(e.priority_score, -1) DESC, b.id
    `).all() as LeadRow[];

    const coverageKeys = (database.prepare(`
      SELECT DISTINCT coverage_key FROM coverage_cells ORDER BY coverage_key
    `).all() as Array<{ coverage_key: string }>).map((row) => row.coverage_key);
    const generatedAt = (database.prepare(`
      SELECT generated_at AS generatedAt FROM lead_queue_snapshots
      ORDER BY generated_at DESC LIMIT 1
    `).get() as { generatedAt: string } | undefined)?.generatedAt
      ?? new Date().toISOString();

    // Re-rank through the production repository and ranker: the callable verdict
    // is the real gate's, not this script's.
    const loaded = createCallingQueueRepository(database).loadCandidates(POOL_SERVICE_ICP_MODEL_VERSION);
    const rankedByBusiness = new Map(loaded.map((candidate) => [
      candidate.businessId,
      rankQueueCandidate(candidate, constraints(coverageKeys, generatedAt)),
    ]));

    const phoneStatement = database.prepare(`
      SELECT o.displayed_value AS value FROM website_contact_observations o
      WHERE o.assessment_id = ? AND o.contact_kind = 'phone' ORDER BY o.id
    `);
    const serviceStatement = database.prepare(`
      SELECT s.basis AS basis, s.evidence_state AS state
      FROM service_evidence s WHERE s.assessment_id = ?
    `);
    const marketStatement = database.prepare(`
      SELECT subdivision_code AS subdivision FROM coverage_cells
      WHERE coverage_key = ? LIMIT 1
    `);
    const coverageStatement = database.prepare(`
      SELECT value FROM business_identifiers
      WHERE business_id = ? AND scheme = 'discovery_coverage_cell' ORDER BY id LIMIT 1
    `);

    const seenHosts = new Set<string>();
    const seenPhones = new Set<string>();
    const marketDistribution: Record<string, number> = {};
    const buckets: Record<string, number> = {
      callable: 0, review_required: 0, insufficient_evidence: 0,
      disqualified: 0, not_eligible: 0, other: 0, not_queued: 0,
    };
    const quality: LeadQualityRow[] = [];

    for (const row of rows) {
      const host = hostOf(row.canonicalUrl ?? row.sourceUrl);
      const phones = (phoneStatement.all(row.assessmentId) as Array<{ value: string }>)
        .map((entry) => normalisedPhoneDigits(entry.value))
        .filter((digits) => digits.length === 10);
      const services = serviceStatement.all(row.assessmentId) as Array<{ basis: string; state: string }>;
      const positiveService = services.some((entry) => entry.state === "positive");
      const providerCategory = services.some((entry) =>
        entry.basis === "provider_category" && entry.state === "positive");
      const coverageValue = (coverageStatement.get(row.businessId) as { value: string } | undefined)?.value ?? "";
      const coverageKey = coverageValue.split("|")[0] ?? "";
      const marketSubdivision = coverageKey
        ? (marketStatement.get(coverageKey) as { subdivision: string | null } | undefined)?.subdivision ?? null
        : null;
      const market = marketSubdivision ?? "unknown";
      marketDistribution[market] = (marketDistribution[market] ?? 0) + 1;

      const disposition = row.disposition ?? "not_queued";
      buckets[disposition] = (buckets[disposition] ?? 0) + 1;

      const duplicate = seenHosts.has(host) || phones.some((digits) => seenPhones.has(digits));
      seenHosts.add(host);
      for (const digits of phones) seenPhones.add(digits);

      const ranked = rankedByBusiness.get(row.businessId);
      const missing = (ranked?.reasons ?? [])
        .map((reason) => reason.code)
        .filter((code) => code.startsWith("callable_evidence_"));

      quality.push({
        label: label(row.businessId),
        market,
        score: row.score ?? 0,
        result: row.result ?? "not_evaluated",
        disposition,
        priorityScore: row.priorityScore,
        priorityBand: row.priorityBand ?? "",
        correctBusiness: row.identityState === "agrees",
        correctNiche: positiveService || providerCategory,
        // The persisted provider location must sit in the subdivision of the cell
        // the lead was actually discovered in.
        geographyMatches: row.locationGeography !== null && marketSubdivision !== null
          ? row.locationGeography === `US-${marketSubdivision}`
          : false,
        directPhoneObserved: phones.length > 0,
        duplicateOfEarlier: duplicate,
        obviousFalsePositive: !positiveService && !providerCategory,
        callableGateMissing: Object.freeze(missing),
      });
    }

    const sample = quality.slice(0, sampleSize);
    const rate = (predicate: (row: LeadQualityRow) => boolean): number =>
      sample.length === 0 ? 0 : Number((sample.filter(predicate).length / sample.length).toFixed(4));

    const callableRows = quality.filter((row) => row.disposition === "callable");
    const callableConfirmed = callableRows.filter((row) => {
      const ranked = rankedByBusiness.get(
        rows.find((entry) => label(entry.businessId) === row.label)?.businessId ?? "",
      );
      return ranked?.disposition === "callable";
    });

    return {
      version: INSPECTION_VERSION,
      databasePath: input.databasePath,
      totals: {
        businesses: rows.length,
        withAssessment: rows.length,
        withEvaluation: rows.filter((row) => row.result !== null).length,
        withQueueEntry: rows.filter((row) => row.disposition !== null).length,
        distinctHosts: new Set(rows.map((row) => hostOf(row.canonicalUrl ?? row.sourceUrl))).size,
        coverageCells: coverageKeys.length,
      },
      buckets: Object.freeze(buckets),
      callableVerification: {
        callableRows: callableRows.length,
        reRankedCallable: callableConfirmed.length,
        callableMissingEvidence: callableRows.filter((row) => row.callableGateMissing.length > 0).length,
        callableWithoutDirectPhone: callableRows.filter((row) => !row.directPhoneObserved).length,
        callableWithoutIdentityAgreement: callableRows.filter((row) => !row.correctBusiness).length,
        callableWithoutNicheEvidence: callableRows.filter((row) => !row.correctNiche).length,
        callableOutsideMarket: callableRows.filter((row) => !row.geographyMatches).length,
        callableDuplicates: callableRows.filter((row) => row.duplicateOfEarlier).length,
      },
      sample: Object.freeze({
        size: sample.length,
        correctBusinessRate: rate((row) => row.correctBusiness),
        correctNicheRate: rate((row) => row.correctNiche),
        geographyCorrectRate: rate((row) => row.geographyMatches),
        directPhoneRate: rate((row) => row.directPhoneObserved),
        duplicateRate: rate((row) => row.duplicateOfEarlier),
        falsePositiveRate: rate((row) => row.obviousFalsePositive),
      }),
      sampleRows: Object.freeze(sample),
      marketDistribution: Object.freeze(marketDistribution),
    };
  } finally {
    database.close();
  }
}

function main(): void {
  const databasePath = process.argv[2];
  if (!databasePath || !path.isAbsolute(databasePath)) {
    throw new Error("Inspection requires an absolute retained database path");
  }
  const report = inspectPoolLeadBatch({ databasePath });
  // Anonymised labels, booleans, counts, and rates only.
  console.log(JSON.stringify(report, null, 2));
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) main();
