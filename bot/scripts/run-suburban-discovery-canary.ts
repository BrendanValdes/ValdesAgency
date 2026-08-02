import path from "node:path";
import { pathToFileURL } from "node:url";
import { selectAssessableCandidates } from "../src/lead-engine/assessment/candidate-gate.js";
import {
  discoverSuburbanPhoenixCandidates,
  SUBURBAN_CANARY_LIMITS,
  SUBURBAN_MAX_CELLS,
  SUBURBAN_TARGET_WEBSITE_CANDIDATES,
} from "./overture-suburban-candidates.js";

/**
 * Aggregate-only report for the bounded suburban discovery canary. Emits counts,
 * hashed coverage-cell ids, and budget figures — never a business name, domain,
 * phone, email, or address.
 */
export interface SuburbanCanaryReport {
  readonly ran: boolean;
  readonly releaseId: string;
  readonly destinationsContacted: ReadonlyArray<string>;
  readonly cellsPlanned: number;
  readonly cellsQueried: number;
  readonly perCell: ReadonlyArray<{ coverageCellSafeId: string; envelopes: number; eligible: number }>;
  readonly envelopesConsidered: number;
  readonly acceptedCandidates: number;
  readonly eligibleWebsiteCandidates: number;
  readonly duplicatesAcrossCells: number;
  readonly gateBlockedCounts: Readonly<Record<string, number>>;
  readonly requests: number;
  readonly downloadedBytes: number;
  readonly processedBytes: number;
  readonly rowsConsidered: number;
  readonly elapsedMs: number;
  readonly stopReason: string;
  readonly budgetRemaining: Readonly<Record<string, number>>;
  readonly aggregateVerdict: string;
  readonly safetyWarnings: ReadonlyArray<string>;
}

export async function runSuburbanDiscoveryCanary(): Promise<SuburbanCanaryReport> {
  const outcome = await discoverSuburbanPhoenixCandidates();
  const eligible = outcome.summary.eligibleWebsiteCandidates.length;
  return {
    ran: true,
    releaseId: outcome.releaseId,
    destinationsContacted: outcome.destinationsContacted,
    cellsPlanned: outcome.summary.cellsPlanned,
    cellsQueried: outcome.summary.cellsQueried,
    perCell: outcome.summary.perCell,
    envelopesConsidered: outcome.summary.envelopesConsidered,
    acceptedCandidates: outcome.summary.acceptedCandidates,
    eligibleWebsiteCandidates: eligible,
    duplicatesAcrossCells: outcome.summary.duplicatesAcrossCells,
    gateBlockedCounts: outcome.summary.gateBlockedCounts,
    requests: outcome.requests,
    downloadedBytes: outcome.downloadedBytes,
    processedBytes: outcome.processedBytes,
    rowsConsidered: outcome.rowsConsidered,
    elapsedMs: outcome.elapsedMs,
    stopReason: outcome.summary.stopReason,
    budgetRemaining: outcome.budgetRemaining,
    aggregateVerdict: eligible > 0 ? "completed" : "completed_no_eligible_website_candidate",
    safetyWarnings: [],
  };
}

async function main(): Promise<void> {
  const report = await runSuburbanDiscoveryCanary();
  console.log(JSON.stringify(report));
  if (report.eligibleWebsiteCandidates === 0) process.exitCode = 2;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  void main().catch((error: unknown) => {
    console.error(JSON.stringify({
      aggregateVerdict: "canary_rejected",
      safetyWarnings: [error instanceof Error ? error.message : "unknown_canary_error"],
      limits: {
        maxCells: SUBURBAN_MAX_CELLS,
        targetWebsiteCandidates: SUBURBAN_TARGET_WEBSITE_CANDIDATES,
        maxAcceptedCandidates: SUBURBAN_CANARY_LIMITS.maxCandidates,
      },
      gateStillEnforced: typeof selectAssessableCandidates === "function",
    }));
    process.exitCode = 1;
  });
}
